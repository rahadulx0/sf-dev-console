import { useMemo, useState } from 'react';
import { AlertTriangle, FileUp, Link, LoaderCircle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Callout, Empty, Panel, PanelHead, SearchInput } from '../../ui/primitives';
import type { SourceFileRow } from '../../types';

const keyOf = (file: SourceFileRow) => `${file.contentDocumentId}:${file.parentId}`;
const sizeOf = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function FileSelectionPanel({ sourceOrg, selected, setSelected }: {
  sourceOrg: string;
  selected: Set<string>;
  setSelected: (value: Set<string>) => void;
}) {
  const [files, setFiles] = useState<SourceFileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? files.filter((file) => `${file.title} ${file.parentName} ${file.parentType}`.toLowerCase().includes(query)) : files;
  }, [files, search]);

  async function load() {
    setLoading(true); setError('');
    try {
      const result = await api<{ files: SourceFileRow[] }>(`/org-deploy/files?sourceOrg=${encodeURIComponent(sourceOrg)}`);
      setFiles(result.files);
      setSelected(new Set([...selected].filter((key) => result.files.some((file) => keyOf(file) === key))));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }

  function toggle(key: string) {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next);
  }

  function selectFiles(rows: SourceFileRow[]) {
    const next = new Set(selected);
    for (const file of rows) next.add(keyOf(file));
    setSelected(next);
  }

  return <Panel>
    <PanelHead title="Salesforce Files · ContentDocument / ContentVersion" description="Data-transfer type: select the latest published version of every file to copy with its linked records.">
      <Badge>Data, not metadata</Badge>
      <Badge tone={selected.size ? 'accent' : undefined}>{selected.size} selected</Badge>
      <button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : files.length ? <RefreshCw /> : <FileUp />}{files.length ? 'Refresh' : 'Browse files'}</button>
    </PanelHead>
    <div className="panel-body">
      <Callout icon={Link} title="How linked records are handled" tone="accent">
        The target is matched by a shared External ID, or by its name when no External ID exists. If no match exists, transferable source fields are used to create the record before the file is attached.
      </Callout>
      {error ? <Callout icon={AlertTriangle} title="Could not read source files" tone="danger">{error}</Callout> : null}
      {files.length ? <>
        <SearchInput value={search} onChange={setSearch} placeholder="Search files or related records…" />
        <div className="type-toolbar file-transfer-toolbar">
          <div className="action-row mt-0">
            <button className="btn btn-sm" onClick={() => selectFiles(files)} disabled={selected.size === files.length}>Select all {files.length}</button>
            {search.trim() ? <button className="btn btn-sm" onClick={() => selectFiles(shown)}>Select {shown.length} matching</button> : null}
            <button className="btn btn-link btn-sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>Clear selection</button>
          </div>
          <small>{shown.length} visible · {files.length} loaded · {selected.size} selected</small>
        </div>
        <div className="file-transfer-list">
          {shown.map((file) => <label className="member file-transfer-row" key={keyOf(file)}>
            <input type="checkbox" checked={selected.has(keyOf(file))} onChange={() => toggle(keyOf(file))} />
            <span><b>{file.title}</b><small>{file.parentType} · {file.parentName}</small></span>
            <Badge>{sizeOf(file.contentSize)}</Badge>
          </label>)}
        </div>
      </> : !loading ? <Empty icon={FileUp} title="No files loaded" text="Browse the source org, then select the files to include in the real deployment." /> : null}
    </div>
  </Panel>;
}
