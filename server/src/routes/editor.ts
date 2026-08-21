import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { buildManifest } from '../manifest.js';
import { buildRetrieveArgs } from '../orgDeployCompare.js';
import { workspace } from '../state/store.js';
import { EDITOR_TYPES, cli, safeComponentFile, safeComponentName, safeEditorType, safeNewComponentName, safeOrg, ttl } from './shared.js';

const DEFAULT_API_VERSION = '65.0';

/** Optional files a bundle doesn't get by default, offered through "add file". */
const LWC_FILE_KINDS: Record<string, { file: (name: string) => string; content: string }> = {
  STYLE: { file: (name) => `${name}.css`, content: '\n' },
};
const AURA_FILE_KINDS: Record<string, { file: (name: string) => string; content: string }> = {
  CONTROLLER: { file: (name) => `${name}Controller.js`, content: '({\n\n})\n' },
  HELPER: { file: (name) => `${name}Helper.js`, content: '({\n\n})\n' },
  RENDERER: { file: (name) => `${name}Renderer.js`, content: '({\n\n})\n' },
  STYLE: { file: (name) => `${name}.css`, content: '.THIS {\n}\n' },
  DESIGN: { file: (name) => `${name}.design`, content: '<design:component>\n</design:component>\n' },
  DOCUMENTATION: { file: (name) => `${name}.auradoc`, content: '<aura:documentation>\n  <aura:description>\n\n  </aura:description>\n</aura:documentation>\n' },
  SVG: {
    file: (name) => `${name}.svg`,
    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path fill="#2A739E" d="M0 0h120v120H0z"/></svg>\n',
  },
};

const slug = (value: string) => value.replace(/[^A-Za-z0-9_.-]/g, '_');
const componentBaseDir = (org: string, type: string, fullName: string) => path.join(workspace, 'editor', slug(org), type, fullName);
/** The root to write a brand-new component's files into, before it has ever been retrieved. */
const newComponentRoot = (baseDir: string) => path.join(baseDir, 'unpackaged');
const exists = async (target: string) => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

function metaXml(rootTag: string, extra: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag} xmlns="http://soap.sforce.com/2006/04/metadata">\n  <apiVersion>${DEFAULT_API_VERSION}</apiVersion>\n${extra}</${rootTag}>\n`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Best-effort update of the top-level Apex declaration so the renamed file still compiles. */
function retargetDeclaration(type: string, content: string, oldName: string, newName: string): string {
  if (type === 'ApexClass') return content.replace(new RegExp(`\\b(class|interface|enum)\\s+${escapeRegExp(oldName)}\\b`), `$1 ${newName}`);
  if (type === 'ApexTrigger') return content.replace(new RegExp(`\\btrigger\\s+${escapeRegExp(oldName)}\\b`), `trigger ${newName}`);
  return content;
}

async function writeSkeleton(root: string, type: string, fullName: string, sobject?: unknown) {
  const cfg = EDITOR_TYPES[type];
  const dir = cfg.bundle ? path.join(root, cfg.dir, fullName) : path.join(root, cfg.dir);
  await mkdir(dir, { recursive: true });
  switch (type) {
    case 'ApexClass':
      await writeFile(path.join(dir, `${fullName}.cls`), `public with sharing class ${fullName} {\n}\n`);
      await writeFile(path.join(dir, `${fullName}.cls-meta.xml`), metaXml('ApexClass', '  <status>Active</status>\n'));
      break;
    case 'ApexTrigger': {
      const target = typeof sobject === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(sobject) ? sobject : 'Account';
      await writeFile(path.join(dir, `${fullName}.trigger`), `trigger ${fullName} on ${target} (before insert) {\n}\n`);
      await writeFile(path.join(dir, `${fullName}.trigger-meta.xml`), metaXml('ApexTrigger', '  <status>Active</status>\n'));
      break;
    }
    case 'ApexPage':
      await writeFile(path.join(dir, `${fullName}.page`), '<apex:page>\n\n</apex:page>\n');
      await writeFile(path.join(dir, `${fullName}.page-meta.xml`), metaXml('ApexPage', `  <label>${fullName}</label>\n`));
      break;
    case 'ApexComponent':
      await writeFile(path.join(dir, `${fullName}.component`), '<apex:component>\n\n</apex:component>\n');
      await writeFile(path.join(dir, `${fullName}.component-meta.xml`), metaXml('ApexComponent', `  <label>${fullName}</label>\n`));
      break;
    case 'LightningComponentBundle': {
      const pascal = fullName[0].toUpperCase() + fullName.slice(1);
      await writeFile(
        path.join(dir, `${fullName}.js`),
        `import { LightningElement } from 'lwc';\n\nexport default class ${pascal} extends LightningElement {\n}\n`,
      );
      await writeFile(path.join(dir, `${fullName}.html`), '<template>\n\n</template>\n');
      await writeFile(
        path.join(dir, `${fullName}.js-meta.xml`),
        `<?xml version="1.0" encoding="UTF-8"?>\n<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">\n  <apiVersion>${DEFAULT_API_VERSION}</apiVersion>\n  <isExposed>false</isExposed>\n</LightningComponentBundle>\n`,
      );
      break;
    }
    case 'AuraDefinitionBundle':
      await writeFile(path.join(dir, `${fullName}.cmp`), '<aura:component>\n\n</aura:component>\n');
      await writeFile(
        path.join(dir, `${fullName}.cmp-meta.xml`),
        `<?xml version="1.0" encoding="UTF-8"?>\n<AuraDefinitionBundle xmlns="http://soap.sforce.com/2006/04/metadata">\n  <apiVersion>${DEFAULT_API_VERSION}</apiVersion>\n</AuraDefinitionBundle>\n`,
      );
      break;
  }
}

