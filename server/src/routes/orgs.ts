import type { FastifyInstance } from 'fastify';
import { getState, updateState } from '../state/store.js';
import { readLocalOrgs } from '../sf/auth.js';
import { cached, invalidateCache, peek } from '../sf/cache.js';
import { authProvider, cli, normalizeOrg, readFast, readSignal, safeId, safeOrg, sfApi, stale, ttl } from './shared.js';
import type { SfOrg } from '../types.js';

/** The debug-log columns the logs page renders, matching what `sf apex list log` returns. */
const APEX_LOG_QUERY =
  'SELECT Id, LogUser.Name, Operation, Application, Status, DurationMilliseconds, StartTime, LogLength, Request ' +
  'FROM ApexLog ORDER BY StartTime DESC LIMIT 200';

const INSTALLED_PACKAGE_QUERY =
  'SELECT SubscriberPackageId, SubscriberPackage.Name, SubscriberPackage.NamespacePrefix, ' +
  'SubscriberPackageVersion.Id, SubscriberPackageVersion.Name, SubscriberPackageVersion.MajorVersion, ' +
  'SubscriberPackageVersion.MinorVersion, SubscriberPackageVersion.PatchVersion, SubscriberPackageVersion.BuildNumber ' +
  'FROM InstalledSubscriberPackage';

/** Reshapes a Tooling API row into the flat record the packages page already reads. */
function toInstalledPackage(record: any) {
  const version = record.SubscriberPackageVersion ?? {};
  const parts = [version.MajorVersion, version.MinorVersion, version.PatchVersion, version.BuildNumber].filter(
    (part) => part !== undefined && part !== null,
  );
  return {
    SubscriberPackageId: record.SubscriberPackageId,
    SubscriberPackageName: record.SubscriberPackage?.Name,
    SubscriberPackageNamespace: record.SubscriberPackage?.NamespacePrefix,
    SubscriberPackageVersionId: version.Id,
    SubscriberPackageVersionName: version.Name,
    SubscriberPackageVersionNumber: parts.length ? parts.join('.') : undefined,
  };
}

