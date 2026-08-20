import { useMemo, useState } from 'react';
import { Download, LoaderCircle, Search, Workflow } from 'lucide-react';
import { orgKey, useAppState } from '../../app/state';
import { api, orgPath } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { navigate } from '../../lib/router';
import { invalidate, useResource } from '../../lib/resource';
import { Modal } from '../../ui/Modal';
import { Badge, Empty, Loading, SearchInput } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

interface FlowVersion {
  id: string;
  developerName: string;
  label: string;
  version: number;
  status: string;
  processType: string;
  lastModifiedDate: string;
}

export function FlowExport() {
  const { orgId } = useAppState();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [exporting, setExporting] = useState(false);
  const versions = useResource<{ flows: FlowVersion[] }>(
    open ? orgKey(orgId, 'flow-versions') : null,
    (signal) => api(`${orgPath(orgId)}/flows`, { signal }),
    { ttl: 120_000 },
  );

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byName = new Map<string, FlowVersion[]>();
    for (const version of versions.data?.flows ?? []) {
      if (query && !`${version.label} ${version.developerName} ${version.status} ${version.version}`.toLowerCase().includes(query)) continue;
      const list = byName.get(version.developerName) ?? [];
      list.push(version);
      byName.set(version.developerName, list);
    }
    return [...byName.entries()].sort((a, b) => (a[1][0]?.label || a[0]).localeCompare(b[1][0]?.label || b[0]));
  }, [versions.data, search]);

  const selected = (versions.data?.flows ?? []).find((flow) => flow.id === selectedId);

  async function exportVersion() {
    if (!selected) return;
    setExporting(true);
    try {
      const member = `${selected.developerName}-${selected.version}`;
      await api('/retrievals', {
        method: 'POST',
        body: JSON.stringify({
          org: orgId,
          orgLabel: `${selected.label} v${selected.version}`,
          selections: [{ type: 'Flow', members: [member] }],
          apiVersion: '65.0',
          downloadName: `${selected.developerName}-v${selected.version}.zip`,
        }),
      });
      invalidate('jobs:retrievals');
      setOpen(false);
      toast.success('Flow export started', `${selected.label} · version ${selected.version}`, {
        label: 'Track and download',
        run: () => navigate('history'),
      });
    } catch (error) {
      toast.error(error);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <button className="preset" onClick={() => setOpen(true)}>
        <span className="row-icon"><Workflow /></span>
        <div className="row-main">
          <b>Flow export</b>
          <small>Download a specific version</small>
        </div>
      </button>

      {open ? (
        <Modal
          icon={Workflow}
          title="Export a Flow version"
          wide
          onClose={() => !exporting && setOpen(false)}
          closeDisabled={exporting}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)} disabled={exporting}>Cancel</button>
              <button className="btn btn-primary" onClick={exportVersion} disabled={!selected || exporting}>
                {exporting ? <LoaderCircle className="spin" /> : <Download />} Export selected version
              </button>
            </>
          }
        >
          <p className="flow-export-help">Choose an exact saved Flow version. The ZIP will be available in Retrieval history when Salesforce finishes the export.</p>
          <SearchInput value={search} onChange={setSearch} placeholder="Search flows, API names, versions, or status…" />
          {versions.pending ? (
            <Loading label="Loading Flow versions…" />
          ) : versions.error ? (
            <Empty icon={Search} title="Could not load Flow versions" text={versions.error.message} />
          ) : groups.length ? (
            <div className="flow-version-list">
              {groups.map(([developerName, items]) => (
                <section className="flow-version-group" key={developerName}>
                  <div className="flow-version-head">
                    <div><b>{items[0]?.label || developerName}</b><small className="mono">{developerName}</small></div>
                    <Badge>{items.length} version{items.length === 1 ? '' : 's'}</Badge>
                  </div>
                  {items.map((item) => (
                    <label className={`flow-version-row${selectedId === item.id ? ' is-selected' : ''}`} key={item.id}>
                      <input type="radio" name="flow-version" checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} />
                      <b>Version {item.version}</b>
                      <Badge tone={item.status === 'Active' ? 'success' : undefined}>{item.status}</Badge>
                      <span>{item.processType}</span>
                      <small>{dateTime(item.lastModifiedDate)}</small>
                    </label>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <Empty icon={Workflow} title="No Flow versions found" text={search ? 'Try a different search.' : 'This org has no Flow versions available to export.'} />
          )}
        </Modal>
      ) : null}
    </>
  );
}
