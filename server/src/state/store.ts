import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ActivityRecord, RetrievalRecord, SavedSet } from '../types.js';

export const appHome = process.env.SF_CONSOLE_HOME || path.join(os.homedir(), '.sf-dev-console');
export const workspace = path.join(appHome, 'workspace');
const statePath = path.join(appHome, 'state.json');
const tempPath = `${statePath}.tmp`;
const FLUSH_DELAY_MS = 250;

export interface State {
  selectedOrg?: string;
  retrievals: RetrievalRecord[];
  savedSets: SavedSet[];
  activities: ActivityRecord[];
}

const emptyState = (): State => ({ retrievals: [], savedSets: [], activities: [] });

/**
 * The whole state file is small (capped activity + retrieval lists), so it is held in memory
 * and written back asynchronously. The previous implementation read and rewrote the file on
 * every API response, which both cost a disk round-trip per request and lost concurrent
 * updates: two overlapping read-modify-write cycles each persisted their own copy of the
 * pre-existing array. Every mutation now runs against the single in-memory object, and writes
 * are debounced and serialized through one promise chain.
 */
let state: State = emptyState();
let loaded = false;
let flushTimer: NodeJS.Timeout | undefined;
let pending: Promise<void> = Promise.resolve();
let dirty = false;

export async function initStorage() {
  await mkdir(path.join(workspace, 'manifest'), { recursive: true });
  await mkdir(path.join(workspace, 'retrieve'), { recursive: true });
  try {
    await readFile(path.join(workspace, 'sfdx-project.json'));
  } catch {
    await writeFile(
      path.join(workspace, 'sfdx-project.json'),
      JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }], namespace: '', sourceApiVersion: '65.0' }, null, 2),
    );
  }
  await loadState();
}

async function loadState() {
  if (loaded) return;
  try {
    const parsed = JSON.parse(await readFile(statePath, 'utf8')) as Partial<State>;
    state = {
      selectedOrg: parsed.selectedOrg,
      retrievals: parsed.retrievals ?? [],
      savedSets: parsed.savedSets ?? [],
      activities: parsed.activities ?? [],
    };
  } catch {
    state = emptyState();
  }
  loaded = true;
}

/** The live state object. Callers must not retain it across an await if they intend to mutate. */
export function getState(): State {
  return state;
}

/**
 * Applies a mutation to the in-memory state and schedules a debounced flush.
 * The mutator runs synchronously so interleaved requests can never observe or persist a
 * stale copy of the state.
 */
export function updateState<T>(mutate: (draft: State) => T): T {
  const result = mutate(state);
  dirty = true;
  scheduleFlush();
  return result;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flush();
  }, FLUSH_DELAY_MS);
  flushTimer.unref?.();
}

/** Serializes every write so a slow flush can never be overtaken by a newer one. */
export function flush(): Promise<void> {
  if (!dirty) return pending;
  dirty = false;
  pending = pending.then(async () => {
    const snapshot = JSON.stringify(state, null, 2);
    await mkdir(appHome, { recursive: true });
    // Write to a sibling file and rename so an interrupted write cannot truncate state.json.
    await writeFile(tempPath, snapshot);
    await rename(tempPath, statePath);
  }).catch(() => {
    // A failed flush must not poison the chain for later writes.
  });
  return pending;
}

/** Flushes any pending changes immediately; used on shutdown. */
export async function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  dirty = true;
  await flush();
}
