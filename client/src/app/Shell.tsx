import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Cloud, Menu, Moon, RefreshCw, Search, Sun, X } from 'lucide-react';
import { NAV_GROUPS, isPageKey, pageDef } from './pages';
import { ROUTES } from './routes';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary, clearReloadGuard } from './ErrorBoundary';
import { JobStrip } from './JobStrip';
import { OrgSwitcher } from './OrgSwitcher';
import { useAppState } from './state';
import { useTheme } from './theme';
import { useRoute, navigate } from '../lib/router';
import { useHotkey, useLocalStorage } from '../lib/hooks';
import { fuzzySearch } from '../lib/fuzzy';
import { invalidate } from '../lib/resource';
import { Loading } from '../ui/primitives';
import type { SystemStatus } from '../types';

export function Shell({ status: _status }: { status: SystemStatus }) {
  const { org, orgId, selectedCount } = useAppState();
  const { theme, toggle } = useTheme();
  const route = useRoute();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [navQuery, setNavQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useLocalStorage<Record<string, boolean>>('sf-navigation-groups', {});
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const drawerPanel = useRef<HTMLElement>(null);

  const page = isPageKey(route.page) ? route.page : 'overview';
  const definition = pageDef(page);
  const Page = ROUTES[page];
  const activeGroupLabel = NAV_GROUPS.find((group) => group.pages.some((item) => item.key === page))?.label ?? '';
  const filteredGroups = useMemo(() => {
    if (!navQuery.trim()) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({
      ...group,
      pages: fuzzySearch(group.pages, navQuery, (item) => [item.label, item.description, group.label]),
    })).filter((group) => group.pages.length > 0);
  }, [navQuery]);
  const visibleDestinationCount = filteredGroups.reduce((total, group) => total + group.pages.length, 0);

  useHotkey('k', () => setPalette((open) => !open), { meta: true, allowInInput: true });
  useEffect(() => setDrawer(false), [page]);
  useEffect(() => {
    if (!drawer || !activeGroupLabel) return;
    setExpandedGroups((current) => current[activeGroupLabel] === false
      ? { ...current, [activeGroupLabel]: true }
      : current);
  }, [activeGroupLabel, drawer, setExpandedGroups]);
  useEffect(() => {
    if (!drawer) setNavQuery('');
  }, [drawer]);
  useEffect(clearReloadGuard, []);
  useEffect(() => {
    document.title = `${definition.label} · SF Dev Console`;
  }, [definition.label]);

  useEffect(() => {
    if (!drawer) return;
    drawerClose.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDrawer(false);
        requestAnimationFrame(() => menuButton.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        drawerPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]') ?? [],
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawer]);

  function closeDrawer() {
    setDrawer(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  }

  return (
    <div className={`app${drawer ? ' is-drawer-open' : ''}`}>
      <div className="main">
        <main className="page" aria-label={`${definition.label} workspace`}>
          <div className="page-stack workspace-stack">
            <ErrorBoundary resetKey={page}>
              <Suspense fallback={<Loading label={`Loading ${definition.label.toLowerCase()}…`} />}>
                <Page />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        <JobStrip />

        <footer className="statusbar">
          <button
            ref={menuButton}
            className="statusbar-menu"
            onClick={() => setDrawer(true)}
            aria-label="Open application navigation"
            aria-expanded={drawer}
          >
            <Menu />
            <span>Menu</span>
          </button>
          <span className="statusbar-page" title={definition.description}>
            <b>{definition.label}</b>
            <small>{definition.description}</small>
          </span>
          <span className="statusbar-divider" />
          <span className="statusbar-context mono" title={org.username}>{org.username || orgId}</span>
          <span className="statusbar-spacer" />
          <button className="statusbar-command" onClick={() => setPalette(true)} title="Open command palette">
            <Search />
            <span>Commands</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span className="status-connected" title={`Connected as ${org.username}`}>
            <i className="dot dot-success" /> Connected
          </span>
          <button
            className="statusbar-action"
            onClick={() => invalidate(`org:${orgId}`)}
            title="Re-read cached data for this org"
            aria-label="Refresh org data"
          >
            <RefreshCw />
          </button>
          <button
            className="statusbar-action"
            onClick={toggle}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </footer>
      </div>

      <button className="sidebar-scrim" onClick={closeDrawer} aria-label="Close navigation" tabIndex={drawer ? 0 : -1} />
      <aside ref={drawerPanel} className="sidebar" role="dialog" aria-modal="true" aria-label="Application navigation" aria-hidden={!drawer}>
        <div className="sidebar-brand">
          <span className="brandmark"><Cloud /></span>
          <span className="sidebar-brand-copy">
            <b>SF Dev Console</b>
            <small>{definition.label} workspace</small>
          </span>
          <button ref={drawerClose} className="btn btn-ghost btn-icon" onClick={closeDrawer} aria-label="Close navigation">
            <X />
          </button>
        </div>

        <div className="sidebar-context">
          <span className="sidebar-label">Current Salesforce org</span>
          <OrgSwitcher />
          <div className="sidebar-search">
            <Search />
            <input
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              placeholder="Filter navigation…"
              aria-label="Filter navigation destinations"
              autoComplete="off"
            />
            {navQuery ? (
              <button type="button" onClick={() => setNavQuery('')} aria-label="Clear navigation filter">
                <X />
              </button>
            ) : <small>{visibleDestinationCount} tools</small>}
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Workspaces">
          {filteredGroups.map((group) => {
            const GroupIcon = group.icon;
            const isExpanded = navQuery.trim() ? true : expandedGroups[group.label] !== false;
            const containsActivePage = group.label === activeGroupLabel;
            return (
              <section className={`nav-group${containsActivePage ? ' has-active' : ''}`} key={group.label}>
                <button
                  type="button"
                  className="nav-group-heading"
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.label]: !isExpanded }))}
                  aria-expanded={isExpanded}
                  disabled={Boolean(navQuery.trim())}
                >
                  <ChevronRight className="nav-group-chevron" />
                  <GroupIcon />
                  <span>{group.label}</span>
                  <small>{group.pages.length}</small>
                </button>
                <div className="nav-grid" hidden={!isExpanded}>
                  {group.pages.map(({ key, label, description, icon: Icon }) => (
                    <button
                      key={key}
                      className={`nav-item${page === key ? ' is-active' : ''}`}
                      onClick={() => navigate(key)}
                      aria-current={page === key ? 'page' : undefined}
                      title={description}
                    >
                      <span className="nav-item-icon"><Icon /></span>
                      <span className="nav-item-copy">
                        <b>{label}</b>
                        <small>{description}</small>
                      </span>
                      {key === 'metadata' && selectedCount > 0 ? <span className="badge badge-accent">{selectedCount}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {visibleDestinationCount === 0 ? (
            <div className="sidebar-nav-empty">
              <Search />
              <b>No destinations found</b>
              <small>Try a page, workflow, or tool name.</small>
            </div>
          ) : null}
        </nav>
        <div className="sidebar-foot">
          <button className="sidebar-palette-command" onClick={() => { setDrawer(false); setPalette(true); }}>
            <Search />
            <span>All commands</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>
      </aside>

      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </div>
  );
}
