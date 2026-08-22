import { useMemo, useState } from 'react';
import { ArrowRight, Boxes, Check, Search, ShieldCheck } from 'lucide-react';
import { fuzzySearch } from '../../lib/fuzzy';
import { useDebounced } from '../../lib/hooks';
import { navigate } from '../../lib/router';
import { Badge, Empty, SearchInput } from '../../ui/primitives';
import { CAPABILITY_GROUPS, CAPABILITY_TOTAL } from './data';

const ALL_GROUPS = 'all';

export default function CapabilitiesPage() {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(ALL_GROUPS);
  const query = useDebounced(search);

  const groups = useMemo(() => {
    const source = selectedGroup === ALL_GROUPS
      ? CAPABILITY_GROUPS
      : CAPABILITY_GROUPS.filter((group) => group.title === selectedGroup);
    return source.map((group) => ({
      ...group,
      items: fuzzySearch([...group.items], query, ([name, detail]) => [name, detail, group.title, group.description]),
    })).filter((group) => group.items.length > 0);
  }, [query, selectedGroup]);

  const matches = groups.reduce((total, group) => total + group.items.length, 0);
  const activeGroup = CAPABILITY_GROUPS.find((group) => group.title === selectedGroup);

  return (
    <div className="capabilities-page">
      <header className="capability-commandbar">
        <div className="capability-title">
          <span className="capability-title-icon"><ShieldCheck /></span>
          <div>
            <span>Product coverage</span>
            <h1>Implemented capabilities</h1>
            <p>Verified workflows currently available in SF Dev Console.</p>
          </div>
        </div>
        <div className="capability-summary" aria-label="Capability summary">
          <div><b>{CAPABILITY_TOTAL}</b><span>features</span></div>
          <div><b>{CAPABILITY_GROUPS.length}</b><span>modules</span></div>
          <div><b>18</b><span>workspaces</span></div>
        </div>
        <div className="capability-filter">
          <SearchInput value={search} onChange={setSearch} placeholder="Filter features, workflows, or tools…" />
          <span>{query ? `${matches} matches` : 'Implementation inventory'}</span>
        </div>
      </header>

      <div className="capability-workspace">
        <aside className="capability-index" aria-label="Capability modules">
          <div className="capability-index-label">Modules</div>
          <button
            className={selectedGroup === ALL_GROUPS ? 'is-active' : ''}
            onClick={() => setSelectedGroup(ALL_GROUPS)}
            aria-pressed={selectedGroup === ALL_GROUPS}
          >
            <span className="capability-index-icon"><Boxes /></span>
            <span><b>All capabilities</b><small>Complete product inventory</small></span>
            <em>{CAPABILITY_TOTAL}</em>
          </button>
          {CAPABILITY_GROUPS.map(({ title, description, icon: Icon, items }) => (
            <button
              key={title}
              className={selectedGroup === title ? 'is-active' : ''}
              onClick={() => setSelectedGroup(title)}
              aria-pressed={selectedGroup === title}
            >
              <span className="capability-index-icon"><Icon /></span>
              <span><b>{title}</b><small>{description}</small></span>
              <em>{items.length}</em>
            </button>
          ))}
        </aside>

        <section className="capability-catalog" aria-label="Implemented feature catalog">
          <header className="capability-catalog-head">
            <div>
              <span>{activeGroup ? 'Selected module' : 'All modules'}</span>
              <b>{activeGroup?.title ?? 'Complete capability catalog'}</b>
              <small>{activeGroup?.description ?? 'Browse every workflow implemented in the current application.'}</small>
            </div>
            <Badge tone={query ? 'accent' : undefined}>{matches} shown</Badge>
          </header>

          <div className="capability-catalog-scroll">
            {groups.map(({ title, description, icon: Icon, route, routeLabel, items }, groupIndex) => (
              <section className={`capability-module is-tone-${groupIndex % 4}`} key={title}>
                <header className="capability-module-head">
                  <span className="capability-module-icon"><Icon /></span>
                  <div>
                    <b>{title}</b>
                    <small>{description}</small>
                  </div>
                  <Badge>{items.length} features</Badge>
                  <button className="btn btn-ghost" onClick={() => navigate(route)}>
                    <span>{routeLabel}</span> <ArrowRight />
                  </button>
                </header>
                <div className="capability-table-wrap">
                  <table className="capability-table">
                    <colgroup><col className="capability-name-column" /><col /><col className="capability-state-column" /></colgroup>
                    <thead>
                      <tr><th>Feature</th><th>Implemented behavior</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {items.map(([name, detail]) => (
                        <tr key={name}>
                          <td><b>{name}</b></td>
                          <td>{detail}</td>
                          <td><span className="capability-ready" title="Available now"><Check /> Ready</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
            {!groups.length ? (
              <div className="capability-empty">
                <Empty icon={Search} title="No matching capabilities" text="Try a broader feature, workflow, Salesforce object, or tool name." />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="capability-security">
        <ShieldCheck />
        <div>
          <b>Deliberate security boundary</b>
          <span>Credentials remain in Salesforce CLI. There is no arbitrary terminal endpoint, raw token exposure, or automatic destructive deployment.</span>
        </div>
        <span className="capability-security-tag">CLI-owned auth</span>
        <span className="capability-security-tag">Exact confirmations</span>
      </footer>
    </div>
  );
}
