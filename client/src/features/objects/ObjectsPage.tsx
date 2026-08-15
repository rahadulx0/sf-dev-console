import { useMemo, useState } from 'react';
import { Database, Download, Gauge, LoaderCircle } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzyStrings } from '../../lib/fuzzy';
import { downloadCsv } from '../../lib/format';
import { navigate, useRoute } from '../../lib/router';
import { Badge, Empty, Loading, Panel, PanelHead, SearchInput, StaleBar } from '../../ui/primitives';
import { VirtualList } from '../../ui/VirtualList';
import { useToast } from '../../ui/Toast';
import type { SalesforceField } from '../../types';

const MAX_COUNT_OBJECTS = 25;

export default function ObjectsPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  const route = useRoute();
  const selectedObject = route.params[0] || '';
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [counts, setCounts] = useState<{ object: string; count: number }[]>([]);
  const [counting, setCounting] = useState(false);
  const query = useDebounced(search);

  const objects = useResource<{ objects: string[] }>(
    orgKey(orgId, 'objects', 'all'),
    (signal) => api(`${orgPath(orgId)}/objects?category=all`, { signal }),
    { ttl: 600_000 },
  );

  const describe = useResource<{ describe: any }>(
    selectedObject ? orgKey(orgId, 'describe', selectedObject) : null,
    (signal) => api(`${orgPath(orgId)}/objects/${selectedObject}`, { signal }),
    { ttl: 600_000 },
  );

  const names = Array.isArray(objects.data?.objects) ? objects.data!.objects : [];
  const shown = useMemo(() => fuzzyStrings(names, query), [names, query]);

  function toggle(name: string) {
    setChosen((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : current.length < MAX_COUNT_OBJECTS
          ? [...current, name]
          : current,
    );
  }

  async function count() {
    setCounting(true);
    try {
      const response = await api<{ counts: { object: string; count: number }[] }>('/data/record-counts', {
        method: 'POST',
        body: JSON.stringify({ org: orgId, objects: chosen }),
      });
      setCounts([...response.counts].sort((a, b) => b.count - a.count));
      navigate('objects');
    } catch (error) {
      toast.error(error);
    } finally {
      setCounting(false);
    }
  }

  const fields: SalesforceField[] = describe.data?.describe?.fields ?? [];

  return (
    <div className="split split-objects">
      <Panel>
        <PanelHead title="Salesforce objects" description="Standard and custom objects in this org.">
          <Badge>{names.length}</Badge>
          <StaleBar updatedAt={objects.updatedAt} refreshing={objects.loading} onRefresh={objects.refresh} />
        </PanelHead>
        <div className="panel-body">
          <SearchInput value={search} onChange={setSearch} placeholder="Search objects…" />
          {objects.pending ? (
            <Loading label="Loading object catalog…" />
          ) : (
            <VirtualList
              items={shown}
              itemHeight={36}
              height={520}
              className="object-list"
              emptyState={<Empty title="No matching objects" text="Try a shorter or different search." />}
              renderItem={(name) => (
                <div className={`object-row${selectedObject === name ? ' is-active' : ''}`} key={name} style={{ height: 36 }}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(name)}
                    disabled={!chosen.includes(name) && chosen.length >= MAX_COUNT_OBJECTS}
                    onChange={() => toggle(name)}
                    aria-label={`Select ${name} for counting`}
                  />
                  <button className="mono" onClick={() => navigate('objects', name)}>
                    {name}
                  </button>
                </div>
              )}
            />
          )}
          <button className="btn btn-primary full" onClick={count} disabled={!chosen.length || counting}>
            {counting ? <LoaderCircle className="spin" /> : <Gauge />} Count selected records ({chosen.length}/
            {MAX_COUNT_OBJECTS})
          </button>
        </div>
      </Panel>

      <Panel>
        {selectedObject ? (
          <>
            <PanelHead
              title={<span className="mono">{describe.data?.describe?.label || selectedObject}</span>}
              description={`${selectedObject} · ${fields.length} fields`}
            >
              {describe.data?.describe ? (
                <Badge tone={describe.data.describe.custom ? 'accent' : 'neutral'}>
                  {describe.data.describe.custom ? 'Custom' : 'Standard'}
                </Badge>
              ) : null}
              <StaleBar updatedAt={describe.updatedAt} refreshing={describe.loading} onRefresh={describe.refresh} />
              <button className="btn" onClick={() => navigate('objects')}>
                Close
              </button>
            </PanelHead>
            <div className="panel-body">
              {describe.pending ? (
                <Loading label={`Describing ${selectedObject}…`} />
              ) : describe.error ? (
                <Empty icon={Database} title="Could not describe object" text={describe.error.message} />
              ) : (
                <div className="table-wrap" style={{ maxHeight: 560 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Type</th>
                        <th>Properties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field) => (
                        <tr key={field.name}>
                          <td>
                            <b>{field.label || field.name}</b>
                            <small>{field.name}</small>
                          </td>
                          <td className="cell-mono">{field.type}</td>
                          <td>
                            {[field.createable && 'Create', field.updateable && 'Update', field.nillable && 'Nullable']
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : counts.length ? (
          <>
            <PanelHead title="Record counts" description="Live aggregate counts from the selected org.">
              <button className="btn" onClick={() => downloadCsv(counts, 'salesforce-record-counts.csv')}>
                <Download /> Export CSV
              </button>
            </PanelHead>
            <div className="panel-body">
              <div className="count-grid">
                {counts.map((entry) => (
                  <div className="count" key={entry.object}>
                    <span className="mono">{entry.object}</span>
                    <b>{Number(entry.count).toLocaleString()}</b>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="panel-body">
            <Empty
              icon={Database}
              title="Select an object"
              text={`Open an object to inspect its fields, or tick up to ${MAX_COUNT_OBJECTS} objects and count their records.`}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
