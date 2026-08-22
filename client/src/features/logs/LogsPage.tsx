import { useMemo, useState } from 'react';
import { LoaderCircle, ScrollText } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzySearch } from '../../lib/fuzzy';
import { bytes, dateTime } from '../../lib/format';
import { Badge, CodeBlock, Empty, Loading, Pagination, Panel, PanelHead, SearchInput, StaleBar } from '../../ui/primitives';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

export default function LogsPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; body: unknown } | undefined>();
  const [loadingLog, setLoadingLog] = useState('');
  const query = useDebounced(search);

  const logs = useResource<{ logs: any[] }>(orgKey(orgId, 'logs'), (signal) => api(`${orgPath(orgId)}/logs`, { signal }), {
    ttl: 15_000,
  });

  const items = Array.isArray(logs.data?.logs) ? logs.data!.logs : [];
  const shown = useMemo(
    () =>
      fuzzySearch(items, query, (log) => [
        log.LogUser?.Name ?? log.LogUserName ?? '',
        log.Operation ?? '',
        log.Status ?? '',
        log.Request ?? '',
      ]),
    [items, query],
  );
  const visible = shown.slice((page - 1) * size, page * size);

  async function view(id: string) {
    setLoadingLog(id);
    try {
      const response = await api<{ log: unknown }>(`${orgPath(orgId)}/logs/${id}`);
      setSelected({ id, body: response.log });
    } catch (error) {
      toast.error(error);
    } finally {
      setLoadingLog('');
    }
  }

  return (
    <Panel>
      <PanelHead title="Debug logs" description="Inspect Apex execution logs without leaving the console.">
        <Badge>{items.length} logs</Badge>
        <StaleBar updatedAt={logs.updatedAt} refreshing={logs.loading} onRefresh={logs.refresh} />
      </PanelHead>
      <div className="panel-body">
        {logs.pending ? (
          <Loading label="Loading debug logs…" />
        ) : items.length ? (
          <>
            <div className="filter-bar">
              <SearchInput value={search} onChange={setSearch} placeholder="Filter by user, operation, or status…" />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Operation</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Size</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((log) => {
                    const id = log.Id || log.id;
                    return (
                      <tr key={id}>
                        <td>{log.LogUser?.Name || log.LogUserName || '—'}</td>
                        <td>{log.Operation || '—'}</td>
                        <td>{log.Status || '—'}</td>
                        <td className="cell-mono">{dateTime(log.StartTime)}</td>
                        <td className="cell-mono">{log.DurationMilliseconds ?? '—'} ms</td>
                        <td className="cell-mono">{bytes(Number(log.LogLength ?? 0))}</td>
                        <td>
                          <button className="btn btn-link" onClick={() => view(id)} disabled={loadingLog === id}>
                            {loadingLog === id ? <LoaderCircle className="spin" /> : 'View'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={shown.length} page={page} size={size} onPage={setPage} onSize={setSize} />
          </>
        ) : (
          <Empty icon={ScrollText} title="No debug logs" text="No Apex logs are currently available in this org." />
        )}
      </div>

      {selected ? (
        <Modal
          icon={ScrollText}
          title={<span className="mono">{selected.id}</span>}
          wide
          flush
          onClose={() => setSelected(undefined)}
          footer={
            <button
              className="btn"
              onClick={() =>
                navigator.clipboard.writeText(
                  typeof selected.body === 'string' ? selected.body : JSON.stringify(selected.body, null, 2),
                )
              }
            >
              Copy log
            </button>
          }
        >
          <CodeBlock>
            {typeof selected.body === 'string' ? selected.body : JSON.stringify(selected.body, null, 2)}
          </CodeBlock>
        </Modal>
      ) : null}
    </Panel>
  );
}
