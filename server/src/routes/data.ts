import type { FastifyInstance } from 'fastify';
import { cli, cliFieldValue, readSignal, safeId, safeOrg, safeType, ttl } from './shared.js';

export async function dataRoutes(app: FastifyInstance) {
  app.post<{ Body: { org: string; query: string; tooling?: boolean } }>('/api/query', async (request, reply) => {
    if (!request.body.query?.trim() || request.body.query.length > 100_000) throw new Error('Invalid query');
    const args = ['data', 'query', '--query', request.body.query, '--target-org', safeOrg(request.body.org)];
    if (request.body.tooling) args.push('--use-tooling-api');
    return cli.execute(args, { timeoutMs: 180_000, signal: readSignal(request, reply) });
  });

  app.post<{ Body: { org: string; sobject: string; recordId: string; tooling?: boolean } }>('/api/data/record', async (request, reply) => {
    const args = [
      'data', 'get', 'record',
      '--sobject', safeType(request.body.sobject),
      '--record-id', safeId(request.body.recordId, 'record ID'),
      '--target-org', safeOrg(request.body.org),
    ];
    if (request.body.tooling) args.push('--use-tooling-api');
    return cli.execute(args, { timeoutMs: 120_000, signal: readSignal(request, reply) });
  });

  app.post<{ Body: { org: string; sobject: string; recordId: string; changes: Record<string, unknown>; tooling?: boolean } }>(
    '/api/data/record/update',
    async (req) => {
      const org = safeOrg(req.body.org);
      const sobject = safeType(req.body.sobject);
      const recordId = safeId(req.body.recordId, 'record ID');
      const entries = Object.entries(req.body.changes || {}).slice(0, 100);
      if (!entries.length) throw new Error('Change at least one field before saving');
      const describeArgs = ['sobject', 'describe', '--sobject', sobject, '--target-org', org];
      if (req.body.tooling) describeArgs.push('--use-tooling-api');
      const describe = await cli.execute(describeArgs, {
        timeoutMs: 120_000,
        cache: { key: `orgs:${org}:describe:${sobject}:${req.body.tooling ? 'tooling' : 'standard'}`, ttlMs: ttl.describe },
      });
      const updateable = new Set((describe.fields || []).filter((f: any) => f.updateable).map((f: any) => f.name));
      for (const [field] of entries) if (!updateable.has(field)) throw new Error(`${field} is not updateable for this user`);
      const values = entries.map(([field, value]) => `${safeType(field)}=${cliFieldValue(value)}`).join(' ');
      const args = ['data', 'update', 'record', '--sobject', sobject, '--record-id', recordId, '--values', values, '--target-org', org];
      if (req.body.tooling) args.push('--use-tooling-api');
      return cli.execute(args, { timeoutMs: 120_000 });
    },
  );

  app.post<{ Body: { org: string; sobject: string; recordIds: string[]; confirmation: string; tooling?: boolean } }>(
    '/api/data/records/delete',
    async (req) => {
      const org = safeOrg(req.body.org);
      const sobject = safeType(req.body.sobject);
      const recordIds = [...new Set(req.body.recordIds || [])].slice(0, 50).map((id) => safeId(id, 'record ID'));
      if (!recordIds.length) throw new Error('Select at least one record');
      const expected = `DELETE ${recordIds.length} RECORDS FROM ${sobject}`;
      if (req.body.confirmation !== expected) throw new Error(`Confirmation must exactly match: ${expected}`);
      const deleted: string[] = [];
      const failed: { id: string; error: string }[] = [];
      for (const id of recordIds) {
        try {
          const args = ['data', 'delete', 'record', '--sobject', sobject, '--record-id', id, '--target-org', org];
          if (req.body.tooling) args.push('--use-tooling-api');
          await cli.execute(args, { timeoutMs: 120_000 });
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
      const result = await cli.execute(
        ['data', 'query', '--query', 'SELECT QualifiedApiName FROM EntityDefinition ORDER BY QualifiedApiName', '--target-org', org, '--use-tooling-api'],
        { timeoutMs: 120_000, signal, cache: { key: `orgs:${org}:objects:tooling`, ttlMs: ttl.objects } },
      );
      return { objects: (result.records || []).map((record: any) => record.QualifiedApiName).filter(Boolean) };
    }
    const category = ['all', 'standard', 'custom'].includes((request.query.category || '').toLowerCase())
      ? request.query.category!.toLowerCase()
      : 'all';
    return {
      objects: await cli.execute(['sobject', 'list', '--sobject', category, '--target-org', org], {
        signal,
        cache: { key: `orgs:${org}:objects:${category}`, ttlMs: ttl.objects },
      }),
    };
  });

  app.get<{ Params: { org: string; name: string }; Querystring: { tooling?: string } }>('/api/orgs/:org/objects/:name', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const name = safeType(request.params.name);
    const tooling = request.query.tooling === 'true';
    const args = ['sobject', 'describe', '--sobject', name, '--target-org', org];
    if (tooling) args.push('--use-tooling-api');
    return {
      describe: await cli.execute(args, {
        timeoutMs: 120_000,
        signal: readSignal(request, reply),
        cache: { key: `orgs:${org}:describe:${name}:${tooling ? 'tooling' : 'standard'}`, ttlMs: ttl.describe },
      }),
    };
  });

  app.post<{ Body: { org: string; objects: string[] } }>('/api/data/record-counts', async (request, reply) => {
    const org = safeOrg(request.body.org);
    const objects = (request.body.objects || []).slice(0, 25).map((x) => safeType(x));
    if (!objects.length) throw new Error('Select at least one object');
    const signal = readSignal(request, reply);
    // The CLI runner caps how many of these actually run at once; see MAX_CONCURRENT.
    const counts = await Promise.all(
      objects.map(async (object) => {
        const result = await cli.execute(['data', 'query', '--query', `SELECT count() FROM ${object}`, '--target-org', org], {
          timeoutMs: 120_000,
          signal,
        });
        return { object, count: result.totalSize ?? result.records?.[0]?.expr0 ?? 0 };
      }),
    );
    return { counts };
  });
}
