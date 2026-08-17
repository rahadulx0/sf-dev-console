import { createHash } from 'node:crypto';
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildManifest } from './manifest.js';
import type { Selection } from './types.js';

export interface ComponentGroup {
  key: string;
  type: string;
  fullName: string;
  files: string[];
}

export type ComparisonStatus = 'new' | 'changed' | 'identical' | 'missing-source' | 'unknown';

export interface ComparisonRow extends ComponentGroup {
  sourceExists: boolean;
  targetExists: boolean;
  status: ComparisonStatus;
}

export type DependencyConfidence = 'confirmed-missing' | 'potential' | 'informational';

export interface Dependency {
  from: string;
  relatedType: 'ApexClass' | 'CustomField';
  relatedName: string;
  confidence: DependencyConfidence;
}

/**
 * Salesforce's metadata-format folder convention nests these directly under an object folder
 * (objects/<Object>/<childDir>/<Name>...). This is a fixed CLI/metadata-API layout rule, not an
 * enumeration of which metadata types the tool supports.
 */
const NESTED_CHILD_TYPE_BY_DIR: Record<string, string> = {
  fields: 'CustomField',
  validationRules: 'ValidationRule',
  recordTypes: 'RecordType',
  listViews: 'ListView',
  webLinks: 'WebLink',
  businessProcesses: 'BusinessProcess',
  compactLayouts: 'CompactLayout',
  sharingReasons: 'SharingReason',
  fieldSets: 'FieldSet',
};

/** True multi-file bundles, where every file under the component folder belongs to one component. */
const BUNDLE_DIRS = new Set(['lwc', 'aura']);

function baseName(fileName: string): string {
  let name = fileName;
  if (name.endsWith('-meta.xml')) name = name.slice(0, -'-meta.xml'.length);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * `sf project retrieve start --target-metadata-dir --unzip` extracts the Metadata API zip as-is,
 * whose root is the package name folder (`unpackaged` by default) — and in practice that shows
 * up doubled (`unpackaged/unpackaged/...`). This strips any number of leading `unpackaged`
 * segments so component labeling reflects the real metadata folder structure underneath.
 */
export function stripUnpackagedWrapper(parts: string[]): string[] {
  let result = parts;
  while (result.length > 1 && result[0] === 'unpackaged') result = result.slice(1);
  return result;
}

/**
 * Groups a flat list of retrieved metadata-format file paths (posix-style, relative to the
 * retrieval root) into deployable "components". `typeDirMap` maps a metadata type's
 * directoryName (from `org list metadata-types`) back to its type name, so labeling stays
 * data-driven instead of a hardcoded per-type switch. Unrecognized folders still group
 * correctly; they're just labeled generically.
 */
export function groupMetadataFiles(files: string[], typeDirMap: Record<string, string>): ComponentGroup[] {
  const groups = new Map<string, ComponentGroup>();
  const add = (key: string, type: string, fullName: string, file: string) => {
    let group = groups.get(key);
    if (!group) {
      group = { key, type, fullName, files: [] };
      groups.set(key, group);
    }
    group.files.push(file);
  };

  for (const raw of files) {
    const file = raw.replaceAll('\\', '/');
    const rawParts = file.split('/').filter(Boolean);
    if (!rawParts.length) continue;
    const parts = stripUnpackagedWrapper(rawParts);
    if (!parts.length) continue;
    if (parts.length === 1 && parts[0].toLowerCase() === 'package.xml') continue; // the echoed root manifest, not a component
    const top = parts[0];
    const type = typeDirMap[top] || `Unknown (folder: ${top})`;

    if (top === 'objects' && parts.length >= 2) {
      const objectName = parts[1];
      if (parts.length >= 4 && NESTED_CHILD_TYPE_BY_DIR[parts[2]]) {
        const childName = baseName(parts[3]);
        add(`objects/${objectName}/${parts[2]}/${childName}`, NESTED_CHILD_TYPE_BY_DIR[parts[2]], `${objectName}.${childName}`, file);
        continue;
      }
      add(`objects/${objectName}`, typeDirMap.objects || 'CustomObject', baseName(objectName), file);
      continue;
    }

    if (BUNDLE_DIRS.has(top) && parts.length >= 2) {
      add(`${top}/${parts[1]}`, type, parts[1], file);
      continue;
    }

    if (parts.length === 2) {
      add(`${top}/${baseName(parts[1])}`, type, baseName(parts[1]), file);
      continue;
    }

    const last = baseName(parts[parts.length - 1]);
    const fullName = [...parts.slice(1, -1), last].join('/');
    add(`${top}/${fullName}`, type, fullName, file);
  }

  return [...groups.values()];
}

/** Reads and hashes every file in each group (sorted, so file order never affects the hash). */
export async function hashGroups(groups: ComponentGroup[], rootDir: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const group of groups) {
    const hash = createHash('sha256');
    for (const file of [...group.files].sort()) {
      hash.update(file);
      try {
        hash.update(await readFile(path.join(rootDir, file)));
      } catch {
        hash.update('missing');
      }
    }
    hashes.set(group.key, hash.digest('hex'));
  }
  return hashes;
}

