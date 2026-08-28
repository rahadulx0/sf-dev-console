import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { CliRunner } from './cli/CliRunner.js';

export interface SourceFileRow {
  contentDocumentId: string;
  contentVersionId: string;
  title: string;
  pathOnClient: string;
  fileExtension?: string;
  contentSize: number;
  parentId: string;
  parentType: string;
  parentName: string;
}

export interface FileTransferResult extends SourceFileRow {
  status: 'succeeded' | 'failed';
  targetParentId?: string;
  targetContentDocumentId?: string;
  parentAction?: 'matched' | 'created';
  error?: string;
}

type Auth = { accessToken: string; instanceUrl: string; orgId: string };

function soqlString(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function safeFileName(row: SourceFileRow) {
  const fallback = `${row.title}${row.fileExtension ? `.${row.fileExtension}` : ''}`;
  return path.basename(row.pathOnClient || fallback).replace(/[\u0000-\u001f]/g, '_') || 'salesforce-file';
}

async function auth(cli: Pick<CliRunner, 'execute'>, org: string): Promise<Auth> {
  const [info, token] = await Promise.all([
    cli.execute(['org', 'display', '--target-org', org], { timeoutMs: 120_000 }),
    cli.execute(['org', 'auth', 'show-access-token', '--target-org', org], { timeoutMs: 120_000 }),
  ]);
  if (!token?.accessToken || !info?.instanceUrl || !info?.id) throw new Error(`Could not obtain an API session for ${org}`);
  return { accessToken: token.accessToken, instanceUrl: info.instanceUrl, orgId: info.id };
}

async function rest<T>(credentials: Auth, route: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${credentials.instanceUrl}${route}`, {
    ...init,
    headers: { Authorization: `Bearer ${credentials.accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Salesforce API ${response.status}: ${detail.slice(0, 1000)}`);
  }
  return (await response.json()) as T;
}

async function queryAll(credentials: Auth, query: string): Promise<any[]> {
  let route = `/services/data/v65.0/query?q=${encodeURIComponent(query)}`;
  const records: any[] = [];
  while (route) {
    const page = await rest<{ records: any[]; done: boolean; nextRecordsUrl?: string }>(credentials, route);
    records.push(...page.records);
    route = page.done ? '' : page.nextRecordsUrl || '';
  }
  return records;
}

export async function listSourceFiles(cli: Pick<CliRunner, 'execute'>, org: string): Promise<SourceFileRow[]> {
  const credentials = await auth(cli, org);
  const versions = await queryAll(credentials,
    `SELECT Id, ContentDocumentId, Title, PathOnClient, FileExtension, ContentSize FROM ContentVersion WHERE IsLatest = true ORDER BY LastModifiedDate DESC`,
  );
  const versionByDocument = new Map(versions.map((version) => [version.ContentDocumentId, version]));
  const records: any[] = [];
  for (let index = 0; index < versions.length; index += 100) {
    const ids = versions.slice(index, index + 100).map((version) => soqlString(version.ContentDocumentId)).join(',');
    if (ids) records.push(...await queryAll(credentials,
      `SELECT ContentDocumentId, LinkedEntityId, LinkedEntity.Type FROM ContentDocumentLink WHERE ContentDocumentId IN (${ids})`,
    ));
  }
  const seen = new Set<string>();
  const rows: SourceFileRow[] = [];
  for (const record of records) {
    const rawParentType = record.LinkedEntity?.Type;
    const parentType = rawParentType === '00D' || String(record.LinkedEntityId).startsWith('00D') ? 'Organization' : rawParentType;
    if (!parentType || !/^[A-Za-z][A-Za-z0-9_]*$/.test(parentType) || ['User', 'CollaborationGroup'].includes(parentType)) continue;
    const key = `${record.ContentDocumentId}:${record.LinkedEntityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const version = versionByDocument.get(record.ContentDocumentId);
    if (!version) continue;
    rows.push({
      contentDocumentId: record.ContentDocumentId,
      contentVersionId: version.Id,
      title: version.Title || 'Untitled',
      pathOnClient: version.PathOnClient || '',
      fileExtension: version.FileExtension || undefined,
      contentSize: Number(version.ContentSize) || 0,
      parentId: record.LinkedEntityId,
      parentType,
      parentName: parentType === 'Organization' ? 'Organization-wide file' : record.LinkedEntityId,
    });
  }

  for (const type of new Set(rows.map((row) => row.parentType))) {
    if (type === 'Organization') continue;
    const group = rows.filter((row) => row.parentType === type);
    try {
      const describe = await rest<any>(credentials, `/services/data/v65.0/sobjects/${encodeURIComponent(type)}/describe`);
      const nameField = describe.fields?.find((field: any) => field.nameField)?.name;
      if (!nameField) continue;
      const ids = group.map((row) => soqlString(row.parentId)).join(',');
      const parents = await queryAll(credentials, `SELECT Id, ${nameField} FROM ${type} WHERE Id IN (${ids})`);
      const names = new Map(parents.map((parent) => [parent.Id, String(parent[nameField] ?? parent.Id)]));
      for (const row of group) row.parentName = names.get(row.parentId) || row.parentId;
    } catch { /* Some linked entity types aren't queryable; their IDs remain visible. */ }
  }
  return rows;
}

async function resolveParent(source: Auth, target: Auth, row: SourceFileRow): Promise<{ id: string; action: 'matched' | 'created' }> {
  if (row.parentType === 'Organization') return { id: target.orgId, action: 'matched' };
  const [sourceDescribe, targetDescribe] = await Promise.all([
    rest<any>(source, `/services/data/v65.0/sobjects/${encodeURIComponent(row.parentType)}/describe`),
    rest<any>(target, `/services/data/v65.0/sobjects/${encodeURIComponent(row.parentType)}/describe`),
  ]);
  if (!targetDescribe.createable) throw new Error(`${row.parentType} records cannot be created in the target org`);
  const targetFields = new Map<string, any>((targetDescribe.fields || []).map((field: any) => [field.name, field]));
  const sourceFields: any[] = sourceDescribe.fields || [];
  const matchField = sourceFields.find((field) => field.externalId && targetFields.get(field.name)?.externalId)
    || sourceFields.find((field) => field.nameField && targetFields.has(field.name));
  const candidates = sourceFields.filter((field) => {
    const targetField = targetFields.get(field.name);
    const isCompoundConstituent = targetField?.compoundFieldName && targetField.compoundFieldName !== field.name;
    return targetField?.createable && !isCompoundConstituent && field.name !== 'Id' && !field.calculated && !field.autoNumber && field.type !== 'reference' && field.type !== 'address' && field.type !== 'location';
  });
  const fieldNames = [...new Set(candidates.map((field) => field.name).concat(matchField?.name || []))];
  const sourceRecord = await rest<any>(source, `/services/data/v65.0/sobjects/${encodeURIComponent(row.parentType)}/${row.parentId}?fields=${fieldNames.map(encodeURIComponent).join(',')}`);
  if (matchField && sourceRecord[matchField.name] != null) {
    const matches = await queryAll(target, `SELECT Id FROM ${row.parentType} WHERE ${matchField.name} = ${soqlString(String(sourceRecord[matchField.name]))} LIMIT 2`);
    if (matches.length === 1) return { id: matches[0].Id, action: 'matched' };
    if (matches.length > 1) throw new Error(`Multiple target ${row.parentType} records match ${matchField.name}`);
  }
  const payload: Record<string, unknown> = {};
  for (const field of candidates) {
    const value = sourceRecord[field.name];
    if (value == null) continue;
    const targetField = targetFields.get(field.name);
    if (targetField?.restrictedPicklist) {
      const allowed = new Set((targetField.picklistValues || []).filter((entry: any) => entry.active).map((entry: any) => entry.value));
      const values = targetField.type === 'multipicklist' ? String(value).split(';') : [String(value)];
      if (values.some((entry) => !allowed.has(entry))) continue;
    }
    payload[field.name] = value;
  }
  const created = await rest<{ id: string }>(target, `/services/data/v65.0/sobjects/${encodeURIComponent(row.parentType)}`, {
    method: 'POST', body: JSON.stringify(payload),
  });
  return { id: created.id, action: 'created' };
}

export async function transferFiles(
  cli: Pick<CliRunner, 'execute'>,
  sourceOrg: string,
  targetOrg: string,
  selected: SourceFileRow[],
  tempRoot: string,
): Promise<FileTransferResult[]> {
  const [source, target] = await Promise.all([auth(cli, sourceOrg), auth(cli, targetOrg)]);
  await mkdir(tempRoot, { recursive: true });
  const parentCache = new Map<string, Promise<{ id: string; action: 'matched' | 'created' }>>();
  const results: FileTransferResult[] = [];
  try {
    for (const row of selected) {
      try {
        if (!/^068[\w]{12,15}$/.test(row.contentVersionId) || !/^[\w]{15,18}$/.test(row.parentId)) throw new Error('Invalid source file selection');
        const cacheKey = `${row.parentType}:${row.parentId}`;
        let parent = parentCache.get(cacheKey);
        if (!parent) {
          parent = resolveParent(source, target, row);
          parentCache.set(cacheKey, parent);
        }
        const resolved = await parent;
        const response = await fetch(`${source.instanceUrl}/services/data/v65.0/sobjects/ContentVersion/${row.contentVersionId}/VersionData`, {
          headers: { Authorization: `Bearer ${source.accessToken}` }, redirect: 'follow',
        });
        if (!response.ok) throw new Error(`File download failed (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const fileDir = path.join(tempRoot, row.contentVersionId);
        await mkdir(fileDir, { recursive: true });
        const filePath = path.join(fileDir, safeFileName(row));
        await writeFile(filePath, bytes);
        const uploaded = await cli.execute(['data', 'create', 'file', '--file', filePath, '--parent-id', resolved.id, '--target-org', targetOrg], { timeoutMs: 10 * 60_000 });
        let targetContentDocumentId = uploaded?.id || uploaded?.contentDocumentId;
        if (!targetContentDocumentId) {
          const links = await queryAll(target, `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = ${soqlString(resolved.id)} ORDER BY SystemModstamp DESC LIMIT 1`);
          targetContentDocumentId = links[0]?.ContentDocumentId;
        }
        results.push({ ...row, status: 'succeeded', targetParentId: resolved.id, targetContentDocumentId, parentAction: resolved.action });
      } catch (error) {
        results.push({ ...row, status: 'failed', error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  return results;
}
