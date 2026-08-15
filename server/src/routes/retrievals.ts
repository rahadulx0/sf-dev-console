import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getState, updateState, workspace } from '../state/store.js';
import { buildManifest } from '../manifest.js';
import type { RetrievalRecord, SavedSet, Selection } from '../types.js';
import { cli, safeOrg, safeUuid } from './shared.js';

/** Runs the retrieval in the background and records its outcome against the live state. */
function trackRetrieval(id: string, args: string[]) {
  void (async () => {
    try {
      await cli.execute(args, { timeoutMs: 30 * 60_000, cwd: workspace });
      updateState((draft) => {
        const record = draft.retrievals.find((x) => x.id === id);
        if (record) record.status = 'success';
      });
    } catch (e) {
      updateState((draft) => {
        const record = draft.retrievals.find((x) => x.id === id);
        if (record) {
          record.status = 'failed';
          record.error = e instanceof Error ? e.message : String(e);
        }
      });
    }
  })();
}

export async function retrievalRoutes(app: FastifyInstance) {
  app.get('/api/retrievals', async () => ({ retrievals: getState().retrievals }));
  app.get('/api/activities', async () => ({ activities: getState().activities }));

  app.post<{ Body: { org: string } }>('/api/retrievals/preview', async (req) =>
    cli.execute(['project', 'retrieve', 'preview', '--target-org', safeOrg(req.body.org), '--concise'], {
      cwd: workspace,
      timeoutMs: 5 * 60_000,
    }),
  );

  app.post<{ Body: { org: string; orgLabel?: string; manifestId: string } }>('/api/retrievals/from-manifest', async (req, reply) => {
    const org = safeOrg(req.body.org);
    const manifestId = safeUuid(req.body.manifestId);
    const uploaded = path.join(workspace, 'manifest', 'uploaded', `${manifestId}.xml`);
    await stat(uploaded);
    const id = randomUUID();
    const outputDir = path.join(workspace, 'retrieve', id);
    await mkdir(outputDir, { recursive: true });
    const record: RetrievalRecord = {
      id,
      org,
      orgLabel: req.body.orgLabel || org,
      createdAt: new Date().toISOString(),
      status: 'running',
      selections: [],
      componentCount: 0,
      manifestPath: uploaded,
      outputPath: path.join(outputDir, 'metadata.zip'),
    };
    updateState((draft) => draft.retrievals.unshift(record));
    trackRetrieval(id, [
      'project', 'retrieve', 'start',
      '--manifest', uploaded,
      '--target-org', org,
      '--target-metadata-dir', outputDir,
      '--zip-file-name', 'metadata.zip',
    ]);
    return reply.status(202).send(record);
  });

  app.post<{ Body: { org: string; orgLabel?: string; selections: Selection[]; apiVersion?: string } }>('/api/retrievals', async (req, reply) => {
    const org = safeOrg(req.body.org);
    const id = randomUUID();
    const manifestDir = path.join(workspace, 'manifest', id);
    const outputDir = path.join(workspace, 'retrieve', id);
    await mkdir(manifestDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const manifestPath = path.join(manifestDir, 'package.xml');
    await writeFile(manifestPath, buildManifest(req.body.selections, req.body.apiVersion));
    const record: RetrievalRecord = {
      id,
      org,
      orgLabel: req.body.orgLabel || org,
      createdAt: new Date().toISOString(),
      status: 'running',
      selections: req.body.selections,
      componentCount: req.body.selections.reduce((n, s) => n + s.members.length, 0),
      manifestPath,
      outputPath: path.join(outputDir, 'metadata.zip'),
    };
    updateState((draft) => draft.retrievals.unshift(record));
    trackRetrieval(id, [
      'project', 'retrieve', 'start',
      '--manifest', manifestPath,
      '--target-org', org,
      '--target-metadata-dir', outputDir,
      '--zip-file-name', 'metadata.zip',
    ]);
    return reply.status(202).send(record);
  });

  app.get<{ Params: { id: string } }>('/api/retrievals/:id/download', async (req, reply) => {
    const record = getState().retrievals.find((x) => x.id === req.params.id);
    if (!record?.outputPath) return reply.code(404).send({ error: 'Download not found' });
    return reply
      .type('application/zip')
      .header('Content-Disposition', `attachment; filename="${record.orgLabel}-metadata.zip"`)
      .send(await readFile(record.outputPath));
  });

  app.get('/api/saved-sets', async () => ({ savedSets: getState().savedSets }));

  app.post<{ Body: { name: string; selections: Selection[] } }>('/api/saved-sets', async (req) => {
    if (!req.body.name?.trim()) throw new Error('Name is required');
    const set: SavedSet = {
      id: randomUUID(),
      name: req.body.name.trim().slice(0, 80),
      createdAt: new Date().toISOString(),
      selections: req.body.selections,
    };
    updateState((draft) => draft.savedSets.unshift(set));
    return set;
  });

  app.delete<{ Params: { id: string } }>('/api/saved-sets/:id', async (req) => {
    updateState((draft) => {
      draft.savedSets = draft.savedSets.filter((x) => x.id !== req.params.id);
    });
    return { ok: true };
  });
}