export async function orgRoutes(app: FastifyInstance) {
  /** The authoritative list, from the CLI. Cached so it is normally answered from memory. */
  const orgsFromCli = () =>
    cached<SfOrg[]>('orgs:cli-list', { ttlMs: ttl.orgs, staleMs: 300_000 }, async () => {
      const result = await cli.execute(['org', 'list'], { timeoutMs: 120_000 });
      return [...(result.nonScratchOrgs || []), ...(result.scratchOrgs || [])].map(normalizeOrg);
    });

  /*
   * `sf org list` needs a full CLI boot — 4.9s measured — to report what is already sitting in
   * plaintext in the CLI's own auth files. So the first request answers from disk in about
   * 12ms and starts the CLI listing behind the response; every later request is served from
   * that cached, authoritative copy. The org switcher paints immediately either way.
   */
  app.get('/api/orgs', async () => {
    const selectedOrg = getState().selectedOrg;
    if (peek<SfOrg[]>('orgs:cli-list')) return { orgs: await orgsFromCli(), selectedOrg };
    void orgsFromCli().catch(() => {});
    const local = await readLocalOrgs();
    if (local.length) return { orgs: local, selectedOrg };
    // Nothing on disk: the CLI is the only source, so it is worth waiting for.
    return { orgs: await orgsFromCli(), selectedOrg };
  });

  app.post<{ Body: { org: string } }>('/api/orgs/select', async (req) => {
    const org = safeOrg(req.body.org);
    updateState((draft) => { draft.selectedOrg = org; });
    return { selectedOrg: org };
  });

  app.post<{ Body: { environment: 'production' | 'sandbox'; alias?: string; setDefault?: boolean; setDevHub?: boolean; browser?: string } }>(
    '/api/orgs/authorize',
    async (req) => {
      const environment = req.body.environment;
      if (!['production', 'sandbox'].includes(environment)) throw new Error('Choose Production or Sandbox');
      const args = ['org', 'login', 'web', '--instance-url', environment === 'sandbox' ? 'https://test.salesforce.com' : 'https://login.salesforce.com'];
      if (req.body.alias) {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(req.body.alias)) {
          throw new Error('Alias must start with a letter and contain only letters, numbers, hyphens, or underscores');
        }
        args.push('--alias', req.body.alias);
      }
      if (req.body.setDefault) args.push('--set-default');
      if (req.body.setDevHub) args.push('--set-default-dev-hub');
      if (req.body.browser) {
        if (!['chrome', 'edge', 'firefox'].includes(req.body.browser)) throw new Error('Unsupported browser');
        args.push('--browser', req.body.browser);
      }
      await cli.execute(args, { timeoutMs: 10 * 60_000 });
      cli.invalidate('orgs:');
      invalidateCache('orgs:');
      // A newly authorized org may reuse a username whose token is already held.
      authProvider.reset();
      return { authorized: true };
    },
  );

  /*
   * Acquiring a token for the fast path already runs `org display`, so once any request has
   * touched this org the answer is in memory and costs nothing.
   */
  app.get<{ Params: { org: string } }>('/api/orgs/:org/info', async (request, reply) => {
    const org = safeOrg(request.params.org);
    return await readFast(
      async () => {
        const auth = await authProvider.auth(org);
        if (!auth) throw new Error('No cached credentials for this org');
        const known = (await readLocalOrgs()).find((candidate) => candidate.username === auth.username);
        return {
          id: known?.orgId,
          username: auth.username,
          instanceUrl: auth.instanceUrl,
          connectedStatus: 'Connected',
          apiVersion: auth.apiVersion,
          alias: known?.alias,
        };
      },
      async () => {
        const result = await cli.execute(['org', 'display', '--target-org', org], {
          signal: readSignal(request, reply),
          cache: { key: `orgs:${org}:info`, ttlMs: ttl.orgInfo },
        });
        return {
          id: result.id,
          username: result.username,
          instanceUrl: result.instanceUrl,
          connectedStatus: result.connectedStatus,
          apiVersion: result.apiVersion,
          alias: result.alias,
        };
      },
    );
  });

  app.post<{ Params: { org: string } }>('/api/orgs/:org/open', async (req) => {
    const org = safeOrg(req.params.org);
    return await readFast(
      async () => {
        // This is the same authenticated entry point `sf org open` builds, assembled from a
        // token that is normally already held — instant instead of a four-second CLI boot.
        const auth = await authProvider.auth(org);
        if (!auth) throw new Error('No cached credentials for this org');
        return { url: `${auth.instanceUrl}/secur/frontdoor.jsp?sid=${encodeURIComponent(auth.accessToken)}` };
      },
      async () => {
        // Every CliRunner call forces --json, and `sf org open --json` deliberately skips
        // launching a browser (it just returns the URL). --url-only makes that explicit; the
        // client opens the returned frontdoor URL itself, which is already authenticated.
        const result = await cli.execute(['org', 'open', '--target-org', org, '--url-only']);
        return { url: result.url as string };
      },
    );
  });

  app.get<{ Params: { org: string } }>('/api/orgs/:org/limits', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const signal = readSignal(request, reply);
    return await cached(`orgs:${org}:limits`, { ttlMs: ttl.limits, staleMs: stale.limits }, () =>
      readFast(
        // The REST shape is a keyed object; the limits page already normalizes either form.
        () => sfApi.limits(org, { signal }),
        () => cli.execute(['limits', 'api', 'display', '--target-org', org], { signal }),
      ),
    );
  });

  app.get<{ Params: { org: string } }>('/api/orgs/:org/packages', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const signal = readSignal(request, reply);
    const packages = await cached(`orgs:${org}:packages`, { ttlMs: ttl.packages, staleMs: stale.packages, persist: true }, () =>
      readFast(
        async () => (await sfApi.query(org, INSTALLED_PACKAGE_QUERY, { tooling: true, signal })).records.map(toInstalledPackage),
        () => cli.execute(['package', 'installed', 'list', '--target-org', org], { signal }),
      ),
    );
    return { packages };
  });

  app.get<{ Params: { org: string } }>('/api/orgs/:org/logs', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const signal = readSignal(request, reply);
    const logs = await readFast(
      async () => (await sfApi.query(org, APEX_LOG_QUERY, { tooling: true, signal })).records,
      () => cli.execute(['apex', 'list', 'log', '--target-org', org], { signal }),
    );
    return { logs };
  });

  app.get<{ Params: { org: string; id: string } }>('/api/orgs/:org/logs/:id', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const id = safeId(request.params.id, 'log ID');
    const signal = readSignal(request, reply);
    const log = await readFast(
      () => sfApi.apexLogBody(org, id, { signal }),
      () => cli.execute(['apex', 'get', 'log', '--log-id', id, '--target-org', org], { signal }),
    );
    return { log };
  });
}
