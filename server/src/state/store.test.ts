import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const home = await mkdtemp(path.join(tmpdir(), 'sf-console-state-'));
process.env.SF_CONSOLE_HOME = home;

// The module reads SF_CONSOLE_HOME at import time, so it must be imported after the override.
const { flushNow, getState, initStorage, updateState } = await import('./store.js');
await initStorage();

test('interleaved updates all survive a single flush', async () => {
  // The previous read-modify-write implementation lost every activity but the last, because
  // each request awaited its own read of the file before appending.
  await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, i % 5));
        updateState((draft) => {
          draft.activities = [
            { id: String(i), operation: '/api/query', method: 'POST', statusCode: 200, createdAt: new Date().toISOString() },
            ...draft.activities,
          ].slice(0, 100);
        });
      })(),
    ),
  );

  assert.equal(getState().activities.length, 50);
  await flushNow();
  const persisted = JSON.parse(await readFile(path.join(home, 'state.json'), 'utf8'));
  assert.equal(persisted.activities.length, 50);
  assert.deepEqual(new Set(persisted.activities.map((a: any) => a.id)), new Set(Array.from({ length: 50 }, (_, i) => String(i))));
});

test('activities stay capped at 100 entries', async () => {
  for (let i = 0; i < 200; i++) {
    updateState((draft) => {
      draft.activities = [
        { id: `cap-${i}`, operation: '/api/orgs', method: 'GET', statusCode: 200, createdAt: new Date().toISOString() },
        ...draft.activities,
      ].slice(0, 100);
    });
  }
  await flushNow();
  const persisted = JSON.parse(await readFile(path.join(home, 'state.json'), 'utf8'));
  assert.equal(persisted.activities.length, 100);
  assert.equal(persisted.activities[0].id, 'cap-199');
});

test('a retrieval finishing later updates the record in place', async () => {
  updateState((draft) =>
    draft.retrievals.unshift({
      id: 'job-1',
      org: 'dev',
      orgLabel: 'dev',
      createdAt: new Date().toISOString(),
      status: 'running',
      selections: [],
      componentCount: 0,
      manifestPath: '/tmp/package.xml',
    }),
  );
  updateState((draft) => {
    const record = draft.retrievals.find((x) => x.id === 'job-1');
    if (record) record.status = 'success';
  });
  await flushNow();
  const persisted = JSON.parse(await readFile(path.join(home, 'state.json'), 'utf8'));
  assert.equal(persisted.retrievals.find((r: any) => r.id === 'job-1').status, 'success');
});

test.after(async () => {
  await rm(home, { recursive: true, force: true });
});
