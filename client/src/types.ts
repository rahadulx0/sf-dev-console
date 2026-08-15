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
