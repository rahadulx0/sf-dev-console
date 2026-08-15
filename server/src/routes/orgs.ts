import type { FastifyInstance } from 'fastify';
import { getState, updateState } from '../state/store.js';
import { cli, normalizeOrg, readSignal, safeId, safeOrg, ttl } from './shared.js';

export async function orgRoutes(app: FastifyInstance) {
  app.get('/api/orgs', async (request, reply) => {
    const result = await cli.execute(['org', 'list'], {
      signal: readSignal(request, reply),
      cache: { key: 'orgs:list', ttlMs: ttl.orgs },
    });
    const orgs = [...(result.nonScratchOrgs || []), ...(result.scratchOrgs || [])].map(normalizeOrg);
    return { orgs, selectedOrg: getState().selectedOrg };
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
      return { authorized: true };
    },
  );

  app.get<{ Params: { org: string } }>('/api/orgs/:org/info', async (request, reply) => {
    const org = safeOrg(request.params.org);
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
  });

  app.post<{ Params: { org: string } }>('/api/orgs/:org/open', async (req) => {
    // Every CliRunner call forces --json, and `sf org open --json` deliberately skips
    // launching a browser (it just returns the URL). --url-only makes that explicit; the
    // client opens the returned frontdoor URL itself, which is already authenticated.
    const result = await cli.execute(['org', 'open', '--target-org', safeOrg(req.params.org), '--url-only']);
    return { url: result.url as string };
  });

  app.get<{ Params: { org: string } }>('/api/orgs/:org/limits', async (request, reply) => {
    const org = safeOrg(request.params.org);
    return cli.execute(['limits', 'api', 'display', '--target-org', org], {
      signal: readSignal(request, reply),
      cache: { key: `orgs:${org}:limits`, ttlMs: ttl.limits },
    });
  });

  app.get<{ Params: { org: string } }>('/api/orgs/:org/packages', async (request, reply) => {
    const org = safeOrg(request.params.org);
    return {
      packages: await cli.execute(['package', 'installed', 'list', '--target-org', org], {
        signal: readSignal(request, reply),
        cache: { key: `orgs:${org}:packages`, ttlMs: ttl.packages },
      }),
    };
  });

  app.get<{ Params: { org: string } }>('/api/orgs/:org/logs', async (request, reply) => {
    return { logs: await cli.execute(['apex', 'list', 'log', '--target-org', safeOrg(request.params.org)], { signal: readSignal(request, reply) }) };
  });

  app.get<{ Params: { org: string; id: string } }>('/api/orgs/:org/logs/:id', async (request, reply) => {
    return {
      log: await cli.execute(
        ['apex', 'get', 'log', '--log-id', safeId(request.params.id, 'log ID'), '--target-org', safeOrg(request.params.org)],
        { signal: readSignal(request, reply) },
      ),
    };
  });
}
