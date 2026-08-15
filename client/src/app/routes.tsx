import { lazy, type ComponentType } from 'react';
import type { PageKey } from './pages';

/*
 * One lazy chunk per page. The initial download is the shell plus whichever page the hash
 * points at, instead of all sixteen pages in a single bundle.
 */
export const ROUTES: Record<PageKey, ComponentType> = {
  overview: lazy(() => import('../features/overview/OverviewPage')),
  metadata: lazy(() => import('../features/metadata/MetadataPage')),
  objects: lazy(() => import('../features/objects/ObjectsPage')),
  saved: lazy(() => import('../features/saved/SavedPage')),
  query: lazy(() => import('../features/query/QueryPage')),
  inspector: lazy(() => import('../features/inspector/InspectorPage')),
  apex: lazy(() => import('../features/apex/ApexPage')),
  tests: lazy(() => import('../features/tests/TestsPage')),
  logs: lazy(() => import('../features/logs/LogsPage')),
  org: lazy(() => import('../features/org/OrgPage')),
  limits: lazy(() => import('../features/limits/LimitsPage')),
  packages: lazy(() => import('../features/packages/PackagesPage')),
  deploy: lazy(() => import('../features/deploy/DeployPage')),
  history: lazy(() => import('../features/history/HistoryPage')),
  activities: lazy(() => import('../features/activities/ActivitiesPage')),
  capabilities: lazy(() => import('../features/capabilities/CapabilitiesPage')),
};
