import type { SfApi } from './api.js';
import { SfApiError } from './api.js';

/*
 * Reads a single component's source through the Tooling API.
 *
 * Opening a file in the editor used to run `sf project retrieve start`, which writes a
 * manifest, starts a CLI process, waits on a Metadata API retrieve, and unzips the result —
 * ten to thirty seconds for one class. The Tooling API returns the same source in about
 * 300ms.
 *
 * The files produced here are written into the identical on-disk layout a retrieve would
 * produce, because saving still deploys that directory through the Metadata API. For bundles
 * this is exact: `LightningComponentResource.FilePath` is already the metadata-format path.
 */

/** A file to write, with its path relative to the retrieve root. */
export interface SourceFile {
  relativePath: string;
  content: string;
}

/** Managed-package source is not readable; the org returns this placeholder instead of a body. */
const HIDDEN_BODY = '(hidden)';

/** `AuraDefinition.DefType` to the file suffix the Metadata API expects in an aura bundle. */
const AURA_SUFFIX_BY_DEFTYPE: Record<string, string> = {
  APPLICATION: '.app',
  COMPONENT: '.cmp',
  CONTROLLER: 'Controller.js',
  DESIGN: '.design',
  DOCUMENTATION: '.auradoc',
  EVENT: '.evt',
  HELPER: 'Helper.js',
  INTERFACE: '.intf',
  RENDERER: 'Renderer.js',
  STYLE: '.css',
  SVG: '.svg',
  TOKENS: '.tokens',
  PROVIDER: 'Provider.js',
  MODEL: 'Model.js',
  TESTSUITE: '.resource',
};

const soqlString = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/** The org stores ApiVersion as a number; metadata XML needs `nn.0`. */
function apiVersionText(value: unknown, fallback: string): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Number.isInteger(numeric) ? `${numeric}.0` : String(numeric);
}

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** Not part of the metadata format — the Tooling API adds them to its `Metadata` payload. */
const NON_METADATA_KEYS = new Set(['urls', 'fullName']);

/**
 * Renders a Tooling API `Metadata` object as the component's `-meta.xml`.
 *
 * Writing this faithfully matters: the file is deployed back on save, so a field dropped here
 * is a field erased in the org. `packageVersions`, which pins the managed-package version an
 * Apex class compiles against, is the case that proved it — a hand-built meta.xml silently
 * lost it. Keys are emitted in the order the API returns them, which is the order the Metadata
 * API's own retrieve produces.
 */
function renderMetadataXml(rootTag: string, metadata: Record<string, any>, fallbackApiVersion: string): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<${rootTag} xmlns="http://soap.sforce.com/2006/04/metadata">`];

  const emit = (key: string, value: unknown, indent: string) => {
    if (value === null || value === undefined || NON_METADATA_KEYS.has(key)) return;
    if (Array.isArray(value)) {
      for (const item of value) emit(key, item, indent);
      return;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).filter(
        ([childKey, childValue]) => childValue !== null && childValue !== undefined && !NON_METADATA_KEYS.has(childKey),
      );
      if (!entries.length) return;
      lines.push(`${indent}<${key}>`);
      for (const [childKey, childValue] of entries) emit(childKey, childValue, `${indent}    `);
      lines.push(`${indent}</${key}>`);
      return;
    }
    // The org stores apiVersion as a number; the metadata format needs `nn.0`.
    const text = key === 'apiVersion' ? apiVersionText(value, fallbackApiVersion) : String(value);
    lines.push(`${indent}<${key}>${escapeXml(text)}</${key}>`);
  };

  let wroteApiVersion = false;
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'apiVersion' && value !== null && value !== undefined) wroteApiVersion = true;
    emit(key, value, '    ');
  }
  // Every one of these types needs an apiVersion to deploy, even if the org omitted it.
  if (!wroteApiVersion) lines.splice(2, 0, `    <apiVersion>${fallbackApiVersion}</apiVersion>`);

  lines.push(`</${rootTag}>`, '');
  return lines.join('\n');
}

/** Builds a meta.xml for a type whose settings are plain columns rather than a `Metadata` blob. */
function simpleMetaXml(rootTag: string, apiVersion: string, extra: [string, string][] = []): string {
  const body = extra.map(([key, value]) => `    <${key}>${escapeXml(value)}</${key}>\n`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<${rootTag} xmlns="http://soap.sforce.com/2006/04/metadata">\n` +
    `    <apiVersion>${apiVersion}</apiVersion>\n${body}</${rootTag}>\n`
  );
}

