import { useState } from 'react';
import {
  Activity,
  Box,
  Check,
  Cloud,
  Code2,
  Database,
  ExternalLink,
  FileArchive,
  Gauge,
  LoaderCircle,
  Plus,
  Rocket,
  ScrollText,
  SearchCode,
  ShieldCheck,
  TestTube2,
  X,
} from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { useAppState } from '../../app/state';
import { navigate } from '../../lib/router';
import { dateTime } from '../../lib/format';
import { Badge, Callout, Empty, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { UpdateCenter } from './UpdateCenter';
import { AuthorizeOrgDialog } from '../org/AuthorizeOrgDialog';
import { friendlyOperation } from '../activities/ActivitiesPage';
import type { ActivityRecord, RetrievalRecord } from '../../types';
import type { PageKey } from '../../app/pages';

const SHORTCUTS: [typeof Box, string, string, PageKey][] = [
  [Box, 'Browse metadata', 'Explore and retrieve org metadata', 'metadata'],
  [Database, 'Run a SOQL query', 'Query records with structured results', 'query'],
  [SearchCode, 'Inspect a record', 'View and safely edit record fields', 'inspector'],
  [Code2, 'Execute Apex', 'Run anonymous Apex safely', 'apex'],
  [TestTube2, 'Run Apex tests', 'Test classes and review coverage', 'tests'],
  [ScrollText, 'View debug logs', 'Inspect recent execution logs', 'logs'],
  [Gauge, 'Check org limits', 'Review API and platform capacity', 'limits'],
  [Rocket, 'Deploy metadata', 'Preview, validate, and deploy', 'deploy'],
];

export default function OverviewPage() {
  const { org, orgId, selectedCount } = useAppState();
  const toast = useToast();
  const [authorizing, setAuthorizing] = useState(false);

  const activities = useResource<{ activities: ActivityRecord[] }>(
    'local:activities',
    (signal) => api('/activities', { signal }),
    { ttl: 10_000 },
  );
  const retrievals = useResource<{ retrievals: RetrievalRecord[] }>(
    'jobs:retrievals',
    (signal) => api('/retrievals', { signal }),
    { ttl: 10_000 },
  );

  const recentActivities = (activities.data?.activities ?? []).slice(0, 6);
  const recentRetrievals = (retrievals.data?.retrievals ?? []).slice(0, 5);

  async function openOrg() {
    // A tab opened after the network round-trip below would lose the click's user-gesture
    // and get popup-blocked, so a blank tab opens synchronously here and is redirected once
    // the CLI returns the org's authenticated frontdoor URL.
    const tab = window.open('', '_blank');
    try {
      const response = await api<{ url: string }>(`${orgPath(orgId)}/open`, { method: 'POST' });
      if (tab) tab.location.href = response.url;
      else window.open(response.url, '_blank', 'noopener,noreferrer');
      toast.success('Opening Salesforce', orgId);
    } catch (error) {
      tab?.close();
      toast.error(error);
    }
  }

  return (
    <>
      <section className="page-header">
        <div className="page-header-top">
          <span className="page-header-icon">
            <Cloud />
          </span>
          <div className="page-header-title">
            <span className="page-header-eyebrow">Salesforce org</span>
            <h1>{orgId}</h1>
          </div>
          <div className="page-header-actions">
            <button className="btn" onClick={() => setAuthorizing(true)}>
              <Plus /> Authorize new org
            </button>
            <button className="btn btn-primary" onClick={openOrg}>
              <ExternalLink /> Open Salesforce
            </button>
          </div>
        </div>
        <div className="page-header-details">
          <div>
            <span>User</span>
            <b className="mono" title={org.username}>
              {org.username}
            </b>
          </div>
          <div>
            <span>Environment</span>
            <b>{org.isSandbox ? 'Sandbox' : 'Production'}</b>
          </div>
          <div>
            <span>Connection</span>
            <b>{org.connectedStatus || 'Connected'}</b>
          </div>
          <div>
            <span>Components selected</span>
            <b>{selectedCount}</b>
          </div>
          <div>
            <span>Recent operations</span>
            <b>{activities.data?.activities.length ?? 0}</b>
          </div>
        </div>
      </section>

      <UpdateCenter />

      <div className="shortcut-grid">
        {SHORTCUTS.map(([Icon, title, text, page]) => (
          <button className="shortcut" key={page} onClick={() => navigate(page)}>
            <span className="row-icon">
              <Icon />
            </span>
            <div className="row-main">
              <b>{title}</b>
              <small>{text}</small>
            </div>
          </button>
        ))}
      </div>

      <div className="two-col">
        <Panel>
          <PanelHead title="Recent operations" description="Latest activity from this device.">
            <button className="btn btn-link" onClick={() => navigate('activities')}>
              View all
            </button>
          </PanelHead>
          <div className="panel-body">
            {recentActivities.length ? (
              <div className="row-list">
                {recentActivities.map((item) => (
                  <div className="row" key={item.id}>
                    <span className={`row-icon ${item.statusCode < 400 ? 'is-success' : 'is-failed'}`}>
                      {item.statusCode < 400 ? <Check /> : <X />}
                    </span>
                    <div className="row-main">
                      <b>{friendlyOperation(item.operation)}</b>
                      <small>{dateTime(item.createdAt)}</small>
                    </div>
                    <Badge tone={item.statusCode < 400 ? 'success' : 'danger'}>{item.statusCode}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={Activity} title="No operations yet" text="Your recent local activity will appear here." />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Recent retrievals" description="Metadata jobs and downloadable results.">
            <button className="btn btn-link" onClick={() => navigate('history')}>
              View all
            </button>
          </PanelHead>
          <div className="panel-body">
            {recentRetrievals.length ? (
              <div className="row-list">
                {recentRetrievals.map((item) => (
                  <div className="row" key={item.id}>
                    <span className={`row-icon is-${item.status}`}>
                      {item.status === 'running' ? (
                        <LoaderCircle className="spin" />
                      ) : item.status === 'success' ? (
                        <Check />
                      ) : (
                        <X />
                      )}
                    </span>
                    <div className="row-main">
                      <b>{item.orgLabel} metadata</b>
                      <small>
                        {item.componentCount} selections · {dateTime(item.createdAt)}
                      </small>
                    </div>
                    <Badge tone={item.status === 'success' ? 'success' : item.status === 'failed' ? 'danger' : 'accent'}>
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={FileArchive} title="No retrievals yet" text="Retrieved metadata jobs will appear here." />
            )}
          </div>
        </Panel>
      </div>

      <Callout icon={ShieldCheck} tone="accent" title="Local by design">
        Authentication stays inside the Salesforce CLI. No access tokens reach the browser and no database is required.
      </Callout>

      {authorizing ? <AuthorizeOrgDialog onClose={() => setAuthorizing(false)} /> : null}
    </>
  );
}
