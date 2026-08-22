import { Suspense, useEffect, useRef, useState } from 'react';
import { Cloud, Menu, Moon, RefreshCw, Search, Sun, X } from 'lucide-react';
import { NAV_GROUPS, isPageKey, pageDef } from './pages';
import { ROUTES } from './routes';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary, clearReloadGuard } from './ErrorBoundary';
import { JobStrip } from './JobStrip';
import { OrgSwitcher } from './OrgSwitcher';
import { useAppState } from './state';
import { useTheme } from './theme';
import { useRoute, navigate } from '../lib/router';
import { useHotkey } from '../lib/hooks';
import { invalidate } from '../lib/resource';
import { Loading } from '../ui/primitives';
import type { SystemStatus } from '../types';

export function Shell({ status }: { status: SystemStatus }) {
  const { org, orgId, selectedCount } = useAppState();
  const { theme, toggle } = useTheme();
  const route = useRoute();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const drawerPanel = useRef<HTMLElement>(null);

  const page = isPageKey(route.page) ? route.page : 'overview';
  const definition = pageDef(page);
  const Page = ROUTES[page];

  useHotkey('k', () => setPalette((open) => !open), { meta: true, allowInInput: true });
  useEffect(() => setDrawer(false), [page]);
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
          <div className="page-stack">
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
          <span className="statusbar-context mono" title={org.username}>{orgId}</span>
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
          <span className="statusbar-runtime">Node {status.node}</span>
        </footer>
      </div>

      <button className="sidebar-scrim" onClick={closeDrawer} aria-label="Close navigation" tabIndex={drawer ? 0 : -1} />
      <aside ref={drawerPanel} className="sidebar" role="dialog" aria-modal="true" aria-label="Application navigation" aria-hidden={!drawer}>
        <div className="sidebar-brand">
          <span className="brandmark"><Cloud /></span>
          <span className="sidebar-brand-copy">
            <b>SF Dev Console</b>
            <small>Developer workbench</small>
          </span>
          <button ref={drawerClose} className="btn btn-ghost btn-icon" onClick={closeDrawer} aria-label="Close navigation">
            <X />
          </button>
        </div>

        <div className="sidebar-context">
          <span className="sidebar-label">Active environment</span>
          <OrgSwitcher />
          <button className="drawer-command" onClick={() => { setDrawer(false); setPalette(true); }}>
            <Search />
            <span>Find a tool or action</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Workspaces">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section className="nav-group" key={group.label}>
                <div className="nav-group-label">
                  <GroupIcon />
                  <span>{group.label}</span>
                </div>
                <div className="nav-grid">
                  {group.pages.map(({ key, label, description, icon: Icon }) => (
                    <button
                      key={key}
                      className={`nav-item${page === key ? ' is-active' : ''}`}
                      onClick={() => navigate(key)}
                      aria-current={page === key ? 'page' : undefined}
                      title={description}
                    >
                      <span className="nav-tile"><Icon /></span>
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
        </nav>
        <div className="sidebar-foot">
          <span><i className="dot dot-success" /> Local backend online</span>
          <span className="mono">127.0.0.1</span>
        </div>
      </aside>

      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </div>
  );
}
