import { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzySearch } from '../../lib/fuzzy';
import { Badge, Empty, Loading, Panel, PanelHead, SearchInput, StaleBar, Toolbar } from '../../ui/primitives';

export default function PackagesPage() {
  const { orgId } = useAppState();
  const [search, setSearch] = useState('');
  const query = useDebounced(search);

  const packages = useResource<{ packages: any[] }>(
    orgKey(orgId, 'packages'),
    (signal) => api(`${orgPath(orgId)}/packages`, { signal }),
    { ttl: 300_000 },
  );

  const items = Array.isArray(packages.data?.packages) ? packages.data!.packages : [];
  const shown = useMemo(
    () =>
      fuzzySearch(items, query, (item) => [
        item.SubscriberPackageName ?? '',
        item.SubscriberPackageNamespace ?? '',
        item.SubscriberPackageVersionName ?? '',
      ]),
    [items, query],
  );

  return (
    <Panel className="workspace-panel">
      <PanelHead title="Installed packages" description="Managed and unlocked packages currently installed in this org.">
        <Badge>{items.length} packages</Badge>
        <StaleBar updatedAt={packages.updatedAt} refreshing={packages.loading} onRefresh={packages.refresh} />
      </PanelHead>
      <div className="panel-body">
        {packages.pending ? (
          <Loading label="Loading packages…" />
        ) : items.length ? (
          <>
            <Toolbar label="Filter installed packages" className="filter-bar">
              <SearchInput value={search} onChange={setSearch} placeholder="Filter packages…" />
            </Toolbar>
            {shown.length ? (
              <div className="table-wrap workspace-table workspace-data-region">
                <table className="data-table">
                  <thead><tr><th>Package</th><th>Namespace</th><th>Version</th><th>Package ID</th></tr></thead>
                  <tbody>
                    {shown.map((item, index) => (
                      <tr key={item.SubscriberPackageId || index}>
                        <td><b>{item.SubscriberPackageName || item.SubscriberPackageNamespace || 'Package'}</b></td>
                        <td className="cell-mono">{item.SubscriberPackageNamespace || '—'}</td>
                        <td>{item.SubscriberPackageVersionName || item.SubscriberPackageVersionNumber || '—'}</td>
                        <td className="cell-mono">{item.SubscriberPackageId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty icon={Package} title="No matching packages" text="Clear or change the current filter." />}
          </>
        ) : (
          <Empty icon={Package} title="No installed packages" text="This org did not return any package installations." />
        )}
      </div>
    </Panel>
  );
}
