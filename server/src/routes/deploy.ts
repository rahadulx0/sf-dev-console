import type { FastifyInstance } from 'fastify';
import { cli, safeId, safeOrg, safeProjectSource } from './shared.js';

export async function deployRoutes(app: FastifyInstance) {
  app.post<{ Body: { org: string; projectPath: string; sourcePath: string } }>('/api/deploy/preview', async (req) => {
    const p = await safeProjectSource(req.body.projectPath, req.body.sourcePath);
    return cli.execute(['project', 'deploy', 'preview', '--source-dir', p.source, '--target-org', safeOrg(req.body.org), '--concise'], {
      cwd: p.project,
      timeoutMs: 5 * 60_000,
    });
  });

  app.post<{ Body: { org: string; projectPath: string; sourcePath: string; testLevel?: string } }>('/api/deploy/validate', async (req) => {
    const p = await safeProjectSource(req.body.projectPath, req.body.sourcePath);
    const levels = ['NoTestRun', 'RunSpecifiedTests', 'RunLocalTests', 'RunAllTestsInOrg'];
    const level = levels.includes(req.body.testLevel || '') ? req.body.testLevel! : 'RunLocalTests';
    return cli.execute(
      ['project', 'deploy', 'validate', '--source-dir', p.source, '--target-org', safeOrg(req.body.org), '--test-level', level, '--wait', '30'],
      { cwd: p.project, timeoutMs: 35 * 60_000 },
    );
  });

  app.post<{ Body: { org: string; projectPath: string; sourcePath: string; testLevel?: string; confirmation: string } }>(
    '/api/deploy/start',
    async (req) => {
      const org = safeOrg(req.body.org);
      if (req.body.confirmation !== `DEPLOY ${org}`) throw new Error(`Confirmation must exactly match: DEPLOY ${org}`);
      const p = await safeProjectSource(req.body.projectPath, req.body.sourcePath);
      const levels = ['NoTestRun', 'RunLocalTests', 'RunAllTestsInOrg', 'RunRelevantTests'];
      const level = levels.includes(req.body.testLevel || '') ? req.body.testLevel! : 'RunLocalTests';
      return cli.execute(
        ['project', 'deploy', 'start', '--source-dir', p.source, '--target-org', org, '--test-level', level, '--async'],
        { cwd: p.project, timeoutMs: 120_000 },
      );
    },
  );

  app.get<{ Params: { org: string; id: string } }>('/api/deploy/:org/:id', async (req) =>
    cli.execute(
      ['project', 'deploy', 'report', '--job-id', safeId(req.params.id, 'deployment ID'), '--target-org', safeOrg(req.params.org)],
      { timeoutMs: 120_000 },
    ),
  );

  app.post<{ Body: { org: string; jobId: string; confirmation: string } }>('/api/deploy/quick', async (req) => {
    const org = safeOrg(req.body.org);
    const job = safeId(req.body.jobId, 'deployment ID');
    if (req.body.confirmation !== `QUICK DEPLOY ${job}`) throw new Error(`Confirmation must exactly match: QUICK DEPLOY ${job}`);
    return cli.execute(['project', 'deploy', 'quick', '--job-id', job, '--target-org', org, '--async'], { timeoutMs: 120_000 });
  });

  app.post<{ Body: { org: string; jobId: string } }>('/api/deploy/cancel', async (req) =>
    cli.execute(
      ['project', 'deploy', 'cancel', '--job-id', safeId(req.body.jobId, 'deployment ID'), '--target-org', safeOrg(req.body.org), '--async'],
      { timeoutMs: 120_000 },
    ),
  );
}
