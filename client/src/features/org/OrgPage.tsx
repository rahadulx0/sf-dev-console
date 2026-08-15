import { ExternalLink, ShieldCheck } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { humanize } from '../../lib/format';
import { Callout, Loading, Panel, PanelHead, StaleBar } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

interface OrgInfo {
  id?: string;
  username?: string;
  instanceUrl?: string;
  connectedStatus?: string;
  apiVersion?: string;
  alias?: string;
}

export default function OrgPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  const info = useResource<OrgInfo>(orgKey(orgId, 'info'), (signal) => api(`${orgPath(orgId)}/info`, { signal }), {
    ttl: 60_000,
  });

  async function open() {
    try {
      await api(`${orgPath(orgId)}/open`, { method: 'POST' });
      toast.success('Opening Salesforce', orgId);
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <>
      <Panel>
        <PanelHead title="Organization details" description="Safe, non-sensitive information reported by Salesforce CLI.">
          <StaleBar updatedAt={info.updatedAt} refreshing={info.loading} onRefresh={info.refresh} />
          <button className="btn btn-primary" onClick={open}>
            <ExternalLink /> Open Salesforce
          </button>
        </PanelHead>
        <div className="panel-body">
          {info.pending ? (
            <Loading label="Loading org details…" />
          ) : info.error ? (
            <Callout icon={ShieldCheck} tone="danger" title="Could not read org details">
              {info.error.message}
            </Callout>
          ) : (
            <div className="detail-grid">
              {Object.entries(info.data || {}).map(([key, value]) => (
                <div key={key}>
                  <span>{humanize(key)}</span>
                  <b className="mono">{String(value || '—')}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Callout icon={ShieldCheck} tone="accent" title="Credentials stay in the CLI">
        Verbose org output and SFDX authorization URLs are never requested, so refresh tokens cannot reach this
        interface.
      </Callout>
    </>
  );
}
