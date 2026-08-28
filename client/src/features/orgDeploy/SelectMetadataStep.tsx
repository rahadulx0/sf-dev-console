import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronRight, GitCompare, LoaderCircle, PackageCheck, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { orgKey } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzyStrings } from '../../lib/fuzzy';
import { useResource } from '../../lib/resource';
import { Badge, Callout, Empty, Loading, Panel, PanelHead, SearchInput, StaleBar } from '../../ui/primitives';
import { VirtualList } from '../../ui/VirtualList';
import type { Selection } from '../../types';
import { FileSelectionPanel } from './FileSelectionPanel';

export function SelectMetadataStep({
  sourceOrg,
  selections,
  setSelections,
  comparing,
  onBack,
  onCompare,
  fileKeys,
  setFileKeys,
}: {
  sourceOrg: string;
  selections: Selection[];
  setSelections: (selections: Selection[]) => void;
  comparing: boolean;
  onBack: () => void;
  onCompare: () => void;
  fileKeys: Set<string>;
  setFileKeys: (value: Set<string>) => void;
}) {
  const [expanded, setExpanded] = useState('');
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const query = useDebounced(search);
  const memberQuery = useDebounced(memberSearch);

  const types = useResource<{ types: { name: string }[] }>(
    orgKey(sourceOrg, 'metadata-types'),
    (signal) => api(`${orgPath(sourceOrg)}/metadata/types`, { signal }),
    { ttl: 600_000 },
  );
  const components = useResource<{ components: { fullName: string }[] }>(
    expanded ? orgKey(sourceOrg, 'metadata', expanded) : null,
    (signal) => api(`${orgPath(sourceOrg)}/metadata/${expanded}`, { signal }),
    { ttl: 300_000 },
  );

  const typeNames = useMemo(
    () => (types.data?.types ?? []).map((type) => type.name).sort((a, b) => a.localeCompare(b)),
    [types.data],
  );
  const shownTypes = useMemo(() => {
    const matches = fuzzyStrings(typeNames, query);
    return expanded && !matches.includes(expanded) ? [expanded, ...matches] : matches;
  }, [typeNames, query, expanded]);

  const members = useMemo(() => (components.data?.components ?? []).map((c) => c.fullName), [components.data]);
  const shownMembers = useMemo(() => fuzzyStrings(members, memberQuery), [members, memberQuery]);

  const selectionMap = useMemo(() => new Map(selections.map((s) => [s.type, s.members])), [selections]);
  const selectedCount = selections.reduce((total, s) => total + s.members.length, 0);

  function toggleMember(type: string, member: string) {
    const current = selectionMap.get(type) ?? [];
    const next = current.includes(member) ? current.filter((value) => value !== member) : [...current, member];
    const others = selections.filter((selection) => selection.type !== type);
    setSelections(next.length ? [...others, { type, members: next }] : others);
  }

  const includesCustomFields = selections.some((selection) => selection.type === 'CustomField');

  return (
    <div className="page-stack">
      <FileSelectionPanel sourceOrg={sourceOrg} selected={fileKeys} setSelected={setFileKeys} />
      {includesCustomFields ? (
        <Callout icon={ShieldCheck} tone="accent" title="Field-level security will be included">
          Source Profiles and Permission Sets will be retrieved with the selected fields and included in comparison and deployment review.
        </Callout>
      ) : null}
      <div className="split split-metadata">
      <Panel className="metadata-browser-panel">
        <PanelHead title="Metadata types" description={`Browsing ${sourceOrg}. Components load only when you open a type.`}>
          <Badge>{typeNames.length} types</Badge>
          <StaleBar updatedAt={types.updatedAt} refreshing={types.loading} onRefresh={types.refresh} />
        </PanelHead>
        <div className="panel-body">
          {types.error && !types.data ? (
            <div className="metadata-load-error">
              <Callout icon={AlertTriangle} tone="danger" title={`Could not load metadata types from ${sourceOrg}`}>
                {types.error.message}
              </Callout>
              <div className="action-row">
                <button className="btn" onClick={onBack}>
                  <ArrowLeft /> Choose another org
                </button>
                <button className="btn btn-primary" onClick={types.refresh} disabled={types.loading}>
                  {types.loading ? <LoaderCircle className="spin" /> : <RefreshCw />} Retry metadata types
                </button>
              </div>
            </div>
          ) : (
            <SearchInput value={search} onChange={setSearch} placeholder="Search metadata types…" />
          )}
          {types.error && !types.data ? null : types.pending ? (
            <Loading label="Reading metadata from the source org…" />
          ) : !shownTypes.length ? (
            <Empty
              title={query ? 'No matching types' : 'No metadata types returned'}
              text={query ? 'Try a shorter or different search.' : 'Refresh the source org or choose another authorized org.'}
            />
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
                        {components.error && !components.data ? (
                          <div className="metadata-load-error is-compact">
                            <Callout icon={AlertTriangle} tone="danger" title={`Could not load ${type} components`}>
                              {components.error.message}
                            </Callout>
                            <button className="btn btn-sm" onClick={components.refresh} disabled={components.loading}>
                              {components.loading ? <LoaderCircle className="spin" /> : <RefreshCw />} Retry
                            </button>
                          </div>
                        ) : components.pending ? (
                          <Loading label="Loading components…" />
                        ) : (
                          <VirtualList
                            items={shownMembers}
                            itemHeight={26}
                            height={280}
                            className="member-list"
                            emptyState={<Empty title="No components" text="This type has no components in the org." />}
                            renderItem={(member) => (
                              <label className="member" key={member}>
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
          <PanelHead title="Selection" description="Retrieved from the source org for comparison.">
            <strong className="basket-count">{selectedCount}</strong>
          </PanelHead>
          <div className="panel-body">
            {selections.length ? (
              <div className="row-list">
                {selections.map((selection) => (
                  <div className="row" key={selection.type}>
                    <div className="row-main">
                      <b className="mono">{selection.type}</b>
                      <small>{selection.members.includes('*') ? 'All components' : `${selection.members.length} selected`}</small>
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
              <Empty icon={PackageCheck} title="Nothing selected" text="Choose metadata types or individual components to compare." />
            )}
            <div className="basket-actions">
              <button className="btn" onClick={onBack}>
                <ArrowLeft /> Back to orgs
              </button>
              <button className="btn btn-primary" disabled={(!selections.length && !fileKeys.size) || comparing} onClick={onCompare}>
                {comparing ? <LoaderCircle className="spin" /> : <GitCompare />} Compare with target <ArrowRight />
              </button>
            </div>
          </div>
        </Panel>
      </aside>
      </div>
    </div>
  );
}
