import { useState } from 'react';
import { Activity, Check, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { dateTime } from '../../lib/format';
import { Badge, Empty, Loading, Pagination, Panel, PanelHead, StaleBar } from '../../ui/primitives';
import type { ActivityRecord } from '../../types';

const LABELS: Record<string, string> = {
  '/api/query': 'SOQL query executed',
  '/api/data/record': 'Record inspected',
  '/api/data/record/update': 'Record updated',
  '/api/data/records/delete': 'Records deleted',
  '/api/tests': 'Apex tests run',
  '/api/apex/execute': 'Anonymous Apex executed',
  '/api/retrievals': 'Metadata retrieval started',
  '/api/manifests/upload': 'Manifest uploaded',
  '/api/orgs/select': 'Active org changed',
  '/api/orgs': 'Authorized orgs loaded',
  '/api/orgs/authorize': 'Org authorized',
  '/api/retrievals/preview': 'Retrieve preview run',
  '/api/retrievals/from-manifest': 'Manifest retrieval started',
  '/api/manifests/preview': 'Manifest generated',
  '/api/data/record-counts': 'Record counts read',
  '/api/deploy/preview': 'Deployment previewed',
  '/api/deploy/quick': 'Quick deploy started',
  '/api/deploy/cancel': 'Deployment cancelled',
  '/api/deploy/start': 'Deployment started',
  '/api/deploy/validate': 'Deployment validated',
};

/** Route patterns whose parameters make the raw path unreadable. */
const PATTERNS: [RegExp, string][] = [
  [/^\/api\/orgs\/:org\/objects\/:name$/, 'Object schema described'],
  [/^\/api\/orgs\/:org\/objects$/, 'Object list loaded'],
  [/^\/api\/orgs\/:org\/metadata\/types$/, 'Metadata types loaded'],
  [/^\/api\/orgs\/:org\/metadata\/:type$/, 'Metadata components loaded'],
  [/^\/api\/orgs\/:org\/logs\/:id$/, 'Debug log opened'],
  [/^\/api\/orgs\/:org\/logs$/, 'Debug logs listed'],
  [/^\/api\/orgs\/:org\/limits$/, 'Org limits read'],
  [/^\/api\/orgs\/:org\/packages$/, 'Installed packages read'],
  [/^\/api\/orgs\/:org\/info$/, 'Org information read'],
  [/^\/api\/orgs\/:org\/open$/, 'Salesforce opened'],
  [/^\/api\/deploy\/:org\/:id$/, 'Deployment status checked'],
  [/^\/api\/saved-sets/, 'Saved selection changed'],
];

export function friendlyOperation(value: string) {
  if (LABELS[value]) return LABELS[value];
  for (const [pattern, label] of PATTERNS) if (pattern.test(value)) return label;
  return value.replace('/api/', '').replaceAll('/', ' · ').replaceAll(':org', 'org').replaceAll(':type', 'type');
}

export default function ActivitiesPage() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const activities = useResource<{ activities: ActivityRecord[] }>(
    'local:activities',
    (signal) => api('/activities', { signal }),
    { ttl: 5_000 },
  );
  const items = activities.data?.activities ?? [];
  const visible = items.slice((page - 1) * size, page * size);

  return (
    <Panel className="workspace-panel">
      <PanelHead
        title="Local operation history"
        description="The latest API operations on this device. No credentials or command arguments are stored."
      >
        <Badge>{items.length} events</Badge>
        <StaleBar updatedAt={activities.updatedAt} refreshing={activities.loading} onRefresh={activities.refresh} />
      </PanelHead>
      <div className="panel-body">
        {activities.pending ? (
          <Loading label="Loading operation history…" />
        ) : items.length ? (
          <>
            <div className="row-list workspace-data-region">
              {visible.map((item) => (
                <div className="row" key={item.id}>
                  <span className={`row-icon ${item.statusCode < 400 ? 'is-success' : 'is-failed'}`}>
                    {item.statusCode < 400 ? <Check /> : <X />}
                  </span>
                  <div className="row-main">
                    <b>{friendlyOperation(item.operation)}</b>
                    <small>
                      <span className="mono">{item.method}</span> · {dateTime(item.createdAt)}
                    </small>
                  </div>
                  <Badge tone={item.statusCode < 400 ? 'success' : 'danger'}>{item.statusCode}</Badge>
                </div>
              ))}
            </div>
            <Pagination total={items.length} page={page} size={size} onPage={setPage} onSize={setSize} />
          </>
        ) : (
          <Empty icon={Activity} title="No operations yet" text="Your recent local activity will appear here." />
        )}
      </div>
    </Panel>
  );
}