async function listComponentFiles(root: string, type: string, fullName: string): Promise<string[]> {
  const cfg = EDITOR_TYPES[type];
  if (cfg.bundle) {
    const bundleDir = path.join(root, cfg.dir, fullName);
    let entries;
    try {
      entries = await readdir(bundleDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => `${cfg.dir}/${fullName}/${entry.name}`)
      .sort();
  }
  const suffix = cfg.suffix!;
  const candidates = [`${cfg.dir}/${fullName}${suffix}`, `${cfg.dir}/${fullName}${suffix}-meta.xml`];
  const files: string[] = [];
  for (const relative of candidates) {
    if (await exists(path.join(root, relative))) files.push(relative);
  }
  return files;
}

function mainFileOf(type: string, fullName: string, files: string[]): string | undefined {
  const cfg = EDITOR_TYPES[type];
  if (cfg.bundle) {
    const preferred = type === 'LightningComponentBundle' ? `${fullName}.js` : `${fullName}.cmp`;
    return files.find((f) => f.endsWith(`/${preferred}`)) ?? files.find((f) => !f.endsWith('-meta.xml')) ?? files[0];
  }
  return files.find((f) => !f.endsWith('-meta.xml')) ?? files[0];
}

/**
 * `sf project retrieve start --target-metadata-dir <dir> --unzip` nests the retrieved files
 * under a package-name folder — `unpackaged` when the manifest is anonymous — and in practice
 * that has shown up doubled (`unpackaged/unpackaged/...`), the same quirk
 * `orgDeployCompare.ts`'s `stripUnpackagedWrapper` works around. Walk however deep it goes.
 */
async function resolveComponentRoot(baseDir: string): Promise<string> {
  let current = path.join(baseDir, 'unpackaged');
  while (await exists(path.join(current, 'unpackaged'))) current = path.join(current, 'unpackaged');
  return current;
}

async function retrieveComponent(org: string, type: string, fullName: string, baseDir: string): Promise<string> {
  const manifestDir = path.join(baseDir, '_manifest');
  await mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'package.xml');
  await writeFile(manifestPath, buildManifest([{ type, members: [fullName] }], DEFAULT_API_VERSION));
  await cli.execute(buildRetrieveArgs(manifestPath, org, baseDir), { cwd: workspace, timeoutMs: 5 * 60_000 });
  const root = await resolveComponentRoot(baseDir);
  if (!(await exists(root))) throw new Error(`${fullName} could not be retrieved from ${org}`);
  return root;
}

async function ensureComponentRoot(org: string, type: string, fullName: string, baseDir: string): Promise<string> {
  const root = await resolveComponentRoot(baseDir);
  if (await exists(root)) return root;
  return retrieveComponent(org, type, fullName, baseDir);
}

async function componentExists(org: string, type: string, fullName: string): Promise<boolean> {
  const result = await cli.execute(['org', 'list', 'metadata', '--metadata-type', type, '--target-org', org], {
    timeoutMs: 60_000,
    cache: { key: `orgs:${org}:metadata:${type}`, ttlMs: ttl.metadataComponents },
  });
  const list = Array.isArray(result) ? result : result.metadata || [];
  return list.some((m: any) => m.fullName === fullName);
}

async function deployMetadataDir(org: string, dir: string) {
  return cli.execute(['project', 'deploy', 'start', '--metadata-dir', dir, '--target-org', org, '--wait', '10'], {
    cwd: workspace,
    timeoutMs: 11 * 60_000,
  });
}