/**
 * Pure merge of source/target component groups and their content hashes into review rows.
 * Never claims `changed`/`identical` unless the target side was actually retrieved.
 */
export function compareComponentGroups(
  sourceGroups: ComponentGroup[],
  targetGroups: ComponentGroup[],
  sourceHashes: Map<string, string>,
  targetHashes: Map<string, string>,
  targetAvailable: boolean,
): ComparisonRow[] {
  const byKey = new Map<string, ComponentGroup>();
  for (const group of sourceGroups) byKey.set(group.key, group);
  for (const group of targetGroups) if (!byKey.has(group.key)) byKey.set(group.key, group);

  const rows: ComparisonRow[] = [];
  for (const group of byKey.values()) {
    const sourceExists = sourceHashes.has(group.key);
    const targetExists = targetHashes.has(group.key);
    let status: ComparisonStatus;
    if (!targetAvailable) status = 'unknown';
    else if (sourceExists && targetExists) status = sourceHashes.get(group.key) === targetHashes.get(group.key) ? 'identical' : 'changed';
    else if (sourceExists) status = 'new';
    else if (targetExists) status = 'missing-source';
    else status = 'unknown';
    rows.push({ ...group, sourceExists, targetExists, status });
  }

  return rows.sort((a, b) => a.type.localeCompare(b.type) || a.fullName.localeCompare(b.fullName));
}

export interface ComponentGroupText extends ComponentGroup {
  text: string;
}

/**
 * Best-effort, informational-by-default scan for a handful of common cross-component
 * references (Apex class usage, custom field usage). This is not a complete dependency graph:
 * it only reports `confirmed-missing` when the referenced name is absent from both the current
 * selection and a supplied target metadata list; otherwise it reports `potential` (list
 * unavailable) or `informational` (already present somewhere relevant).
 */