/**
 * Splits a possibly namespaced component name.
 * A managed component is stored with its namespace in a separate column, so `NS__Thing` has to
 * be queried as namespace `NS` and name `Thing`.
 */
function namespaceCandidates(fullName: string): { namespace: string | null; name: string }[] {
  const candidates: { namespace: string | null; name: string }[] = [{ namespace: null, name: fullName }];
  const separator = fullName.indexOf('__');
  // A local name may legitimately contain `__`, so the unqualified form is always tried first.
  if (separator > 0 && separator + 2 < fullName.length) {
    candidates.push({ namespace: fullName.slice(0, separator), name: fullName.slice(separator + 2) });
  }
  return candidates;
}

/** Runs a Tooling query for each namespace interpretation and returns the first row found. */
async function findRecord(
  api: SfApi,
  org: string,
  sobject: string,
  fields: string,
  fullName: string,
  nameField: string,
  signal?: AbortSignal,
): Promise<Record<string, any> | undefined> {
  for (const { namespace, name } of namespaceCandidates(fullName)) {
    const where = `${nameField} = ${soqlString(name)} AND NamespacePrefix ${namespace ? `= ${soqlString(namespace)}` : '= null'}`;
    const result = await api.query(org, `SELECT ${fields} FROM ${sobject} WHERE ${where} LIMIT 1`, { tooling: true, signal });
    if (result.records.length) return result.records[0];
  }
  return undefined;
}

/**
 * Returns the files making up a component, or throws when the Tooling API cannot supply them
 * (managed source, an unsupported type, or a component that is not there). A throw sends the
 * caller back to the CLI retrieve, so a gap here only costs the old speed, never correctness.
 */
export async function fetchComponentSource(
  api: SfApi,
  org: string,
  type: string,
  fullName: string,
  defaultApiVersion: string,
  signal?: AbortSignal,
): Promise<SourceFile[]> {
  switch (type) {
    case 'ApexClass':
      return await apexSource(api, org, 'ApexClass', 'classes', '.cls', 'Body', fullName, defaultApiVersion, signal);
    case 'ApexTrigger':
      return await apexSource(api, org, 'ApexTrigger', 'triggers', '.trigger', 'Body', fullName, defaultApiVersion, signal);
    case 'ApexPage':
      return await apexSource(api, org, 'ApexPage', 'pages', '.page', 'Markup', fullName, defaultApiVersion, signal);
    case 'ApexComponent':
      return await apexSource(api, org, 'ApexComponent', 'components', '.component', 'Markup', fullName, defaultApiVersion, signal);
    case 'LightningComponentBundle':
      return await lwcBundle(api, org, fullName, defaultApiVersion, signal);
    case 'AuraDefinitionBundle':
      return await auraBundle(api, org, fullName, defaultApiVersion, signal);
    default:
      throw new SfApiError(`No Tooling API source for ${type}`, 0, undefined, true);
  }
}

/**
 * The four Apex-family types: source in a single column, settings in the `Metadata` blob.
 *
 * `Metadata` can only be selected one record at a time, so this locates the record first and
 * then reads its metadata by id — two quick queries, still a fraction of a CLI retrieve.
 */
async function apexSource(
  api: SfApi,
  org: string,
  sobject: 'ApexClass' | 'ApexTrigger' | 'ApexPage' | 'ApexComponent',
  dir: string,
  suffix: string,
  sourceField: 'Body' | 'Markup',
  fullName: string,
  defaultApiVersion: string,
  signal?: AbortSignal,
): Promise<SourceFile[]> {
  const record = await findRecord(api, org, sobject, `Id, Name, ${sourceField}, ApiVersion`, fullName, 'Name', signal);
  if (!record) throw new SfApiError(`${fullName} was not found in ${org}`, 404, 'NOT_FOUND', true);
  const source = typeof record[sourceField] === 'string' ? record[sourceField] : '';
  if (!source || source === HIDDEN_BODY) throw new SfApiError(`${fullName} source is not readable`, 0, undefined, true);

  const detail = await api.query(org, `SELECT Metadata FROM ${sobject} WHERE Id = ${soqlString(record.Id)}`, { tooling: true, signal });
  const metadata = detail.records[0]?.Metadata;
  if (!metadata || typeof metadata !== 'object') {
    throw new SfApiError(`${fullName} metadata is not readable`, 0, undefined, true);
  }
  const fallback = apiVersionText(record.ApiVersion, defaultApiVersion);
  return [
    { relativePath: `${dir}/${fullName}${suffix}`, content: source },
    { relativePath: `${dir}/${fullName}${suffix}-meta.xml`, content: renderMetadataXml(sobject, metadata, fallback) },
  ];
}

