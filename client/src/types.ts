export interface Org {
  alias?: string;
  username: string;
  orgId?: string;
  instanceUrl?: string;
  isSandbox?: boolean;
  connectedStatus?: string;
  isDefaultUsername?: boolean;
}

export interface Selection {
  type: string;
  members: string[];
}

export interface SystemStatus {
  cli: { installed: boolean; version?: string; error?: string };
  node: string;
  storage: string;
}

export interface RetrievalRecord {
  id: string;
  org: string;
  orgLabel: string;
  createdAt: string;
  status: 'running' | 'success' | 'failed';
  selections: Selection[];
  componentCount: number;
  error?: string;
}

export interface ActivityRecord {
  id: string;
  operation: string;
  method: string;
  statusCode: number;
  createdAt: string;
}

export interface SavedSet {
  id: string;
  name: string;
  createdAt: string;
  selections: Selection[];
}

export interface SalesforceField {
  name: string;
  label?: string;
  type: string;
  updateable?: boolean;
  createable?: boolean;
  nillable?: boolean;
  length?: number;
  picklistValues?: { label: string; value: string; active: boolean }[];
}

export const orgIdOf = (org: Org) => org.alias || org.username;

export type ComparisonStatus = 'new' | 'changed' | 'identical' | 'missing-source' | 'unknown';

export interface ComparisonRow {
  key: string;
  type: string;
  fullName: string;
  files: string[];
  sourceExists: boolean;
  targetExists: boolean;
  status: ComparisonStatus;
}

export type DependencyConfidence = 'confirmed-missing' | 'potential' | 'informational';

export interface Dependency {
  from: string;
  relatedType: 'ApexClass' | 'CustomField';
  relatedName: string;
  confidence: DependencyConfidence;
}

export interface CompareResult {
  id: string;
  sourceOrg: string;
  targetOrg: string;
  targetAvailable: boolean;
  targetError?: string;
  rows: ComparisonRow[];
  dependencies: Dependency[];
}

export interface DiffFile {
  file: string;
  binary: boolean;
  tooLarge: boolean;
  sourceText?: string;
  targetText?: string;
  diff: { op: 'equal' | 'add' | 'remove'; text: string }[] | null;
}

export interface DiffResult {
  key: string;
  type: string;
  fullName: string;
  targetAvailable: boolean;
  files: DiffFile[];
}

export type TestLevel = 'NoTestRun' | 'RunSpecifiedTests' | 'RunLocalTests' | 'RunAllTestsInOrg';

export interface OrgDeployRecord {
  id: string;
  sourceOrg: string;
  targetOrg: string;
  mode: 'validate' | 'deploy';
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  jobId?: string;
  componentCount: number;
  types: string[];
  createdAt: string;
  completedAt?: string;
  error?: string;
}
