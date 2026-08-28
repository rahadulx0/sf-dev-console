import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

const home = await mkdtemp(path.join(tmpdir(), 'sf-console-orgdeploy-'));
process.env.SF_CONSOLE_HOME = home;

// Both modules read SF_CONSOLE_HOME (directly or via ./shared.js -> state/store.js) at import
// time, so they must load after the override, same pattern as state/store.test.ts.
const { initStorage, getState, updateState } = await import('../state/store.js');
await initStorage();
const { orgDeployRoutes } = await import('./orgDeploy.js');

function buildApp(cliOverride: { execute: (args: string[], options?: any) => Promise<any> }) {
  const app = Fastify();
  app.setErrorHandler((error: Error, _req, reply) => reply.status(400).send({ error: error.message }));
  return app.register(orgDeployRoutes, { cliOverride }).then(() => app);
}

test('compare rejects identical source and target orgs without calling the CLI', async () => {
  let calls = 0;
  const app = await buildApp({ execute: async () => { calls++; return {}; } });
  const response = await app.inject({
    method: 'POST',
    url: '/api/org-deploy/compare',
    payload: { sourceOrg: 'same-org', targetOrg: 'same-org', selections: [{ type: 'ApexClass', members: ['A'] }] },
  });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.payload).error, /must be different/i);
  assert.equal(calls, 0);
});

test('compare prepares a files-only transfer without calling metadata retrieval', async () => {
  let calls = 0;
  const app = await buildApp({ execute: async () => { calls++; return {}; } });
  const response = await app.inject({
    method: 'POST',
    url: '/api/org-deploy/compare',
    payload: { sourceOrg: 'source', targetOrg: 'target', selections: [] },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.payload).rows, []);
  assert.equal(calls, 0);
});

test('compare surfaces a source retrieval failure instead of a raw crash', async () => {
  const app = await buildApp({
    execute: async () => {
      throw new Error('No connection found for org source');
    },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/org-deploy/compare',
    payload: { sourceOrg: 'source', targetOrg: 'target', selections: [{ type: 'ApexClass', members: ['A'] }] },
  });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.payload).error, /No connection found/);
});

test('compare tolerates a failing target retrieval and still returns a comparison', async () => {
  let call = 0;
  const app = await buildApp({
    execute: async (args: string[]) => {
      call++;
      if (args.includes('metadata-types')) return { metadataObjects: [] };
      // First retrieve is source (succeeds), second is target (fails).
      if (call === 2) throw new Error('target retrieve failed');
      return {};
    },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/org-deploy/compare',
    payload: { sourceOrg: 'source', targetOrg: 'target', selections: [{ type: 'ApexClass', members: ['A'] }] },
  });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.payload);
  assert.equal(body.targetAvailable, false);
  assert.match(body.targetError, /target retrieve failed/);
});

test('deploy rejects when the comparison id is unknown or expired', async () => {
  const app = await buildApp({ execute: async () => ({}) });
  const response = await app.inject({
    method: 'POST',
    url: '/api/org-deploy/deploy',
    payload: {
      id: '00000000-0000-4000-8000-000000000000',
      keys: ['classes/A'],
      targetOrg: 'target',
      mode: 'validate',
      confirmation: 'VALIDATE target',
    },
  });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.payload).error, /expired/i);
});

test('deploy rejects a mismatched confirmation phrase without invoking the CLI', async () => {
  let calls = 0;
  const app = await buildApp({
    execute: async (args: string[]) => {
      calls++;
      if (args.includes('metadata-types')) return { metadataObjects: [] };
      return {};
    },
  });
  const compareResponse = await app.inject({
    method: 'POST',
    url: '/api/org-deploy/compare',
    payload: { sourceOrg: 'source', targetOrg: 'target', selections: [{ type: 'ApexClass', members: ['A'] }] },
  });
  const { id } = JSON.parse(compareResponse.payload);
  const callsBeforeDeploy = calls;

  const deployResponse = await app.inject({
    method: 'POST',
    url: '/api/org-deploy/deploy',
    payload: { id, keys: ['classes/A'], targetOrg: 'target', mode: 'deploy', confirmation: 'WRONG PHRASE' },
  });
  assert.equal(deployResponse.statusCode, 400);
  assert.match(JSON.parse(deployResponse.payload).error, /Confirmation must exactly match/);
  assert.equal(calls, callsBeforeDeploy, 'the CLI must not run a deploy when confirmation is wrong');
});

test('org-deploy history records can be read back and updated', async () => {
  const app = await buildApp({ execute: async () => ({}) });
  const before = await app.inject({ method: 'GET', url: '/api/org-deploy/history' });
  assert.deepEqual(JSON.parse(before.payload).orgDeploys, []);

  updateState((draft) =>
    draft.orgDeploys.unshift({
      id: 'local-1',
      sourceOrg: 'source',
      targetOrg: 'target',
      mode: 'validate',
      status: 'running',
      componentCount: 1,
      types: ['ApexClass'],
      createdAt: new Date().toISOString(),
    }),
  );

  const patch = await app.inject({
    method: 'PATCH',
    url: '/api/org-deploy/history/local-1',
    payload: { status: 'succeeded' },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(getState().orgDeploys.find((r) => r.id === 'local-1')?.status, 'succeeded');
});

test.after(async () => {
  await rm(home, { recursive: true, force: true });
});