/**
 * A Lightning web component bundle. `FilePath` is already the metadata-format path, including
 * the bundle's own `.js-meta.xml`, so the files map across without reconstruction.
 */
async function lwcBundle(
  api: SfApi,
  org: string,
  fullName: string,
  defaultApiVersion: string,
  signal?: AbortSignal,
): Promise<SourceFile[]> {
  const bundle = await findRecord(api, org, 'LightningComponentBundle', 'Id, DeveloperName, ApiVersion', fullName, 'DeveloperName', signal);
  if (!bundle) throw new SfApiError(`${fullName} was not found in ${org}`, 404, 'NOT_FOUND', true);
  const resources = await api.query(
    org,
    `SELECT FilePath, Source FROM LightningComponentResource WHERE LightningComponentBundleId = ${soqlString(bundle.Id)}`,
    { tooling: true, signal },
  );
  const files: SourceFile[] = [];
  for (const resource of resources.records) {
    const filePath = typeof resource.FilePath === 'string' ? resource.FilePath : '';
    const source = typeof resource.Source === 'string' ? resource.Source : '';
    // FilePath is org-relative (`lwc/<bundle>/<file>`); anything else is not safe to place.
    if (!filePath.startsWith('lwc/') || filePath.includes('..')) continue;
    files.push({ relativePath: filePath, content: source });
  }
  if (!files.length) throw new SfApiError(`${fullName} returned no readable files`, 0, undefined, true);
  // A bundle without its meta.xml cannot be deployed back, so synthesize one if it is missing.
  if (!files.some((file) => file.relativePath.endsWith('.js-meta.xml'))) {
    files.push({
      relativePath: `lwc/${fullName}/${fullName}.js-meta.xml`,
      content: simpleMetaXml('LightningComponentBundle', apiVersionText(bundle.ApiVersion, defaultApiVersion), [['isExposed', 'false']]),
    });
  }
  return files;
}

/** An Aura bundle, whose file names come from each definition's `DefType`. */
async function auraBundle(
  api: SfApi,
  org: string,
  fullName: string,
  defaultApiVersion: string,
  signal?: AbortSignal,
): Promise<SourceFile[]> {
  const bundle = await findRecord(api, org, 'AuraDefinitionBundle', 'Id, DeveloperName, ApiVersion, Description', fullName, 'DeveloperName', signal);
  if (!bundle) throw new SfApiError(`${fullName} was not found in ${org}`, 404, 'NOT_FOUND', true);
  const definitions = await api.query(
    org,
    `SELECT DefType, Source FROM AuraDefinition WHERE AuraDefinitionBundleId = ${soqlString(bundle.Id)}`,
    { tooling: true, signal },
  );

  const files: SourceFile[] = [];
  let rootSuffix: string | undefined;
  for (const definition of definitions.records) {
    const suffix = AURA_SUFFIX_BY_DEFTYPE[String(definition.DefType).toUpperCase()];
    if (!suffix) continue;
    // The bundle's meta.xml is named after whichever definition is the bundle root.
    if (suffix === '.cmp' || suffix === '.app' || suffix === '.evt' || suffix === '.intf' || suffix === '.tokens') rootSuffix = suffix;
    files.push({
      relativePath: `aura/${fullName}/${fullName}${suffix}`,
      content: typeof definition.Source === 'string' ? definition.Source : '',
    });
  }
  if (!files.length) throw new SfApiError(`${fullName} returned no readable definitions`, 0, undefined, true);
  // The bundle's description is a column rather than part of any definition, and dropping it
  // on save would clear it in the org.
  const description = typeof bundle.Description === 'string' && bundle.Description ? bundle.Description : undefined;
  files.push({
    relativePath: `aura/${fullName}/${fullName}${rootSuffix ?? '.cmp'}-meta.xml`,
    content: simpleMetaXml(
      'AuraDefinitionBundle',
      apiVersionText(bundle.ApiVersion, defaultApiVersion),
      description ? [['description', description]] : [],
    ),
  });
  return files;
}
