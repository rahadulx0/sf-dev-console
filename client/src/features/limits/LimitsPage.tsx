import { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzySearch } from '../../lib/fuzzy';
import { Badge, Empty, Loading, Panel, PanelHead, SearchInput, StaleBar } from '../../ui/primitives';

interface Limit {
  name: string;
  max: number;
  remaining: number;
}

/** The CLI returns either an array or a keyed object depending on version. */
function normalize(payload: unknown): Limit[] {
  const rows = Array.isArray(payload)
    ? payload
    : Object.entries((payload as Record<string, any>) || {}).map(([name, value]) => ({ name, ...value }));
  return rows.map((row: any) => ({
    name: row.name ?? row.Name ?? 'Limit',
    max: Number(row.max ?? row.Max ?? 0),
    remaining: Number(row.remaining ?? row.Remaining ?? 0),
  }));
}

export default function LimitsPage() {
  const { orgId } = useAppState();
  const [search, setSearch] = useState('');
  const query = useDebounced(search);
  const limits = useResource(orgKey(orgId, 'limits'), (signal) => api(`${orgPath(orgId)}/limits`, { signal }), {
    ttl: 30_000,
  });

  const rows = useMemo(() => normalize(limits.data), [limits.data]);
  const shown = useMemo(() => fuzzySearch(rows, query, (row) => row.name), [rows, query]);

  return (
    <Panel>
      <PanelHead title="Org consumption" description="Current limits and remaining capacity reported by Salesforce.">
        <Badge>{rows.length} limits</Badge>
        <StaleBar updatedAt={limits.updatedAt} refreshing={limits.loading} onRefresh={limits.refresh} />
      </PanelHead>
      <div className="panel-body">
        {limits.pending ? (
          <Loading label="Loading API limits…" />
        ) : rows.length ? (
          <>
            <div className="filter-bar">
              <SearchInput value={search} onChange={setSearch} placeholder="Filter limits…" />
            </div>
            <div className="limit-grid">
              {shown.map((limit) => {
                const used = Math.max(0, limit.max - limit.remaining);
                const ratio = limit.max > 0 ? used / limit.max : 0;
                return (
                  <div className="limit" key={limit.name}>
                    <div className="limit-head">
                      <b title={limit.name}>{limit.name}</b>
                      <span className={ratio > 0.9 ? 'limit-critical' : ratio > 0.7 ? 'limit-warn' : ''}>
                        {Math.round(ratio * 100)}%
                      </span>
                    </div>
                    <progress className="progress" max={Math.max(1, limit.max)} value={used} />
                    <small>
                      {limit.remaining.toLocaleString()} remaining of {limit.max.toLocaleString()}
                    </small>
                  </div>
                );
              })}
            </div>
            {!shown.length ? <Empty icon={Gauge} title="No matching limits" /> : null}
          </>
        ) : (
          <Empty icon={Gauge} title="No limits reported" text="Salesforce did not return limit information for this org." />
        )}
      </div>
    </Panel>
  );
}
