import { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Cloud,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react';
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
import { invalidate } from '../lib/resource';
import { Loading } from '../ui/primitives';
import type { SystemStatus } from '../types';

export function Shell({ status }: { status: SystemStatus }) {
  const { org, orgId, selectedCount } = useAppState();
  const { theme, toggle } = useTheme();
  const route = useRoute();
  const [collapsed, setCollapsed] = useLocalStorage('sf-sidebar-collapsed', false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [navTooltip, setNavTooltip] = useState<{ label: string; top: number; left: number } | null>(null);

  function showNavTooltip(event: React.SyntheticEvent<HTMLButtonElement>, label: string) {
    // Below the drawer breakpoint the rail shows full labels even while "collapsed", so a
    // tooltip would just duplicate visible text.
    if (!collapsed || window.innerWidth <= 860) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setNavTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }
  const hideNavTooltip = () => setNavTooltip(null);
  useEffect(hideNavTooltip, [collapsed]);

  const page = isPageKey(route.page) ? route.page : 'overview';
  const definition = pageDef(page);
  const Page = ROUTES[page];

  useHotkey('k', () => setPalette((open) => !open), { meta: true, allowInInput: true });
  useEffect(() => setDrawer(false), [page]);
  useEffect(clearReloadGuard, []);
  useEffect(() => {
    document.title = `${definition.label} · SF Dev Console`;
  }, [definition.label]);

  return (
    <div className={`app${collapsed ? ' is-collapsed' : ''}${drawer ? ' is-drawer-open' : ''}`}>
      <div className="sidebar-scrim" onClick={() => setDrawer(false)} />

      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brandmark">
            <Cloud />
          </span>
          <b>SF Dev Console</b>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>

        <OrgSwitcher />

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.pages.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  className={`nav-item${page === key ? ' is-active' : ''}`}
                  onClick={() => navigate(key)}
                  onMouseEnter={(event) => showNavTooltip(event, label)}
                  onMouseLeave={hideNavTooltip}
                  onFocus={(event) => showNavTooltip(event, label)}
                  onBlur={hideNavTooltip}
                  aria-label={label}
                  aria-current={page === key ? 'page' : undefined}
                >
                  <span className="nav-tile">
                    <Icon />
                  </span>
                  <span>{label}</span>
                  {key === 'metadata' && selectedCount > 0 ? <span className="badge badge-accent">{selectedCount}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon show-mobile" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <Menu />
          </button>
          <div className="topbar-title">
            <h2>{definition.label}</h2>
            <p>{definition.description}</p>
          </div>
          <div className="topbar-spacer" />
          <button className="palette-trigger" onClick={() => setPalette(true)}>
            <Search />
            <span>Search…</span>
            <span className="kbd">⌘K</span>
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => invalidate(`org:${orgId}`)}
            title="Re-read cached data for this org"
          >
            <RefreshCw />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={toggle} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </header>

        <main className="page">
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
          <b>{definition.label}</b>
          <span className="statusbar-sep">·</span>
          <span>{orgId}</span>
          <span className="statusbar-sep">·</span>
          <span className="hide-mobile">{org.username}</span>
          <span className="statusbar-spacer" />
          <span className="status-connected">
            <i className="dot dot-success" /> Connected
          </span>
          <span className="statusbar-sep">·</span>
          <span className="hide-mobile">Node {status.node}</span>
        </footer>
      </div>

      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
      {navTooltip
        ? createPortal(
            <div className="nav-tooltip-portal" style={{ top: navTooltip.top, left: navTooltip.left }}>
              {navTooltip.label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
