import { Box, Cloud, Code2, Database, Rocket, ShieldCheck } from 'lucide-react';
import type { ComponentType } from 'react';

export interface CapabilityGroup {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  items: [name: string, detail: string][];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    title: 'Org management',
    description: 'Work with Salesforce authorizations stored on this device.',
    icon: Cloud,
    items: [
      ['Authorized org selector', 'List and switch between locally authorized orgs.'],
      ['Browser authorization', 'Authorize Production, Developer, or Sandbox orgs.'],
      ['Authorization options', 'Set an alias, preferred browser, default org, or Dev Hub.'],
      ['Org information', 'Review username, org ID, instance URL, status, and environment.'],
      ['Open Salesforce org', 'Launch the selected org directly in the browser.'],
      ['Org limits', 'Inspect API and platform capacity reported by Salesforce.'],
      ['Installed packages', 'Browse managed and unlocked packages with pagination.'],
    ],
  },
  {
    title: 'Metadata',
    description: 'Discover, select, retrieve, and organize Salesforce metadata.',
    icon: Box,
    items: [
      ['Metadata type discovery', 'Load metadata types supported by the selected org.'],
      ['Component browser', 'Expand a metadata type and browse its components.'],
      ['Fuzzy metadata search', 'Rank approximate matches across types and loaded components.'],
      ['Multi-select metadata', 'Select components individually or select an entire type.'],
      ['Curated selection presets', 'Quick-select Apex, frontend, objects, automation, or security.'],
      ['Saved selections', 'Save, reload, and delete frequently retrieved component collections.'],
      ['package.xml builder', 'Generate a sorted Salesforce manifest from the selection.'],
      ['package.xml upload', 'Validate and use an existing local Salesforce manifest.'],
      ['Retrieve preview', 'Preview retrieval changes and source conflicts before running.'],
      ['Metadata retrieval', 'Retrieve selected components or an uploaded manifest.'],
      ['Metadata ZIP download', 'Download completed retrieval output in a portable archive.'],
      ['Retrieval history', 'Track local retrieval status, failures, and completed output.'],
    ],
  },
  {
    title: 'Data tools',
    description: 'Explore schema and safely inspect or modify Salesforce records.',
    icon: Database,
    items: [
      ['SOQL query editor', 'Execute SOQL through the local Salesforce CLI.'],
      ['Tooling API queries', 'Opt in per query to access Tooling API objects and fields.'],
      ['Schema-aware autocomplete', 'Suggest objects and fields with fuzzy matching.'],
      ['SELECT field expansion', 'Press Tab after SELECT to insert fields for the FROM object.'],
      ['Scalable query results', 'Review large result sets in a paginated, scrollable table.'],
      ['Copy for Excel', 'Copy all or selected query rows as tab-separated values.'],
      ['CSV export', 'Download query results and record counts as CSV.'],
      ['Guarded record deletion', 'Delete selected query records with exact confirmation.'],
      ['Object explorer', 'Browse standard and custom Salesforce objects.'],
      ['Object describe', 'Inspect field types and create, update, and nullability properties.'],
      ['Record counts', 'Count selected objects and export the results as CSV.'],
      ['Record inspector', 'Retrieve an individual record by object and Salesforce ID.'],
      ['Field-level record editing', 'Edit updateable fields with schema-appropriate controls.'],
      ['Salesforce validation feedback', 'Surface record update and validation errors in the UI.'],
    ],
  },
  {
    title: 'Apex and diagnostics',
    description: 'Run Apex workflows and inspect execution diagnostics.',
    icon: Code2,
    items: [
      ['Anonymous Apex', 'Execute anonymous Apex entered in the editor.'],
      ['Apex test runner', 'Run local, all-org, or specifically selected Apex tests.'],
      ['Code coverage results', 'Request and review Apex code coverage with test output.'],
      ['Debug log browser', 'List, filter, and paginate recent Salesforce debug logs.'],
      ['Debug log viewer', 'Download, inspect, and copy the full contents of a log.'],
    ],
  },
  {
    title: 'Deployments',
    description: 'Preview and execute guarded metadata deployment workflows.',
    icon: Rocket,
    items: [
      ['Deployment preview', 'Inspect source changes before modifying the target org.'],
      ['Deployment validation', 'Run a check-only deployment with Salesforce tests.'],
      ['Asynchronous deployment', 'Start a protected source deployment from a local project.'],
      ['Deployment reporting', 'Check deployment status and Salesforce result details by job ID.'],
      ['Quick deploy', 'Deploy a previously successful validation by job ID.'],
      ['Deployment cancellation', 'Cancel an active deployment request.'],
      ['Live job tracking', 'Watch running retrievals and deployments with elapsed time.'],
      ['Destructive-action guards', 'Require exact confirmations for deploy and delete operations.'],
    ],
  },
  {
    title: 'Local desktop platform',
    description: 'Device-specific tooling without a hosted database or credential proxy.',
    icon: ShieldCheck,
    items: [
      ['Local Salesforce CLI bridge', 'Run supported sf commands without exposing a terminal.'],
      ['Database-free storage', 'Keep preferences, selections, and history in local files.'],
      ['Operation history', 'Review recent local API operations and outcomes.'],
      ['Cached org data', 'Reuse schema reads between pages, with visible age and manual refresh.'],
      ['Command palette', 'Jump to any page, org, or action from a single fuzzy search.'],
      ['Deep links and history', 'Back, forward, refresh, and per-object URLs all work.'],
      ['Dark and light themes', 'Follows the operating system on first run and remembers the choice.'],
      ['Collapsible workspace', 'Use a responsive, expandable desktop navigation layout.'],
      ['GitHub application updates', 'Check, download, install, and restart from a GitHub Release.'],
    ],
  },
];

export const CAPABILITY_TOTAL = CAPABILITY_GROUPS.reduce((total, group) => total + group.items.length, 0);
