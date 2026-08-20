import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { buildManifest } from '../manifest.js';
import { diffLines } from '../diff.js';
import {
  buildDeployArgs,
  buildDeployScope,
  buildRetrieveArgs,
  compareComponentGroups,
  confirmationPhrase,
  groupMetadataFiles,
  hashGroups,
  includeFieldLevelSecurity,
  includeRequiredFieldSecurityKeys,
  safeSelections,
  safeTestLevel,
  safeTests,
  scanDependencies,
  type ComparisonRow,
  type ComponentGroup,
  type ComponentGroupText,
  type Dependency,
} from '../orgDeployCompare.js';
import { getState, updateState, workspace } from '../state/store.js';
import type { CliRunner } from '../cli/CliRunner.js';
import type { OrgDeployRecord } from '../types.js';
import { cli as sharedCli, safeOrg, safeType, safeUuid, ttl } from './shared.js';

interface StoredComparison {
  id: string;
  sourceOrg: string;
  targetOrg: string;
  targetAvailable: boolean;
  targetError?: string;
  baseDir: string;
  sourceDir: string;
  targetDir: string;
  rows: ComparisonRow[];
}

const MAX_COMPARISONS = 3;
const comparisons = new Map<string, StoredComparison>();

function storeComparison(entry: StoredComparison) {
  comparisons.set(entry.id, entry);
  const keys = [...comparisons.keys()];
  while (keys.length > MAX_COMPARISONS) {
    const oldest = keys.shift()!;
    const evicted = comparisons.get(oldest);
    comparisons.delete(oldest);
    if (evicted) void rm(evicted.baseDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Lists every file under `rootDir` as a path relative to it, using forward slashes regardless of OS. */
async function listFiles(rootDir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parent = (entry as any).parentPath ?? (entry as any).path ?? rootDir;
    files.push(path.relative(rootDir, path.join(parent, entry.name)).replaceAll('\\', '/'));
  }
  return files;
}

async function loadTypeDirMap(runner: Pick<CliRunner, 'execute'>, org: string): Promise<Record<string, string>> {
  const result = await runner.execute(['org', 'list', 'metadata-types', '--target-org', org], {
    timeoutMs: 180_000,
    cache: { key: `orgs:${org}:metadata-types`, ttlMs: ttl.metadataTypes },
  });
  const map: Record<string, string> = { objects: 'CustomObject' };
  for (const entry of result.metadataObjects || result || []) {
    const name = entry.xmlName || entry.name;
    if (name && entry.directoryName) map[entry.directoryName] = name;
  }
  return map;
}

async function loadApexClassNames(runner: Pick<CliRunner, 'execute'>, org: string): Promise<Set<string> | null> {
  try {
    const result = await runner.execute(['org', 'list', 'metadata', '--metadata-type', 'ApexClass', '--target-org', org], {
      timeoutMs: 60_000,
      cache: { key: `orgs:${org}:metadata:ApexClass`, ttlMs: ttl.metadataComponents },
    });
    const list = Array.isArray(result) ? result : result.metadata || [];
    return new Set(list.map((m: any) => m.fullName).filter(Boolean));
  } catch {
    return null;
  }
}

async function readGroupsText(groups: ComponentGroup[], rootDir: string): Promise<ComponentGroupText[]> {
  const out: ComponentGroupText[] = [];
  for (const group of groups) {
    let text = '';
    for (const file of group.files) {
      if (!/\.(cls|trigger|js|xml)$/i.test(file)) continue;
      try {
        const buffer = await readFile(path.join(rootDir, file));
        if (buffer.length <= 200_000 && !buffer.includes(0)) text += `${buffer.toString('utf8')}\n`;
      } catch {
        // A file that vanished between listing and reading contributes nothing to the scan.
      }
    }
    out.push({ ...group, text });
  }
  return out;
}

async function readTextForDiff(filePath: string): Promise<string | null | undefined> {
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return undefined;
  }
  if (buffer.length > 300_000 || buffer.includes(0)) return null;
  return buffer.toString('utf8');
}

export async function orgDeployRoutes(app: FastifyInstance, opts: { cliOverride?: Pick<CliRunner, 'execute'> } = {}) {
  const cli = opts.cliOverride ?? sharedCli;

  app.post<{ Body: { sourceOrg: string; targetOrg: string; selections: unknown; apiVersion?: string } }>(
    '/api/org-deploy/compare',
    async (req) => {
      const sourceOrg = safeOrg(req.body.sourceOrg);
      const targetOrg = safeOrg(req.body.targetOrg);
      if (sourceOrg === targetOrg) throw new Error('Source and target orgs must be different');
      const requestedSelections = safeSelections(req.body.selections, safeType);
      const { selections, included: includedFieldLevelSecurity } = includeFieldLevelSecurity(requestedSelections);

      const id = randomUUID();
      const baseDir = path.join(workspace, 'org-deploy', id);
      const sourceDir = path.join(baseDir, 'source');
      const targetDir = path.join(baseDir, 'target');
      await mkdir(sourceDir, { recursive: true });
      await mkdir(targetDir, { recursive: true });
      const manifestPath = path.join(baseDir, 'package.xml');
      await writeFile(manifestPath, buildManifest(selections, req.body.apiVersion));

      await cli.execute(buildRetrieveArgs(manifestPath, sourceOrg, sourceDir), { cwd: workspace, timeoutMs: 10 * 60_000 });

      let targetAvailable = true;
      let targetError: string | undefined;
      try {
        await cli.execute(buildRetrieveArgs(manifestPath, targetOrg, targetDir), { cwd: workspace, timeoutMs: 10 * 60_000 });
      } catch (error) {
        targetAvailable = false;
        targetError = error instanceof Error ? error.message : String(error);
      }

      const typeDirMap = await loadTypeDirMap(cli, sourceOrg);
      const sourceFiles = await listFiles(sourceDir);
      const targetFiles = targetAvailable ? await listFiles(targetDir) : [];
      const sourceGroups = groupMetadataFiles(sourceFiles, typeDirMap);
      const targetGroups = targetAvailable ? groupMetadataFiles(targetFiles, typeDirMap) : [];
      const sourceHashes = await hashGroups(sourceGroups, sourceDir);
      const targetHashes = targetAvailable ? await hashGroups(targetGroups, targetDir) : new Map<string, string>();
      const rows = compareComponentGroups(sourceGroups, targetGroups, sourceHashes, targetHashes, targetAvailable);

      const selectedFullNames = new Set(sourceGroups.map((g) => g.fullName));
      const targetApexClasses = targetAvailable ? await loadApexClassNames(cli, targetOrg) : null;
      const textGroups = await readGroupsText(sourceGroups, sourceDir);
      const dependencies: Dependency[] = scanDependencies(textGroups, selectedFullNames, targetApexClasses, null);

      storeComparison({ id, sourceOrg, targetOrg, targetAvailable, targetError, baseDir, sourceDir, targetDir, rows });

      return { id, sourceOrg, targetOrg, targetAvailable, targetError, rows, dependencies, includedFieldLevelSecurity };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { key: string } }>('/api/org-deploy/:id/diff', async (req) => {
    const comparison = comparisons.get(safeUuid(req.params.id));
    if (!comparison) throw new Error('This comparison has expired. Run Compare again.');
    const row = comparison.rows.find((r) => r.key === req.query.key);
    if (!row) throw new Error('Unknown component');

    const files = [];
    for (const file of row.files) {
      const sourceText = await readTextForDiff(path.join(comparison.sourceDir, file));
      const targetText = comparison.targetAvailable ? await readTextForDiff(path.join(comparison.targetDir, file)) : undefined;
      const binary = sourceText === null || targetText === null;
      const diff =
        !binary && typeof sourceText === 'string' && typeof targetText === 'string' ? diffLines(sourceText, targetText) : null;
      files.push({
        file,
        binary,
        tooLarge: !binary && diff === null && typeof sourceText === 'string' && typeof targetText === 'string',
        sourceText: binary ? undefined : sourceText,
        targetText: binary ? undefined : targetText,
        diff,
      });
    }
    return { key: row.key, type: row.type, fullName: row.fullName, targetAvailable: comparison.targetAvailable, files };
  });

  app.post<{ Body: { id: string; keys: string[]; destructiveKeys?: string[]; targetOrg: string } }>(
    '/api/org-deploy/preview',
    async (req) => {
      const comparison = comparisons.get(safeUuid(req.body.id));
      if (!comparison) throw new Error('This comparison has expired. Run Compare again.');
      const targetOrg = safeOrg(req.body.targetOrg);
      if (targetOrg !== comparison.targetOrg) throw new Error('Target org no longer matches the reviewed comparison');
      const knownKeys = new Set(comparison.rows.map((row) => row.key));
      let selectedKeys = new Set((req.body.keys || []).filter((key) => knownKeys.has(key)));
      const destructiveKeys = new Set(
        (req.body.destructiveKeys || []).filter((key) => comparison.rows.some((row) => row.key === key && row.status === 'missing-source')),
      );
      for (const key of destructiveKeys) selectedKeys.add(key);
      selectedKeys = includeRequiredFieldSecurityKeys(comparison.rows, selectedKeys);
      if (!selectedKeys.size) throw new Error('Select at least one reviewed component or explicit deletion');
      const rows = comparison.rows.filter((row) => selectedKeys.has(row.key));
      const scopeDir = path.join(comparison.baseDir, `preview-${randomUUID()}`);
      await buildDeployScope(comparison.sourceDir, rows, selectedKeys, scopeDir, destructiveKeys);
      const packageXml = await readFile(path.join(scopeDir, 'package.xml'), 'utf8');
      let destructiveChangesPost: string | undefined;
      try {
        destructiveChangesPost = await readFile(path.join(scopeDir, 'destructiveChangesPost.xml'), 'utf8');
      } catch {
        // No explicit deletions were selected.
      }
      return {
        targetOrg,
        componentCount: rows.filter((row) => !destructiveKeys.has(row.key)).length,
        deletionCount: destructiveKeys.size,
        components: rows.filter((row) => !destructiveKeys.has(row.key)).map((row) => ({ type: row.type, fullName: row.fullName })),
        deletions: rows.filter((row) => destructiveKeys.has(row.key)).map((row) => ({ type: row.type, fullName: row.fullName })),
        packageXml,
        destructiveChangesPost,
      };
    },
  );

  app.post<{
    Body: {
      id: string;
      keys: string[];
      destructiveKeys?: string[];
      targetOrg: string;
      mode: 'validate' | 'deploy';
      testLevel?: string;
      tests?: string[];
      confirmation: string;
    };
  }>('/api/org-deploy/deploy', async (req) => {
    const comparison = comparisons.get(safeUuid(req.body.id));
    if (!comparison) throw new Error('This comparison has expired. Run Compare again.');
    const targetOrg = safeOrg(req.body.targetOrg);
    if (targetOrg !== comparison.targetOrg) throw new Error('Target org no longer matches the reviewed comparison');

    const mode = req.body.mode === 'deploy' ? 'deploy' : 'validate';
    const phrase = confirmationPhrase(mode, targetOrg);
    if (req.body.confirmation !== phrase) throw new Error(`Confirmation must exactly match: ${phrase}`);

    const knownKeys = new Set(comparison.rows.map((r) => r.key));
    const requested = Array.isArray(req.body.keys) ? req.body.keys : [];
    let selectedKeys = new Set(requested.filter((key) => knownKeys.has(key)));
    const requestedDestructive = Array.isArray(req.body.destructiveKeys) ? req.body.destructiveKeys : [];
    const destructiveKeys = new Set(
      requestedDestructive.filter((key) => comparison.rows.some((row) => row.key === key && row.status === 'missing-source')),
    );
    for (const key of destructiveKeys) selectedKeys.add(key);
    if (!selectedKeys.size) throw new Error('Select at least one reviewed component or explicit deletion');
    selectedKeys = includeRequiredFieldSecurityKeys(comparison.rows, selectedKeys);

    const testLevel = safeTestLevel(req.body.testLevel);
    const tests = safeTests(req.body.tests);
    if (testLevel === 'RunSpecifiedTests' && !tests.length) {
      throw new Error('Select at least one Apex test class for RunSpecifiedTests');
    }

    const selectedRows = comparison.rows.filter((row) => selectedKeys.has(row.key));
    const opId = randomUUID();
    const scopeDir = path.join(comparison.baseDir, `deploy-${opId}`);
    await mkdir(scopeDir, { recursive: true });
    await buildDeployScope(comparison.sourceDir, selectedRows, selectedKeys, scopeDir, destructiveKeys);

    let targetIsSandbox = false;
    if (mode === 'validate') {
      const orgInfo = await cli.execute(['org', 'display', '--target-org', targetOrg], { timeoutMs: 120_000 });
      targetIsSandbox = !!orgInfo?.isSandbox;
    }
    const response = await cli.execute(buildDeployArgs(mode, scopeDir, targetOrg, testLevel, tests, targetIsSandbox), {
      cwd: workspace,
      timeoutMs: 120_000,
    });

    const record: OrgDeployRecord = {
      id: randomUUID(),
      sourceOrg: comparison.sourceOrg,
      targetOrg,
      targetIsSandbox,
      mode,
      status: 'running',
      jobId: response?.id || response?.jobId,
      componentCount: selectedRows.length,
      types: [...new Set(selectedRows.map((row) => row.type))],
      createdAt: new Date().toISOString(),
    };
    updateState((draft) => {
      draft.orgDeploys = [record, ...draft.orgDeploys].slice(0, 50);
    });

    return { record, response };
  });

  app.get('/api/org-deploy/history', async () => ({ orgDeploys: getState().orgDeploys }));

  app.patch<{ Params: { localId: string }; Body: { status: OrgDeployRecord['status']; detail?: string } }>(
    '/api/org-deploy/history/:localId',
    async (req) => {
      const allowed: OrgDeployRecord['status'][] = ['running', 'succeeded', 'failed', 'cancelled'];
      if (!allowed.includes(req.body.status)) throw new Error('Invalid status');
      updateState((draft) => {
        const record = draft.orgDeploys.find((r) => r.id === req.params.localId);
        if (record) {
          record.status = req.body.status;
          record.completedAt = new Date().toISOString();
          if (req.body.detail) record.error = req.body.detail;
        }
      });
      return { ok: true };
    },
  );
}