async function copyRenamed(type: string, oldRoot: string, oldName: string, newRoot: string, newName: string) {
  const cfg = EDITOR_TYPES[type];
  if (cfg.bundle) {
    const oldBundleDir = path.join(oldRoot, cfg.dir, oldName);
    const newBundleDir = path.join(newRoot, cfg.dir, newName);
    await mkdir(newBundleDir, { recursive: true });
    const entries = await readdir(oldBundleDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const rest = entry.name.startsWith(oldName) ? entry.name.slice(oldName.length) : `-${entry.name}`;
      const newFileName = `${newName}${rest}`;
      const content = await readFile(path.join(oldBundleDir, entry.name));
      await writeFile(path.join(newBundleDir, newFileName), content);
    }
    return;
  }
  const suffix = cfg.suffix!;
  const mainOld = path.join(oldRoot, cfg.dir, `${oldName}${suffix}`);
  const metaOld = `${mainOld}-meta.xml`;
  const mainNew = path.join(newRoot, cfg.dir, `${newName}${suffix}`);
  const metaNew = `${mainNew}-meta.xml`;
  await mkdir(path.dirname(mainNew), { recursive: true });
  const body = retargetDeclaration(type, await readFile(mainOld, 'utf8'), oldName, newName);
  await writeFile(mainNew, body, 'utf8');
  await writeFile(metaNew, await readFile(metaOld));
}

async function destructiveDeploy(org: string, type: string, fullName: string) {
  const scope = path.join(workspace, 'editor', '_ops', randomUUID());
  await mkdir(scope, { recursive: true });
  try {
    await writeFile(path.join(scope, 'package.xml'), buildManifest([], DEFAULT_API_VERSION));
    await writeFile(path.join(scope, 'destructiveChangesPost.xml'), buildManifest([{ type, members: [fullName] }], DEFAULT_API_VERSION));
    return await deployMetadataDir(org, scope);
  } finally {
    await rm(scope, { recursive: true, force: true }).catch(() => {});
  }
}

