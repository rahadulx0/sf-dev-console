import { useState } from 'react';
import { FileArchive, LoaderCircle, Search, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { invalidate } from '../../lib/resource';
import { useAppState } from '../../app/state';
import { navigate } from '../../lib/router';
import { bytes } from '../../lib/format';
import { Badge, CodeBlock, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

interface UploadedManifest {
  id: string;
  name: string;
  size: number;
}

/** Upload an existing package.xml, preview source-tracking changes, or retrieve it as a ZIP. */
export function ManifestTools({ compact = false }: { compact?: boolean }) {
  const { orgId } = useAppState();
  const toast = useToast();
  const [manifest, setManifest] = useState<UploadedManifest>();
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<unknown>();

  async function upload(file: File) {
    setBusy('upload');
    try {
      const xml = await file.text();
      setManifest(await api<UploadedManifest>('/manifests/upload', { method: 'POST', body: JSON.stringify({ name: file.name, xml }) }));
      toast.success('Manifest validated', file.name);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy('');
    }
  }

  async function run(kind: 'preview' | 'retrieve') {
    setBusy(kind);
    try {
      if (kind === 'preview') {
        setResult(await api('/retrievals/preview', { method: 'POST', body: JSON.stringify({ org: orgId }) }));
      } else {
        await api('/retrievals/from-manifest', {
          method: 'POST',
          body: JSON.stringify({ org: orgId, orgLabel: orgId, manifestId: manifest!.id }),
        });
        invalidate('jobs:retrievals');
        setResult(undefined);
        toast.success('Manifest retrieval started', manifest!.name, { label: 'Track it', run: () => navigate('history') });
      }
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy('');
    }
  }

  return (
    <Panel className={compact ? 'manifest-tools-compact' : ''}>
      <PanelHead
        title="Existing package.xml"
        description="Upload a Salesforce manifest, preview source-tracking changes, or retrieve it as a ZIP."
      >
        <Badge tone="accent">Manifest workflow</Badge>
      </PanelHead>
      <div className="panel-body">
        <div className="dropzone">
          <FileArchive />
          <div className="row-main">
            <b>{manifest?.name || 'Choose package.xml'}</b>
            <small>
              {manifest
                ? `${bytes(manifest.size)} · validated locally`
                : 'The Salesforce Package namespace and version are validated before use'}
            </small>
          </div>
          <label className="btn">
            {busy === 'upload' ? <LoaderCircle className="spin" /> : <Upload />} Select file
            <input
              type="file"
              accept=".xml,text/xml"
              hidden
              onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}
            />
          </label>
        </div>

        <div className="action-row">
          <button className="btn" onClick={() => run('preview')} disabled={!!busy}>
            {busy === 'preview' ? <LoaderCircle className="spin" /> : <Search />} Preview retrieve changes
          </button>
          <button className="btn btn-primary" onClick={() => run('retrieve')} disabled={!!busy || !manifest}>
            {busy === 'retrieve' ? <LoaderCircle className="spin" /> : <FileArchive />} Retrieve uploaded manifest
          </button>
        </div>

        {result ? <CodeBlock>{JSON.stringify(result, null, 2)}</CodeBlock> : null}
      </div>
    </Panel>
  );
}
