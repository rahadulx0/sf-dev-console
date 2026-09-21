import type { FastifyInstance } from 'fastify';
import { cached } from '../sf/cache.js';
import { cli, cliFieldValue, readFast, readSignal, safeId, safeOrg, safeType, sfApi, stale, ttl } from './shared.js';

/** Salesforce returns `expr0` for an aggregate `count()`; `totalSize` carries it too. */
const countOf = (result: any) => result?.totalSize ?? result?.records?.[0]?.expr0 ?? 0;

export async function dataRoutes(app: FastifyInstance) {
  app.post<{ Body: { org: string; query: string; tooling?: boolean } }>('/api/query', async (request, reply) => {
    if (!request.body.query?.trim() || request.body.query.length > 100_000) throw new Error('Invalid query');
    const org = safeOrg(request.body.org);
    const tooling = !!request.body.tooling;
    const signal = readSignal(request, reply);
    /*
     * A malformed query is reported by the direct API in well under a second, and `readFast`
     * recognizes that as the org's real answer rather than replaying it through the CLI — so a
     * typo costs a fraction of a second instead of several.
     */
    return await readFast(
      () => sfApi.query(org, request.body.query, { tooling, signal, timeoutMs: 180_000 }),
      () => {
        const args = ['data', 'query', '--query', request.body.query, '--target-org', org];
        if (tooling) args.push('--use-tooling-api');
        return cli.execute(args, { timeoutMs: 180_000, signal });
      },
    );
  });

  app.post<{ Body: { org: string; sobject: string; recordId: string; tooling?: boolean } }>('/api/data/record', async (request, reply) => {
    const org = safeOrg(request.body.org);
    const sobject = safeType(request.body.sobject);
    const recordId = safeId(request.body.recordId, 'record ID');
    const tooling = !!request.body.tooling;
    const signal = readSignal(request, reply);
    return await readFast(
      () => sfApi.getRecord(org, sobject, recordId, { tooling, signal }),
      () => {
        const args = ['data', 'get', 'record', '--sobject', sobject, '--record-id', recordId, '--target-org', org];
        if (tooling) args.push('--use-tooling-api');
        return cli.execute(args, { timeoutMs: 120_000, signal });
      },
    );
  });

  app.post<{ Body: { org: string; sobject: string; recordId: string; changes: Record<string, unknown>; tooling?: boolean } }>(
    '/api/data/record/update',
    async (req) => {
      const org = safeOrg(req.body.org);
      const sobject = safeType(req.body.sobject);
      const recordId = safeId(req.body.recordId, 'record ID');
      const tooling = !!req.body.tooling;
      const entries = Object.entries(req.body.changes || {}).slice(0, 100);
      if (!entries.length) throw new Error('Change at least one field before saving');

      const describe = await describeSobject(org, sobject, tooling);
      const updateable = new Set((describe.fields || []).filter((f: any) => f.updateable).map((f: any) => f.name));
      for (const [field] of entries) if (!updateable.has(field)) throw new Error(`${field} is not updateable for this user`);

      return await readFast(
        async () => {
          // A REST PATCH answers 204 with no body; report the shape the CLI would have.
          await sfApi.updateRecord(org, sobject, recordId, Object.fromEntries(entries), { tooling });
          return { id: recordId, success: true, errors: [] };
        },
        () => {
          const values = entries.map(([field, value]) => `${safeType(field)}=${cliFieldValue(value)}`).join(' ');
          const args = ['data', 'update', 'record', '--sobject', sobject, '--record-id', recordId, '--values', values, '--target-org', org];
          if (tooling) args.push('--use-tooling-api');
          return cli.execute(args, { timeoutMs: 120_000 });
        },
      );
    },
  );

  app.post<{ Body: { org: string; sobject: string; recordIds: string[]; confirmation: string; tooling?: boolean } }>(
    '/api/data/records/delete',
    async (req) => {
      const org = safeOrg(req.body.org);
      const sobject = safeType(req.body.sobject);
      const tooling = !!req.body.tooling;
      const recordIds = [...new Set(req.body.recordIds || [])].slice(0, 50).map((id) => safeId(id, 'record ID'));
      if (!recordIds.length) throw new Error('Select at least one record');
      const expected = `DELETE ${recordIds.length} RECORDS FROM ${sobject}`;
      if (req.body.confirmation !== expected) throw new Error(`Confirmation must exactly match: ${expected}`);

      const deleted: string[] = [];
      const failed: { id: string; error: string }[] = [];
      /*
       * Deletions run one at a time on purpose: each is reported individually, and a partial
       * failure must name the record that failed. On the direct path each is a single HTTP
       * call rather than a CLI process, so 50 deletions no longer mean 50 Node boots.
       */
      for (const id of recordIds) {
        try {
          await readFast(
            () => sfApi.deleteRecord(org, sobject, id, { tooling }),
            () => {
              const args = ['data', 'delete', 'record', '--sobject', sobject, '--record-id', id, '--target-org', org];
              if (tooling) args.push('--use-tooling-api');
              return cli.execute(args, { timeoutMs: 120_000 });
            },
          );
          deleted.push(id);
        } catch (e) {
          failed.push({ id, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return { deleted, failed };
    },
  );

  app.get<{ Params: { org: string }; Querystring: { category?: string; tooling?: string } }>('/api/orgs/:org/objects', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const signal = readSignal(request, reply);

    if (request.query.tooling === 'true') {
      const soql = 'SELECT QualifiedApiName FROM EntityDefinition ORDER BY QualifiedApiName';
      const objects = await cached(
        `orgs:${org}:objects:tooling`,
        { ttlMs: ttl.objects, staleMs: stale.objects, persist: true },
        async () => {
          const result = await readFast(
            () => sfApi.query(org, soql, { tooling: true, signal, timeoutMs: 120_000 }),
            () => cli.execute(['data', 'query', '--query', soql, '--target-org', org, '--use-tooling-api'], { timeoutMs: 120_000, signal }),
          );
          return (result.records || []).map((record: any) => record.QualifiedApiName).filter(Boolean);
        },
      );
      return { objects };
    }

    const category = ['all', 'standard', 'custom'].includes((request.query.category || '').toLowerCase())
      ? request.query.category!.toLowerCase()
      : 'all';
    const objects = await cached(
      `orgs:${org}:objects:${category}`,
      { ttlMs: ttl.objects, staleMs: stale.objects, persist: true },
      () =>
        readFast(
          async () => {
            const result = await sfApi.globalDescribe(org, { signal });
            return (result?.sobjects ?? [])
              .filter((entry: any) => category === 'all' || (category === 'custom' ? entry.custom === true : entry.custom === false))
              .map((entry: any) => entry.name)
              .filter(Boolean)
              .sort((left: string, right: string) => left.localeCompare(right));
          },
          () => cli.execute(['sobject', 'list', '--sobject', category, '--target-org', org], { signal }),
        ),
    );
    return { objects };
  });

  app.get<{ Params: { org: string; name: string }; Querystring: { tooling?: string } }>('/api/orgs/:org/objects/:name', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const name = safeType(request.params.name);
    return { describe: await describeSobject(org, name, request.query.tooling === 'true', readSignal(request, reply)) };
  });

  app.post<{ Body: { org: string; objects: string[] } }>('/api/data/record-counts', async (request, reply) => {
    const org = safeOrg(request.body.org);
    const objects = (request.body.objects || []).slice(0, 25).map((x) => safeType(x));
    if (!objects.length) throw new Error('Select at least one object');
    const signal = readSignal(request, reply);

    return {
      counts: await readFast(
        /*
         * One composite request covers all 25 objects. Previously this was one `sf data query`
         * process per object, four at a time — around 25 seconds for a full selection against
         * roughly half a second here.
         */
        async () => {
          const paths = objects.map((object) => `/query?q=${encodeURIComponent(`SELECT count() FROM ${object}`)}`);
          const results = await sfApi.batchGet(org, paths, { signal });
          return objects.map((object, index) => {
            const entry = results[index];
            return { object, count: entry?.statusCode === 200 ? countOf(entry.result) : 0 };
          });
        },
        // The CLI runner caps how many of these actually run at once; see MAX_CONCURRENT.
        async () =>
          await Promise.all(
            objects.map(async (object) => {
              const result = await cli.execute(['data', 'query', '--query', `SELECT count() FROM ${object}`, '--target-org', org], {
                timeoutMs: 120_000,
                signal,
              });
              return { object, count: countOf(result) };
            }),
          ),
      ),
    };
  });
}

/**
 * Describes an object, shared by the object browser and the record editor's field validation.
 * Describes are large and change only when the schema does, so they are cached to disk and
 * served stale-while-revalidating.
 */
function describeSobject(org: string, sobject: string, tooling: boolean, signal?: AbortSignal) {
  return cached(
    `orgs:${org}:describe:${sobject}:${tooling ? 'tooling' : 'standard'}`,
    { ttlMs: ttl.describe, staleMs: stale.describe, persist: true },
    () =>
      readFast(
        () => sfApi.describe(org, sobject, { tooling, signal }),
        () => {
          const args = ['sobject', 'describe', '--sobject', sobject, '--target-org', org];
          if (tooling) args.push('--use-tooling-api');
          return cli.execute(args, { timeoutMs: 120_000, signal });
        },
      ),
  );
}
