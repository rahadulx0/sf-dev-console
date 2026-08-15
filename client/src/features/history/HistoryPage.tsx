import { useEffect } from 'react';
import { Check, FileArchive, History, LoaderCircle, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { dateTime, elapsed } from '../../lib/format';
import { useTicker } from '../../lib/hooks';
import { Badge, Empty, Loading, Panel, PanelHead, StaleBar } from '../../ui/primitives';
import type { RetrievalRecord } from '../../types';

const POLL_MS = 3000;

export default function HistoryPage() {
  const retrievals = useResource<{ retrievals: RetrievalRecord[] }>(
    'jobs:retrievals',
    (signal) => api('/retrievals', { signal }),
    { ttl: POLL_MS },
  );
  const items = retrievals.data?.retrievals ?? [];
  const running = items.some((item) => item.status === 'running');

  useTicker(1000, running);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(retrievals.refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [running, retrievals.refresh]);

  return (
    <Panel>
      <PanelHead title="Metadata retrievals" description="Jobs and downloadable output stored in your device workspace.">
        <Badge>{items.length} jobs</Badge>
        <StaleBar updatedAt={retrievals.updatedAt} refreshing={retrievals.loading} onRefresh={retrievals.refresh} />
      </PanelHead>
      <div className="panel-body">
        {retrievals.pending ? (
          <Loading label="Loading retrieval history…" />
        ) : items.length ? (
          <div className="row-list">
            {items.map((item) => (
              <div className="row" key={item.id}>
                <span className={`row-icon is-${item.status}`}>
                  {item.status === 'running' ? <LoaderCircle className="spin" /> : item.status === 'success' ? <Check /> : <X />}
                </span>
                <div className="row-main">
                  <b>{item.orgLabel} metadata</b>
                  <small>
                    {dateTime(item.createdAt)} · {item.componentCount} selections
                    {item.status === 'running' ? ` · running ${elapsed(item.createdAt)}` : ''}
                  </small>
                  {item.error ? <small style={{ color: 'var(--danger)' }}>{item.error}</small> : null}
                </div>
                <Badge tone={item.status === 'success' ? 'success' : item.status === 'failed' ? 'danger' : 'accent'}>
                  {item.status}
                </Badge>
                {item.status === 'success' ? (
                  <a className="btn" href={`/api/retrievals/${item.id}/download`}>
                    <FileArchive /> Download ZIP
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={History} title="No retrievals yet" text="Metadata retrieval jobs you start will appear here." />
        )}
      </div>
    </Panel>
  );
}