export function scanDependencies(
  groups: ComponentGroupText[],
  selectedFullNames: Set<string>,
  targetApexClasses: Set<string> | null,
  targetFields: Set<string> | null,
): Dependency[] {
  const deps: Dependency[] = [];
  const seen = new Set<string>();

  const classify = (relatedName: string, relatedType: Dependency['relatedType']): DependencyConfidence => {
    if (selectedFullNames.has(relatedName)) return 'informational';
    const known = relatedType === 'ApexClass' ? targetApexClasses : targetFields;
    if (known === null) return 'potential';
    return known.has(relatedName) ? 'informational' : 'confirmed-missing';
  };

  for (const group of groups) {
    const record = (relatedName: string, relatedType: Dependency['relatedType']) => {
      const name = relatedName.trim();
      if (!name || name === group.fullName) return;
      const dedupeKey = `${group.key}|${relatedType}|${name}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      deps.push({ from: group.key, relatedType, relatedName: name, confidence: classify(name, relatedType) });
    };

    for (const match of group.text.matchAll(/@salesforce\/apex\/([A-Za-z0-9_]+)\./g)) record(match[1], 'ApexClass');
    for (const match of group.text.matchAll(/<apexClass>([^<]+)<\/apexClass>/g)) record(match[1], 'ApexClass');
    for (const match of group.text.matchAll(/<field>([^<]+)<\/field>/g)) {
      const name = match[1].trim();
      if (name.includes('__c')) record(name, 'CustomField');
    }
  }

  return deps;
}

/**
 * Copies only the files for the selected component keys into a fresh, clean metadata-format
 * directory (stripping the retrieval's `unpackaged` wrapper) and writes a `package.xml` scoped to
 * exactly those components, so deploying a reviewed subset never ships components the user
 * deselected even though the CLI's `--metadata-dir` flag deploys everything found under a folder.
 */
export async function buildDeployScope(
  sourceDir: string,
  groups: ComponentGroup[],
  selectedKeys: Set<string>,
  destDir: string,
): Promise<number> {
  let copied = 0;
  const membersByType = new Map<string, Set<string>>();
  for (const group of groups) {
    if (!selectedKeys.has(group.key)) continue;
    const members = membersByType.get(group.type) ?? new Set<string>();
    members.add(group.fullName);
    membersByType.set(group.type, members);
    for (const file of group.files) {
      const clean = stripUnpackagedWrapper(file.split('/')).join('/');
      if (!clean || clean.toLowerCase() === 'package.xml') continue;
      const from = path.join(sourceDir, file);
      const to = path.join(destDir, clean);
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
      copied++;
    }
  }
  const selections: Selection[] = [...membersByType.entries()].map(([type, members]) => ({ type, members: [...members] }));
  if (selections.length) await writeFile(path.join(destDir, 'package.xml'), buildManifest(selections));
  return copied;
}

const TEST_LEVELS = ['NoTestRun', 'RunSpecifiedTests', 'RunLocalTests', 'RunAllTestsInOrg'] as const;
export type TestLevel = (typeof TEST_LEVELS)[number];

export function safeTestLevel(value: unknown): TestLevel {
  return (TEST_LEVELS as readonly string[]).includes(value as string) ? (value as TestLevel) : 'RunLocalTests';
}

export function safeTests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(t));
}

export function safeSelections(value: unknown, safeType: (v: unknown) => string): Selection[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Select at least one metadata type or component');
  return value.map((entry) => {
    const type = safeType((entry as any)?.type);
    const rawMembers = (entry as any)?.members;
    const members = Array.isArray(rawMembers) ? rawMembers : [];
    const cleaned = members.map((member) => {
      if (typeof member !== 'string' || !member || member.length > 255 || member.includes('\0')) {
        throw new Error('Invalid metadata member name');
      }
      return member;
    });
    if (!cleaned.length) throw new Error(`No components selected for ${type}`);
    return { type, members: cleaned };
  });
}

export function confirmationPhrase(mode: 'validate' | 'deploy', targetOrg: string): string {
  return `${mode === 'deploy' ? 'DEPLOY' : 'VALIDATE'} ${targetOrg}`;
}

export function buildRetrieveArgs(manifestPath: string, org: string, outputDir: string): string[] {
  return ['project', 'retrieve', 'start', '--manifest', manifestPath, '--target-org', org, '--target-metadata-dir', outputDir, '--unzip'];
}

export function buildDeployArgs(mode: 'validate' | 'deploy', metadataDir: string, org: string, testLevel: TestLevel, tests: string[]): string[] {
  const args = [
    'project',
    'deploy',
    mode === 'deploy' ? 'start' : 'validate',
    '--metadata-dir',
    metadataDir,
    '--target-org',
    org,
    '--test-level',
    testLevel,
    '--async',
  ];
  for (const test of tests) args.push('--tests', test);
  return args;
}
