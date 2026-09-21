import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { workspace } from '../state/store.js';
import { buildManifest } from '../manifest.js';
import type { Selection } from '../types.js';
import { cached } from '../sf/cache.js';
import { cli, readFast, readSignal, safeOrg, safeType, sfApi, stale, ttl } from './shared.js';

export async function metadataRoutes(app: FastifyInstance) {
  app.get<{ Params: { org: string } }>('/api/orgs/:org/flows', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const query = [
      'SELECT Id, Definition.DeveloperName, MasterLabel, VersionNumber, Status, ProcessType, LastModifiedDate',
      'FROM Flow',
      'ORDER BY Definition.DeveloperName, VersionNumber DESC',
    ].join(' ');
    const signal = readSignal(request, reply);
    const result = await cached(
      `orgs:${org}:flow-versions`,
      { ttlMs: ttl.metadataComponents, staleMs: stale.metadataComponents },
      () =>
        readFast(
          () => sfApi.query(org, query, { tooling: true, signal, timeoutMs: 180_000 }),
          () => cli.execute(['data', 'query', '--query', query, '--target-org', org, '--use-tooling-api'], { timeoutMs: 180_000, signal }),
        ),
    );
    return {
      flows: (result.records || [])
        .map((record: any) => ({
          id: record.Id,
          developerName: record.Definition?.DeveloperName,
          label: record.MasterLabel,
          version: Number(record.VersionNumber),
          status: record.Status,
          processType: record.ProcessType,
          lastModifiedDate: record.LastModifiedDate,
        }))
        .filter((flow: any) => flow.id && flow.developerName && Number.isInteger(flow.version) && flow.version > 0),
    };
  });

  app.get<{ Params: { org: string } }>('/api/orgs/:org/metadata/types', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const signal = readSignal(request, reply);
    const result = await cached(
      `orgs:${org}:metadata-types`,
      { ttlMs: ttl.metadataTypes, staleMs: stale.metadataTypes, persist: true },
      () =>
        readFast(
          () => sfApi.describeMetadata(org, { signal }),
          () => cli.execute(['org', 'list', 'metadata-types', '--target-org', org], { timeoutMs: 180_000, signal }),
        ),
    );
    return {
      types: (result.metadataObjects || result || [])
        .map((m: any) => ({ name: m.xmlName || m.name, directoryName: m.directoryName, suffix: m.suffix }))
        .filter((m: any) => m.name),
    };
  });

  /*
   * The slowest read in the app: `sf org list metadata --metadata-type ApexClass` measured at
   * 11.9 seconds. The Metadata API's listMetadata call returns the identical component set —
   * 2,455 entries from both paths — in about 3 seconds, and a cached copy answers instantly.
   */
  app.get<{ Params: { org: string; type: string } }>('/api/orgs/:org/metadata/:type', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const type = safeType(request.params.type);
    const signal = readSignal(request, reply);
    const result = await cached(
      `orgs:${org}:metadata:${type}`,
      { ttlMs: ttl.metadataComponents, staleMs: stale.metadataComponents, persist: true },
      () =>
        readFast(
          () => sfApi.listMetadata(org, type, { signal }),
          () => cli.execute(['org', 'list', 'metadata', '--metadata-type', type, '--target-org', org], { timeoutMs: 180_000, signal }),
        ),
    );
    return {
      components: (Array.isArray(result) ? result : result.metadata || [])
        .map((m: any) => ({
          fullName: m.fullName,
          type: m.type,
          namespacePrefix: m.namespacePrefix,
          manageableState: m.manageableState,
        }))
        .filter((m: any) => m.fullName),
    };
  });

  app.post<{ Body: { selections: Selection[]; apiVersion?: string } }>('/api/manifests/preview', async (req) => ({
    xml: buildManifest(req.body.selections, req.body.apiVersion),
  }));

  app.post<{ Body: { name?: string; xml: string } }>('/api/manifests/upload', async (req) => {
    const xml = req.body.xml?.trim();
    if (
      !xml ||
      xml.length > 1_000_000 ||
      !/<Package\b[^>]*xmlns=["']http:\/\/soap\.sforce\.com\/2006\/04\/metadata["'][^>]*>/i.test(xml) ||
      !/<version>[^<]+<\/version>/i.test(xml)
    ) {
      throw new Error('Invalid Salesforce package.xml');
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCTYPE and entities are not allowed');
    const id = randomUUID();
    const dir = path.join(workspace, 'manifest', 'uploaded');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${id}.xml`), xml);
    return { id, name: (req.body.name || 'package.xml').slice(0, 100), size: Buffer.byteLength(xml) };
  });
}
