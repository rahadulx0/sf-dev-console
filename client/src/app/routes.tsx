import { lazy, type ComponentType } from 'react';
import type { PageKey } from './pages';

/*
 * One lazy chunk per page. The initial download is the shell plus whichever page the hash
 * points at, instead of all eighteen pages in a single bundle.
 *
 * The loaders are kept addressable rather than hidden inside `lazy()` so a chunk can also be
 * fetched before it is needed. Splitting alone trades a smaller first paint for a stall on
 * every first visit to a page — the code editor's chunk carries CodeMirror and is easily the
 * largest — and prefetching removes that stall without making the first paint any heavier.
 */
const LOADERS: Record<PageKey, () => Promise<{ default: ComponentType<any> }>> = {
  overview: () => import('../features/overview/OverviewPage'),
  metadata: () => import('../features/metadata/MetadataPage'),
  objects: () => import('../features/objects/ObjectsPage'),
  saved: () => import('../features/saved/SavedPage'),
  query: () => import('../features/query/QueryPage'),
  inspector: () => import('../features/inspector/InspectorPage'),
  apex: () => import('../features/apex/ApexPage'),
  editor: () => import('../features/editor/EditorPage'),
  tests: () => import('../features/tests/TestsPage'),
  logs: () => import('../features/logs/LogsPage'),
  org: () => import('../features/org/OrgPage'),
  limits: () => import('../features/limits/LimitsPage'),
  packages: () => import('../features/packages/PackagesPage'),
  deploy: () => import('../features/deploy/DeployPage'),
  orgDeploy: () => import('../features/orgDeploy/OrgDeployPage'),
  history: () => import('../features/history/HistoryPage'),
  activities: () => import('../features/activities/ActivitiesPage'),
  capabilities: () => import('../features/capabilities/CapabilitiesPage'),
};

export const ROUTES = (Object.keys(LOADERS) as PageKey[]).reduce(
  (routes, key) => {
    routes[key] = lazy(LOADERS[key]);
    return routes;
  },
  {} as Record<PageKey, ComponentType>,
);

/** Chunks already requested. The browser caches the module, so asking twice is just noise. */
const requested = new Set<PageKey>();

/** Starts downloading a page's chunk. Safe to call repeatedly, e.g. on every hover. */
export function prefetchRoute(key: PageKey) {
  if (requested.has(key) || !LOADERS[key]) return;
  requested.add(key);
  // A chunk that fails to prefetch is simply loaded again, and reported, on navigation.
  void LOADERS[key]().catch(() => requested.delete(key));
}

/**
 * Pulls the remaining page chunks down once the browser is idle, one at a time so the
 * downloads never compete with a request the user is actually waiting on.
 */
export function prefetchAllRoutes() {
  const pending = (Object.keys(LOADERS) as PageKey[]).filter((key) => !requested.has(key));
  const idle: (callback: () => void) => void =
    typeof requestIdleCallback === 'function' ? (callback) => requestIdleCallback(callback, { timeout: 2000 }) : (callback) => setTimeout(callback, 300);

  const next = () => {
    const key = pending.shift();
    if (!key) return;
    prefetchRoute(key);
    idle(next);
  };
  idle(next);
}
