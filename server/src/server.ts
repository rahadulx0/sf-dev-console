import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CliError } from './cli/CliRunner.js';
import { appHome, flushNow, initStorage, updateState } from './state/store.js';
import { cli } from './routes/shared.js';
import { orgRoutes } from './routes/orgs.js';
import { metadataRoutes } from './routes/metadata.js';
import { retrievalRoutes } from './routes/retrievals.js';
import { dataRoutes } from './routes/data.js';
import { apexRoutes } from './routes/apex.js';
import { deployRoutes } from './routes/deploy.js';
import { orgDeployRoutes } from './routes/orgDeploy.js';

const app = Fastify({ logger: true, bodyLimit: 2_000_000 });
await app.register(cors, { origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] });
await initStorage();

app.setErrorHandler((error, _request, reply) => {
  const status = error instanceof CliError ? 502 : (error as any).statusCode || 400;
  reply.status(status).send({
    error: error instanceof Error ? error.message : String(error),
    details: error instanceof CliError ? error.details : undefined,
  });
});

const UNLOGGED = new Set(['/api/activities', '/api/system/status']);
app.addHook('onResponse', async (request, reply) => {
  if (!request.url.startsWith('/api/')) return;
  const operation = request.routeOptions.url || request.url.split('?')[0];
  if (UNLOGGED.has(operation)) return;
  updateState((draft) => {
    draft.activities = [
      { id: randomUUID(), operation, method: request.method, statusCode: reply.statusCode, createdAt: new Date().toISOString() },
      ...draft.activities,
    ].slice(0, 100);
  });
});

/** `sf --version` costs a full CLI boot, and the answer only changes when the user upgrades. */
let cachedVersion: { value: string; expiresAt: number } | undefined;
app.get('/api/system/status', async () => {
  try {
    if (!cachedVersion || cachedVersion.expiresAt < Date.now()) {
      cachedVersion = { value: await cli.version(), expiresAt: Date.now() + 300_000 };
    }
    return { cli: { installed: true, version: cachedVersion.value }, node: process.version, storage: appHome };
  } catch (e) {
    cachedVersion = undefined;
    return { cli: { installed: false, error: e instanceof Error ? e.message : String(e) }, node: process.version, storage: appHome };
  }
});

await app.register(orgRoutes);
await app.register(metadataRoutes);
await app.register(retrievalRoutes);
await app.register(dataRoutes);
await app.register(apexRoutes);
await app.register(deployRoutes);
await app.register(orgDeployRoutes);

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
try {
  await app.register(staticPlugin, { root: webDist });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
  );
} catch {}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void flushNow().finally(() => process.exit(0));
  });
}

const port = Number(process.env.PORT || 4173);
await app.listen({ host: '127.0.0.1', port });
