import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CliRunner } from '../cli/CliRunner.js';
import type { SfOrg } from '../types.js';

export const cli = new CliRunner();

/** Cache lifetimes for read-only CLI commands, in milliseconds. */
export const ttl = {
  orgs: 15_000,
  orgInfo: 60_000,
  limits: 15_000,
  packages: 120_000,
  metadataTypes: 300_000,
  metadataComponents: 120_000,
  objects: 300_000,
  describe: 300_000,
} as const;

/**
 * Aborts a read-only CLI command when the client goes away before the response is written.
 * Only ever used for reads: a deploy or delete must finish even if the UI navigates away.
 */
export function readSignal(_request: FastifyRequest, reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on('close', () => {
    if (!reply.raw.writableEnded) controller.abort();
  });
  return controller.signal;
}

export const safeOrg = (value: unknown) => {
  if (typeof value !== 'string' || !/^[\w.@+:-]{1,255}$/.test(value)) throw new Error('Invalid org identifier');
  return value;
};
export const safeType = (value: unknown) => {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(value)) throw new Error('Invalid metadata type');
  return value;
};
export const safeId = (value: unknown, label = 'identifier') => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{5,30}$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};
export const safeUuid = (value: unknown) => {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Invalid local job ID');
  return value;
};
export const cliFieldValue = (value: unknown) => {
  if (value === null) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value !== 'string' || value.length > 131_072) throw new Error('Invalid field value');
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', ' ').replaceAll('\n', '\\n')}'`;
};
export const safeProjectSource = async (projectPath: unknown, sourcePath: unknown) => {
  if (typeof projectPath !== 'string' || typeof sourcePath !== 'string') throw new Error('Project and source paths are required');
  const project = path.resolve(projectPath);
  const source = path.resolve(project, sourcePath);
  if (source !== project && !source.startsWith(project + path.sep)) throw new Error('Source must be inside the Salesforce project');
  await stat(path.join(project, 'sfdx-project.json'));
  await stat(source);
  return { project, source };
};
/** Metadata types the in-app code editor supports, and how each is laid out on disk in Metadata API format. */
export const EDITOR_TYPES: Record<string, { dir: string; suffix?: string; bundle?: boolean }> = {
  ApexClass: { dir: 'classes', suffix: '.cls' },
  ApexTrigger: { dir: 'triggers', suffix: '.trigger' },
  ApexPage: { dir: 'pages', suffix: '.page' },
  ApexComponent: { dir: 'components', suffix: '.component' },
  LightningComponentBundle: { dir: 'lwc', bundle: true },
  AuraDefinitionBundle: { dir: 'aura', bundle: true },
};

export const safeEditorType = (value: unknown): string => {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(EDITOR_TYPES, value)) {
    throw new Error('Unsupported editor metadata type');
  }
  return value;
};

/**
 * Validates the name of a component that already exists in the org (open/read/save/delete).
 * Managed-package components are common and legitimately look like `Namespace__LocalName` —
 * double underscores and an uppercase namespace are normal there, for bundles too, so this only
 * enforces the charset that's safe to use as a filesystem path segment and a CLI argument.
 */
export const safeComponentName = (_type: string, value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,159}$/.test(value)) throw new Error('Invalid component name');
  return value;
};

/** Stricter rule for a name the user is choosing right now — Salesforce's actual limits for a fresh dev name. */
export const safeNewComponentName = (type: string, value: unknown): string => {
  const name = safeComponentName(type, value);
  if (name.includes('__') || name.endsWith('_')) throw new Error('Invalid component name');
  if (EDITOR_TYPES[type]?.bundle && !/^[a-z]/.test(name)) throw new Error('Component names must start with a lowercase letter');
  return name;
};

/** Resolves a client-supplied relative file path against a component's root, rejecting traversal. */
export const safeComponentFile = (root: string, relativePath: unknown) => {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.length > 255 || relativePath.includes('\0')) {
    throw new Error('Invalid file path');
  }
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('File must be inside the component');
  return resolved;
};

export const normalizeOrg = (o: any): SfOrg => ({
  alias: o.alias,
  username: o.username,
  orgId: o.orgId,
  instanceUrl: o.instanceUrl,
  isSandbox: o.isSandbox,
  connectedStatus: o.connectedStatus,
  isDefaultUsername: o.isDefaultUsername,
});
