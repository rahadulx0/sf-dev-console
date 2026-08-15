import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ActivityRecord, RetrievalRecord, SavedSet } from './types.js';

export const appHome = process.env.SF_CONSOLE_HOME || path.join(os.homedir(), '.sf-dev-console');
export const workspace = path.join(appHome, 'workspace');
const statePath = path.join(appHome, 'state.json');
export interface State { selectedOrg?: string; retrievals: RetrievalRecord[]; savedSets: SavedSet[]; activities?: ActivityRecord[] }

export async function initStorage() {
  await mkdir(path.join(workspace, 'manifest'), { recursive: true });
  await mkdir(path.join(workspace, 'retrieve'), { recursive: true });
  try { await readFile(path.join(workspace, 'sfdx-project.json')); } catch {
    await writeFile(path.join(workspace, 'sfdx-project.json'), JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }], namespace: '', sourceApiVersion: '65.0' }, null, 2));
  }
}
export async function readState(): Promise<State> {
  try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return { retrievals: [], savedSets: [] }; }
}
export async function writeState(state: State) { await mkdir(appHome, { recursive: true }); await writeFile(statePath, JSON.stringify(state, null, 2)); }
