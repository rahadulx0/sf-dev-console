export interface SfOrg {
  alias?: string;
  username: string;
  orgId?: string;
  instanceUrl?: string;
  isSandbox?: boolean;
  connectedStatus?: string;
  isDefaultUsername?: boolean;
}

export interface Selection { type: string; members: string[] }

export interface RetrievalRecord {
  id: string; org: string; orgLabel: string; createdAt: string; status: 'running' | 'success' | 'failed';
  selections: Selection[]; componentCount: number; manifestPath: string; outputPath?: string; error?: string;
}

export interface SavedSet { id: string; name: string; createdAt: string; selections: Selection[] }
export interface ActivityRecord { id: string; operation: string; method: string; statusCode: number; createdAt: string }
