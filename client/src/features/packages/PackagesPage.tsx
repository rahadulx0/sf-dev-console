import { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzySearch } from '../../lib/fuzzy';
import { Badge, Empty, Loading, Panel, PanelHead, SearchInput, StaleBar } from '../../ui/primitives';

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
    <Panel>
      <PanelHead title="Installed packages" description="Managed and unlocked packages currently installed in this org.">
        <Badge>{items.length} packages</Badge>
        <StaleBar updatedAt={packages.updatedAt} refreshing={packages.loading} onRefresh={packages.refresh} />
      </PanelHead>
      <div className="panel-body">
        {packages.pending ? (
          <Loading label="Loading packages…" />
        ) : items.length ? (
          <>
            <div style={{ maxWidth: 320, marginBottom: 'var(--s-4)' }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Filter packages…" />
            </div>
            <div className="card-grid">
              {shown.map((item, index) => (
                <div className="card" key={item.SubscriberPackageId || index}>
                  <span className="row-icon">
                    <Package />
                  </span>
                  <div className="row-main">
                    <b>{item.SubscriberPackageName || item.SubscriberPackageNamespace || 'Package'}</b>
                    <small>
                      {item.SubscriberPackageVersionName || item.SubscriberPackageVersionNumber || '—'} ·{' '}
                      {item.SubscriberPackageNamespace || 'No namespace'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty icon={Package} title="No installed packages" text="This org did not return any package installations." />
        )}
      </div>
    </Panel>
  );
}
