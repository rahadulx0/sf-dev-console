import type { FastifyInstance } from 'fastify';
import { cli, readFast, safeOrg, sfApi } from './shared.js';

export async function apexRoutes(app: FastifyInstance) {
  app.post<{ Body: { org: string; code: string } }>('/api/apex/execute', async (req) => {
    if (!req.body.code?.trim() || req.body.code.length > 500_000) throw new Error('Invalid Apex');
    const org = safeOrg(req.body.org);
    /*
     * The SOAP Apex endpoint returns the compile result and the debug log together, which is
     * exactly what `sf apex run` reports — about 1.0s against 4.0s, on an action the user
     * triggers deliberately and waits on.
     */
    return await readFast(
      () => sfApi.executeAnonymous(org, req.body.code, { timeoutMs: 180_000 }),
      () => cli.execute(['apex', 'run', '--target-org', org], { stdin: req.body.code, timeoutMs: 180_000 }),
    );
  });

  app.post<{ Body: { org: string; testLevel: string; tests?: string[]; coverage?: boolean } }>('/api/tests', async (req) => {
    const allowed = ['RunLocalTests', 'RunAllTestsInOrg', 'RunSpecifiedTests'];
    if (!allowed.includes(req.body.testLevel)) throw new Error('Invalid test level');
    const args = ['apex', 'run', 'test', '--target-org', safeOrg(req.body.org), '--test-level', req.body.testLevel, '--wait', '20'];
    if (req.body.testLevel === 'RunSpecifiedTests') {
      const tests = (req.body.tests || []).filter((x) => /^[A-Za-z0-9_.]+$/.test(x));
      if (!tests.length) throw new Error('Select at least one test');
      args.push('--tests', tests.join(','));
    }
    if (req.body.coverage) args.push('--code-coverage');
    return cli.execute(args, { timeoutMs: 25 * 60_000 });
  });
}
