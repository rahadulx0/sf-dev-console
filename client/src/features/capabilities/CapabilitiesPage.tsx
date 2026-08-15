import { useMemo, useState } from 'react';
import { Check, Search, ShieldCheck } from 'lucide-react';
import { useDebounced } from '../../lib/hooks';
import { fuzzySearch } from '../../lib/fuzzy';
import { Badge, Callout, Empty, Panel, PanelHead, SearchInput } from '../../ui/primitives';
import { CAPABILITY_GROUPS, CAPABILITY_TOTAL } from './data';

export default function CapabilitiesPage() {
  const [search, setSearch] = useState('');
  const query = useDebounced(search);

  const groups = useMemo(
    () =>
      CAPABILITY_GROUPS.map((group) => ({
        ...group,
        items: fuzzySearch([...group.items], query, ([name, detail]) => [name, detail, group.title]),
      })).filter((group) => group.items.length),
    [query],
  );

  const matches = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <>
      <Panel>
        <PanelHead
          title="Salesforce workflows, available now"
          description="A verified inventory of features backed by the local Salesforce CLI."
        >
          <Badge tone="accent">{CAPABILITY_TOTAL} capabilities</Badge>
        </PanelHead>
        <div className="panel-body">
          <div className="capability-search">
            <SearchInput value={search} onChange={setSearch} placeholder="Fuzzy search capabilities…" />
            <span>
              {query ? `${matches} matching` : `${CAPABILITY_GROUPS.length} workflow modules`} · local-first · no database
            </span>
          </div>
        </div>
      </Panel>

      <div className="capability-grid">
        {groups.map(({ title, description, icon: Icon, items }) => (
          <Panel key={title}>
            <PanelHead title={title} description={description}>
              <span className="row-icon">
                <Icon />
              </span>
            </PanelHead>
            <div className="panel-body">
              <div className="row-list">
                {items.map(([name, detail]) => (
                  <div className="row capability" key={name}>
                    <span className="row-icon is-success">
                      <Check />
                    </span>
                    <div className="row-main">
                      <b>{name}</b>
                      <small>{detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        ))}
        {!groups.length ? (
          <Panel>
            <div className="panel-body">
              <Empty icon={Search} title="No matching capabilities" text="Try a broader name, workflow, or Salesforce feature." />
            </div>
          </Panel>
        ) : null}
      </div>

      <Callout icon={ShieldCheck} tone="accent" title="Deliberate security boundary">
        Salesforce credentials stay in the CLI. Arbitrary terminal commands, raw access tokens, and unconfirmed
        destructive operations are never exposed to this interface.
      </Callout>
    </>
  );
}
