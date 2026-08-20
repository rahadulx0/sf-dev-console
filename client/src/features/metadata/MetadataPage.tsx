import { useMemo, useState } from 'react';
import {
  Braces,
  ChevronRight,
  Database,
  FileArchive,
  LayoutDashboard,
  LoaderCircle,
  PackageCheck,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { invalidate, useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzyStrings } from '../../lib/fuzzy';
import { navigate } from '../../lib/router';
import { Badge, Empty, Loading, Panel, PanelHead, SearchInput, StaleBar } from '../../ui/primitives';
import { VirtualList } from '../../ui/VirtualList';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { ManifestTools } from './ManifestTools';
import { FlowExport } from './FlowExport';
import type { Selection } from '../../types';

const PRESETS = [
  { label: 'Apex', icon: Braces, types: ['ApexClass', 'ApexTrigger', 'ApexTestSuite'] },
  {
    label: 'Frontend',
    icon: LayoutDashboard,
    types: ['LightningComponentBundle', 'AuraDefinitionBundle', 'FlexiPage', 'StaticResource'],
  },
  { label: 'Objects', icon: Database, types: ['CustomObject', 'Layout', 'RecordType', 'CustomTab'] },
  { label: 'Automation', icon: Zap, types: ['Flow', 'Workflow', 'ApprovalProcess'] },
  { label: 'Security', icon: ShieldCheck, types: ['Profile', 'PermissionSet', 'PermissionSetGroup', 'CustomPermission'] },
];

const API_VERSION = '65.0';

export default function MetadataPage() {
  const { orgId, selections, setSelections, selectedCount } = useAppState();
  const toast = useToast();
  const [expanded, setExpanded] = useState('');
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [preview, setPreview] = useState('');
  const [retrieving, setRetrieving] = useState(false);
  const query = useDebounced(search);
  const memberQuery = useDebounced(memberSearch);

  const types = useResource<{ types: { name: string }[] }>(
    orgKey(orgId, 'metadata-types'),
    (signal) => api(`${orgPath(orgId)}/metadata/types`, { signal }),
    { ttl: 600_000 },
  );

  // Components load only for the open type, and stay cached per type and org.
  const components = useResource<{ components: { fullName: string }[] }>(
    expanded ? orgKey(orgId, 'metadata', expanded) : null,
    (signal) => api(`${orgPath(orgId)}/metadata/${expanded}`, { signal }),
    { ttl: 300_000 },
  );

  const typeNames = useMemo(
    () => (types.data?.types ?? []).map((type) => type.name).sort((a, b) => a.localeCompare(b)),
    [types.data],
  );
  const shownTypes = useMemo(() => {
    const matches = fuzzyStrings(typeNames, query);
    // Keep the open type reachable even when the search no longer matches its name.
    return expanded && !matches.includes(expanded) ? [expanded, ...matches] : matches;
  }, [typeNames, query, expanded]);

  const members = useMemo(() => (components.data?.components ?? []).map((c) => c.fullName), [components.data]);
  const shownMembers = useMemo(() => fuzzyStrings(members, memberQuery), [members, memberQuery]);

  const selectionMap = useMemo(() => new Map(selections.map((s) => [s.type, s.members])), [selections]);

  function toggleMember(type: string, member: string) {
    const current = selectionMap.get(type) ?? [];
    const next = current.includes(member) ? current.filter((value) => value !== member) : [...current, member];
    const others = selections.filter((selection) => selection.type !== type);
    setSelections(next.length ? [...others, { type, members: next }] : others);
  }

  function applyPreset(list: string[]) {
    const next: Selection[] = [...selections];
    for (const type of list) if (!next.some((selection) => selection.type === type)) next.push({ type, members: ['*'] });
    setSelections(next);
    toast.info('Preset applied', `${list.length} metadata types selected`);
  }

  async function showPreview() {
    try {
      const response = await api<{ xml: string }>('/manifests/preview', {
        method: 'POST',
        body: JSON.stringify({ selections, apiVersion: API_VERSION }),
      });
      setPreview(response.xml);
    } catch (error) {
      toast.error(error);
    }
  }

  async function retrieve() {
    setRetrieving(true);
    try {
      await api('/retrievals', {
        method: 'POST',
        body: JSON.stringify({ org: orgId, orgLabel: orgId, selections, apiVersion: API_VERSION }),
      });
      setPreview('');
      invalidate('jobs:retrievals');
      toast.success('Retrieval started', `${selectedCount} components from ${orgId}`, {
        label: 'Track it',
        run: () => navigate('history'),
      });
    } catch (error) {
      toast.error(error);
    } finally {
      setRetrieving(false);
    }
  }

  return (
    <>
      <div className="preset-grid">
        {PRESETS.map(({ label, icon: Icon, types: presetTypes }) => (
          <button className="preset" key={label} onClick={() => applyPreset(presetTypes)}>
            <span className="row-icon">
              <Icon />
            </span>
            <div className="row-main">
              <b>{label}</b>
              <small>{presetTypes.length} metadata types</small>
            </div>
          </button>
        ))}
        <FlowExport />
      </div>

      <div className="split split-metadata">
        <Panel>
          <PanelHead title="Metadata types" description="Components load only when you open a type.">
            <Badge>{typeNames.length} types</Badge>
            <StaleBar updatedAt={types.updatedAt} refreshing={types.loading} onRefresh={types.refresh} />
          </PanelHead>
          <div className="panel-body">
            <SearchInput value={search} onChange={setSearch} placeholder="Search metadata types…" />
            {types.pending ? (
              <Loading label="Reading metadata from your org…" />
            ) : !shownTypes.length ? (
              <Empty title="No matching types" text="Try a shorter or different search." />
            ) : (
              <div className="type-list">
                {shownTypes.map((type) => {
                  const selected = selectionMap.get(type) ?? [];
                  const isOpen = expanded === type;
                  const all = selected.includes('*');
                  return (
                    <div className={`type${isOpen ? ' is-open' : ''}`} key={type}>
                      <button
                        className="type-head"
                        onClick={() => {
                          setExpanded(isOpen ? '' : type);
                          setMemberSearch('');
                        }}
                      >
                        <ChevronRight className={isOpen ? 'is-rotated' : ''} />
                        <span className="mono">{type}</span>
                        {selected.length ? <Badge tone="accent">{all ? 'All' : selected.length}</Badge> : null}
                      </button>
                      {isOpen ? (
                        <div className="type-body">
                          <SearchInput
                            value={memberSearch}
                            onChange={setMemberSearch}
                            placeholder={`Search ${type} components by API name…`}
                          />
                          <div className="type-toolbar">
                            <button className="btn btn-link" onClick={() => toggleMember(type, '*')}>
                              {all ? 'Clear type' : 'Select entire type'}
                            </button>
                            <small>
                              {components.pending
                                ? 'Loading components…'
                                : `${shownMembers.length}${memberQuery ? ' matching' : ''} of ${members.length} components`}
                            </small>
                          </div>
                          {components.pending ? (
                            <Loading label="Loading components…" />
                          ) : (
                            <VirtualList
                              items={shownMembers}
                              itemHeight={32}
                              height={320}
                              className="member-list"
                              emptyState={<Empty title="No components" text="This type has no components in the org." />}
                              renderItem={(member) => (
                                <label className="member" key={member} style={{ height: 32 }}>
                                  <input
                                    type="checkbox"
                                    checked={all || selected.includes(member)}
                                    disabled={all}
                                    onChange={() => toggleMember(type, member)}
                                  />
                                  <span className="mono">{member}</span>
                                </label>
                              )}
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>

        <aside className="metadata-rail">
          <Panel className="basket">
            <PanelHead title="Selection" description="Ready for a manifest.">
              <strong className="basket-count">{selectedCount}</strong>
            </PanelHead>
            <div className="panel-body">
              {selections.length ? (
                <div className="row-list">
                  {selections.map((selection) => (
                    <div className="row" key={selection.type}>
                      <div className="row-main">
                        <b className="mono">{selection.type}</b>
                        <small>
                          {selection.members.includes('*') ? 'All components' : `${selection.members.length} selected`}
                        </small>
                      </div>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => setSelections(selections.filter((item) => item.type !== selection.type))}
                        aria-label={`Remove ${selection.type}`}
                      >
                        <X />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon={PackageCheck} title="Nothing selected" text="Choose metadata types or individual components." />
              )}
              <div className="basket-actions">
                <button className="btn" disabled={!selections.length} onClick={showPreview}>
                  Preview package.xml
                </button>
                <button className="btn btn-primary" disabled={!selections.length || retrieving} onClick={retrieve}>
                  {retrieving ? <LoaderCircle className="spin" /> : <FileArchive />} Retrieve metadata
                </button>
              </div>
            </div>
          </Panel>
          <ManifestTools compact />
        </aside>
      </div>

      {preview ? (
        <Modal
          icon={FileArchive}
          title="package.xml preview"
          wide
          flush
          onClose={() => setPreview('')}
          footer={
            <>
              <button className="btn" onClick={() => void navigator.clipboard.writeText(preview)}>
                Copy XML
              </button>
              <button className="btn btn-primary" onClick={retrieve} disabled={retrieving}>
                {retrieving ? <LoaderCircle className="spin" /> : <FileArchive />} Retrieve metadata
              </button>
            </>
          }
        >
          <pre className="code-block">{preview}</pre>
        </Modal>
      ) : null}
    </>
  );
}
