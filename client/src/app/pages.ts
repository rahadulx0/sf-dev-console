import {
  Activity,
  Box,
  CircleHelp,
  Cloud,
  Code2,
  Database,
  Gauge,
  GitCompare,
  History,
  LayoutDashboard,
  Package,
  PackageCheck,
  Rocket,
  ScrollText,
  SearchCode,
  ShieldCheck,
  Terminal,
  TestTube2,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type PageKey =
  | 'overview'
  | 'metadata'
  | 'saved'
  | 'history'
  | 'objects'
  | 'query'
  | 'inspector'
  | 'apex'
  | 'tests'
  | 'logs'
  | 'org'
  | 'limits'
  | 'packages'
  | 'deploy'
  | 'orgDeploy'
  | 'activities'
  | 'capabilities';

export interface PageDef {
  key: PageKey;
  label: string;
  /** Shown next to the page title in the top bar and as palette context. */
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavGroup {
  label: string;
  icon: ComponentType<{ className?: string }>;
  pages: PageDef[];
}

/** Related workflows are presented as submenus in the navigation rail. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Home',
    icon: LayoutDashboard,
    pages: [
      { key: 'overview', label: 'Overview', description: 'Workspace summary and shortcuts', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Metadata',
    icon: Box,
    pages: [
      { key: 'metadata', label: 'Metadata', description: 'Browse, select, and retrieve metadata', icon: Box },
      { key: 'saved', label: 'Saved selections', description: 'Reusable component sets', icon: PackageCheck },
      { key: 'history', label: 'Retrieval history', description: 'Metadata jobs stored on this device', icon: History },
    ],
  },
  {
    label: 'Data',
    icon: Database,
    pages: [
      { key: 'objects', label: 'Objects', description: 'Schema and record counts', icon: Database },
      { key: 'query', label: 'SOQL query', description: 'Query records with schema-aware completion', icon: Terminal },
      { key: 'inspector', label: 'Record inspector', description: 'View and edit a single record', icon: SearchCode },
    ],
  },
  {
    label: 'Apex',
    icon: Code2,
    pages: [
      { key: 'apex', label: 'Anonymous Apex', description: 'Execute Apex through the local CLI', icon: Code2 },
      { key: 'tests', label: 'Apex tests', description: 'Run tests and collect coverage', icon: TestTube2 },
      { key: 'logs', label: 'Debug logs', description: 'Inspect recent execution logs', icon: ScrollText },
    ],
  },
  {
    label: 'Org management',
    icon: Cloud,
    pages: [
      { key: 'org', label: 'Org information', description: 'Connection and instance details', icon: Cloud },
      { key: 'limits', label: 'Org limits', description: 'API and platform capacity', icon: Gauge },
      { key: 'packages', label: 'Installed packages', description: 'Managed and unlocked packages', icon: Package },
    ],
  },
  {
    label: 'Deployment',
    icon: Rocket,
    pages: [
      { key: 'deploy', label: 'Deploy & validate', description: 'Preview, validate, and deploy metadata', icon: Rocket },
      {
        key: 'orgDeploy',
        label: 'Org-to-org deploy',
        description: 'Compare and deploy metadata between two orgs',
        icon: GitCompare,
      },
    ],
  },
  {
    label: 'Activity & help',
    icon: CircleHelp,
    pages: [
      { key: 'activities', label: 'Operation history', description: 'Recent local API operations', icon: Activity },
      { key: 'capabilities', label: 'Capabilities', description: 'What this application can do today', icon: ShieldCheck },
    ],
  },
];

export const PAGES: PageDef[] = NAV_GROUPS.flatMap((group) => group.pages);

const byKey = new Map(PAGES.map((page) => [page.key, page]));

export function pageDef(key: PageKey): PageDef {
  return byKey.get(key) ?? PAGES[0];
}

export function isPageKey(value: string): value is PageKey {
  return byKey.has(value as PageKey);
}
