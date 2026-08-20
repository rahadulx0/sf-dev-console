import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { workspace } from '../state/store.js';
import { buildManifest } from '../manifest.js';
import type { Selection } from '../types.js';
import { cli, readSignal, safeOrg, safeType, ttl } from './shared.js';

export async function metadataRoutes(app: FastifyInstance) {
  app.get<{ Params: { org: string } }>('/api/orgs/:org/flows', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const query = [
      'SELECT Id, Definition.DeveloperName, MasterLabel, VersionNumber, Status, ProcessType, LastModifiedDate',
      'FROM Flow',
      'ORDER BY Definition.DeveloperName, VersionNumber DESC',
    ].join(' ');
    const result = await cli.execute(
      ['data', 'query', '--query', query, '--target-org', org, '--use-tooling-api'],
      {
        timeoutMs: 180_000,
        signal: readSignal(request, reply),
        cache: { key: `orgs:${org}:flow-versions`, ttlMs: ttl.metadataComponents },
      },
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
    const result = await cli.execute(['org', 'list', 'metadata-types', '--target-org', org], {
      timeoutMs: 180_000,
      signal: readSignal(request, reply),
      cache: { key: `orgs:${org}:metadata-types`, ttlMs: ttl.metadataTypes },
    });
    return {
      types: (result.metadataObjects || result || [])
        .map((m: any) => ({ name: m.xmlName || m.name, directoryName: m.directoryName, suffix: m.suffix }))
        .filter((m: any) => m.name),
    };
  });

  app.get<{ Params: { org: string; type: string } }>('/api/orgs/:org/metadata/:type', async (request, reply) => {
    const org = safeOrg(request.params.org);
    const type = safeType(request.params.type);
    const result = await cli.execute(['org', 'list', 'metadata', '--metadata-type', type, '--target-org', org], {
      timeoutMs: 180_000,
      signal: readSignal(request, reply),
      cache: { key: `orgs:${org}:metadata:${type}`, ttlMs: ttl.metadataComponents },
    });
    return {
      components: (Array.isArray(result) ? result : result.metadata || [])
        .map((m: any) => ({ fullName: m.fullName, type: m.type, namespacePrefix: m.namespacePrefix }))
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
