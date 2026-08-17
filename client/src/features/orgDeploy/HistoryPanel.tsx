import { Check, History, LoaderCircle, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { dateTime } from '../../lib/format';
import { Badge, Empty, Loading, Panel, PanelHead, StaleBar } from '../../ui/primitives';
import type { OrgDeployRecord } from '../../types';

export function HistoryPanel() {
  const history = useResource<{ orgDeploys: OrgDeployRecord[] }>('org-deploy:history', (signal) => api('/org-deploy/history', { signal }), {
    ttl: 5000,
  });
  const items = history.data?.orgDeploys ?? [];

  return (
    <Panel>
      <PanelHead
        title="Recorded on this device"
        description="Org-to-org validations and deployments run from this tool. Not Salesforce's own deployment history."
      >
        <Badge>{items.length} runs</Badge>
        <StaleBar updatedAt={history.updatedAt} refreshing={history.loading} onRefresh={history.refresh} />
      </PanelHead>
      <div className="panel-body">
        {history.pending ? (
          <Loading label="Loading local history…" />
        ) : items.length ? (
          <div className="row-list">
            {items.map((item) => (
              <div className="row" key={item.id}>
                <span className={`row-icon is-${item.status === 'succeeded' ? 'success' : item.status === 'failed' ? 'failed' : 'running'}`}>
                  {item.status === 'running' ? <LoaderCircle className="spin" /> : item.status === 'succeeded' ? <Check /> : <X />}
                </span>
                <div className="row-main">
                  <b>
                    {item.sourceOrg} → {item.targetOrg}
                  </b>
                  <small>
                    {dateTime(item.createdAt)} · {item.componentCount} components · {item.types.join(', ') || 'no types'}
                  </small>
                </div>
                <Badge tone={item.mode === 'deploy' ? 'danger' : 'accent'}>{item.mode}</Badge>
                <Badge tone={item.status === 'succeeded' ? 'success' : item.status === 'failed' ? 'danger' : 'accent'}>{item.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={History} title="No runs yet" text="Validations and deployments you run here will be recorded on this device." />
        )}
      </div>
    </Panel>
  );
}
