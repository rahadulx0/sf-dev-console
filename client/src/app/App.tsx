import { useEffect, useState } from 'react';
import { Cloud, LoaderCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useResource } from '../lib/resource';
import { AppStateProvider } from './state';
import { Shell } from './Shell';
import { SetupScreen } from '../features/setup/SetupScreen';
import { orgIdOf, type Org, type SystemStatus } from '../types';

export default function App() {
  const status = useResource<SystemStatus>('system:status', (signal) => api('/system/status', { signal }), { ttl: 60_000 });
  const orgList = useResource<{ orgs: Org[]; selectedOrg?: string }>(
    'system:orgs',
    (signal) => api<{ orgs: Org[]; selectedOrg?: string }>('/orgs', { signal }).catch(() => ({ orgs: [] })),
    { ttl: 30_000 },
  );

  const [chosen, setChosen] = useState<string>();
  const orgs = orgList.data?.orgs ?? [];
  const remembered = chosen ?? orgList.data?.selectedOrg ?? localStorage.getItem('sf-org') ?? undefined;
  const org = orgs.find((candidate) => orgIdOf(candidate) === remembered) ?? orgs[0];

  // A bare URL should still land on a real route so refresh and back behave predictably.
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#/overview');
  }, []);

  if (status.pending || orgList.pending) {
    return (
      <div className="splash">
        <span className="brandmark">
          <Cloud />
        </span>
        <h1>SF Dev Console</h1>
        <LoaderCircle className="spin" />
        <p>Connecting to your local Salesforce environment…</p>
      </div>
    );
  }

  if (!status.data?.cli.installed || !org) {
    return (
      <SetupScreen
        status={status.data}
        orgs={orgs}
        error={status.error?.message || orgList.error?.message}
        onRetry={() => {
          status.refresh();
          orgList.refresh();
        }}
        onContinue={(next) => setChosen(orgIdOf(next))}
      />
    );
  }

  return (
    <AppStateProvider org={org} orgs={orgs} onOrgChange={(next) => setChosen(orgIdOf(next))}>
      <Shell status={status.data} />
    </AppStateProvider>
  );
}