export async function editorRoutes(app: FastifyInstance) {
  app.post<{ Params: { org: string }; Body: { type: string; fullName: string; force?: boolean } }>(
    '/api/orgs/:org/editor/open',
    async (req) => {
      const org = safeOrg(req.params.org);
      const type = safeEditorType(req.body.type);
      const fullName = safeComponentName(type, req.body.fullName);
      const baseDir = componentBaseDir(org, type, fullName);
      const root = req.body.force ? await retrieveComponent(org, type, fullName, baseDir) : await ensureComponentRoot(org, type, fullName, baseDir);
      const files = await listComponentFiles(root, type, fullName);
      if (!files.length) throw new Error('No files were found for this component');
      return { type, fullName, files, mainFile: mainFileOf(type, fullName, files) };
    },
  );

  app.get<{ Params: { org: string }; Querystring: { type: string; fullName: string; file: string } }>(
    '/api/orgs/:org/editor/file',
    async (req) => {
      const org = safeOrg(req.params.org);
      const type = safeEditorType(req.query.type);
      const fullName = safeComponentName(type, req.query.fullName);
      const root = await resolveComponentRoot(componentBaseDir(org, type, fullName));
      const filePath = safeComponentFile(root, req.query.file);
      if (!(await exists(filePath))) throw new Error('File not found. Open the component again.');
      const buffer = await readFile(filePath);
      if (buffer.includes(0)) throw new Error('Binary files cannot be edited here');
      return { file: req.query.file, content: buffer.toString('utf8') };
    },
  );

  app.put<{ Params: { org: string }; Body: { type: string; fullName: string; file: string; content: string } }>(
    '/api/orgs/:org/editor/file',
    async (req) => {
      const org = safeOrg(req.params.org);
      const type = safeEditorType(req.body.type);
      const fullName = safeComponentName(type, req.body.fullName);
      if (typeof req.body.content !== 'string' || req.body.content.length > 2_000_000) throw new Error('Invalid file content');
      const root = await resolveComponentRoot(componentBaseDir(org, type, fullName));
      const filePath = safeComponentFile(root, req.body.file);
      if (!(await exists(filePath))) throw new Error('File not found. Open the component again before saving.');
      await writeFile(filePath, req.body.content, 'utf8');
      const result = await deployMetadataDir(org, root);
      cli.invalidate(`orgs:${org}:metadata:${type}`);
      return result;
    },
  );

  app.post<{ Params: { org: string }; Body: { type: string; fullName: string; sobject?: string } }>(
    '/api/orgs/:org/editor/create',
    async (req) => {
      const org = safeOrg(req.params.org);
      const type = safeEditorType(req.body.type);
      const fullName = safeNewComponentName(type, req.body.fullName);
      if (await componentExists(org, type, fullName)) throw new Error(`${fullName} already exists in ${org}`);
      const baseDir = componentBaseDir(org, type, fullName);
      const root = newComponentRoot(baseDir);
      await mkdir(root, { recursive: true });
      await writeSkeleton(root, type, fullName, req.body.sobject);
      await writeFile(path.join(root, 'package.xml'), buildManifest([{ type, members: [fullName] }], DEFAULT_API_VERSION));
      const deploy = await deployMetadataDir(org, root);
      cli.invalidate(`orgs:${org}:metadata:${type}`);
      const files = await listComponentFiles(root, type, fullName);
      return { type, fullName, files, mainFile: mainFileOf(type, fullName, files), deploy };
    },
  );

  app.get<{ Params: { org: string }; Querystring: { type: string } }>('/api/orgs/:org/editor/file-kinds', async (req) => {
    const type = safeEditorType(req.query.type);
    if (!EDITOR_TYPES[type].bundle) return { kinds: [] };
    const kinds = type === 'LightningComponentBundle' ? LWC_FILE_KINDS : AURA_FILE_KINDS;
    return { kinds: Object.keys(kinds) };
  });

  app.post<{ Params: { org: string }; Body: { type: string; fullName: string; kind: string } }>(
    '/api/orgs/:org/editor/files',
    async (req) => {
      const org = safeOrg(req.params.org);
      const type = safeEditorType(req.body.type);
      const cfg = EDITOR_TYPES[type];
      if (!cfg.bundle) throw new Error('Only Lightning Web Component and Aura bundles support adding files');
      const fullName = safeComponentName(type, req.body.fullName);
      const kinds = type === 'LightningComponentBundle' ? LWC_FILE_KINDS : AURA_FILE_KINDS;
      const kind = kinds[req.body.kind];
      if (!kind) throw new Error('Unknown file kind for this bundle type');
      const baseDir = componentBaseDir(org, type, fullName);
      const root = await ensureComponentRoot(org, type, fullName, baseDir);
      const bundleDir = path.join(root, cfg.dir, fullName);
      const fileName = kind.file(fullName);
      const filePath = path.join(bundleDir, fileName);
      if (await exists(filePath)) throw new Error(`${fileName} already exists`);
      await writeFile(filePath, kind.content);
      const deploy = await deployMetadataDir(org, root);
      const files = await listComponentFiles(root, type, fullName);
      return { type, fullName, files, mainFile: mainFileOf(type, fullName, files), deploy };
    },
  );

  app.post<{ Params: { org: string }; Body: { type: string; fullName: string; newFullName: string; confirmation: string } }>(
    '/api/orgs/:org/editor/rename',
    async (req) => {
      const org = safeOrg(req.params.org);
      const type = safeEditorType(req.body.type);
      const oldName = safeComponentName(type, req.body.fullName);
      const newName = safeNewComponentName(type, req.body.newFullName);
      if (oldName === newName) throw new Error('New name must be different');
      const phrase = `RENAME ${oldName}`;
      if (req.body.confirmation !== phrase) throw new Error(`Confirmation must exactly match: ${phrase}`);
      if (await componentExists(org, type, newName)) throw new Error(`${newName} already exists in ${org}`);

      const oldBase = componentBaseDir(org, type, oldName);
      const oldRoot = await retrieveComponent(org, type, oldName, oldBase);
      const newBase = componentBaseDir(org, type, newName);
      const newRoot = newComponentRoot(newBase);
      await mkdir(newRoot, { recursive: true });
      await copyRenamed(type, oldRoot, oldName, newRoot, newName);
      await writeFile(path.join(newRoot, 'package.xml'), buildManifest([{ type, members: [newName] }], DEFAULT_API_VERSION));
      const created = await deployMetadataDir(org, newRoot);
      const deleted = await destructiveDeploy(org, type, oldName).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      await rm(oldBase, { recursive: true, force: true }).catch(() => {});
      cli.invalidate(`orgs:${org}:metadata:${type}`);

      const files = await listComponentFiles(newRoot, type, newName);
      return { type, fullName: newName, files, mainFile: mainFileOf(type, newName, files), created, deleted };
    },
  );

  app.post<{ Params: { org: string }; Body: { type: string; fullName: string; confirmation: string } }>(
    '/api/orgs/:org/editor/delete',
    async (req) => {
      const org = safeOrg(req.params.org);
      const type = safeEditorType(req.body.type);
      const fullName = safeComponentName(type, req.body.fullName);
      const phrase = `DELETE ${fullName}`;
      if (req.body.confirmation !== phrase) throw new Error(`Confirmation must exactly match: ${phrase}`);
      const result = await destructiveDeploy(org, type, fullName);
      await rm(componentBaseDir(org, type, fullName), { recursive: true, force: true }).catch(() => {});
      cli.invalidate(`orgs:${org}:metadata:${type}`);
      return result;
    },
  );
}
