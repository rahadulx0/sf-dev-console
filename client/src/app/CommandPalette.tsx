import { useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, CornerDownLeft, ExternalLink, Moon, RefreshCw, Search, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import { PAGES } from './pages';
import { useAppState } from './state';
import { useTheme } from './theme';
import { navigate } from '../lib/router';
import { fuzzySearch } from '../lib/fuzzy';
import { invalidate } from '../lib/resource';
import { api, orgPath } from '../lib/api';
import { useToast } from '../ui/Toast';
import { orgIdOf } from '../types';

const GROUP_ORDER = ['Pages', 'Orgs', 'Actions'] as const;

interface Command {
  id: string;
  group: (typeof GROUP_ORDER)[number];
  label: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { orgs, org, orgId, selectOrg } = useAppState();
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = PAGES.map((page) => ({
      id: `page:${page.key}`,
      group: 'Pages',
      label: page.label,
      hint: page.description,
      icon: page.icon,
      run: () => navigate(page.key),
    }));
    const orgCommands: Command[] = orgs
      .filter((candidate) => orgIdOf(candidate) !== orgId)
      .map((candidate) => ({
        id: `org:${orgIdOf(candidate)}`,
        group: 'Orgs',
        label: `Switch to ${orgIdOf(candidate)}`,
        hint: candidate.username,
        icon: Cloud,
        run: () => void selectOrg(candidate),
      }));
    const actions: Command[] = [
      {
        id: 'action:open-org',
        group: 'Actions',
        label: 'Open Salesforce in a browser',
        hint: orgId,
        icon: ExternalLink,
        run: () => {
          api(`${orgPath(orgId)}/open`, { method: 'POST' })
            .then(() => toast.success('Opening Salesforce', orgId))
            .catch((error) => toast.error(error));
        },
      },
      {
        id: 'action:refresh',
        group: 'Actions',
        label: 'Refresh cached org data',
        hint: 'Re-reads everything for this org',
        icon: RefreshCw,
        run: () => {
          invalidate(`org:${orgId}`);
          toast.info('Refreshing org data');
        },
      },
      {
        id: 'action:theme',
        group: 'Actions',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? Sun : Moon,
        run: toggle,
      },
    ];
    return [...pages, ...orgCommands, ...actions];
  }, [orgs, orgId, org, selectOrg, theme, toggle, toast]);

  // Ranked by fuzzy score, then re-grouped so each heading appears exactly once.
  const results = useMemo(() => {
    const ranked = fuzzySearch(commands, query, (command) => [command.label, command.hint ?? '', command.group]).slice(0, 40);
    return GROUP_ORDER.flatMap((group) => ranked.filter((command) => command.group === group));
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') return onClose();
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      results[active]?.run();
      onClose();
    }
  }

  let lastGroup = '';
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input">
          <Search />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, orgs, and actions…"
            spellCheck={false}
          />
        </div>
        <div className="palette-results" ref={listRef}>
          {results.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : '';
            lastGroup = command.group;
            const Icon = command.icon;
            return (
              <div key={command.id}>
                {header ? <div className="palette-group">{header}</div> : null}
                <button
                  className={`palette-item${index === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    command.run();
                    onClose();
                  }}
                >
                  <Icon />
                  <span>{command.label}</span>
                  {command.hint ? <small>{command.hint}</small> : null}
                </button>
              </div>
            );
          })}
          {!results.length ? <div className="empty">No matching command</div> : null}
        </div>
        <div className="palette-foot">
          <span className="kbd">↑↓</span> navigate
          <span className="kbd">
            <CornerDownLeft style={{ width: 9, height: 9 }} />
          </span>
          select
          <span className="kbd">esc</span> close
        </div>
      </div>
    </div>
  );
}
