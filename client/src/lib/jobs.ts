import { useSyncExternalStore } from 'react';

/**
 * Deployments run asynchronously in Salesforce and are only addressable by job ID, so the
 * application tracks the ones it started for the life of the window. Retrievals are tracked
 * by the server instead and read back from /api/retrievals.
 */
export interface DeployJob {
  id: string;
  org: string;
  label: string;
  startedAt: number;
  status: 'running' | 'success' | 'failed';
  detail?: string;
}

let jobs: DeployJob[] = [];
const listeners = new Set<() => void>();

function emit() {
  jobs = [...jobs];
  for (const listener of [...listeners]) listener();
}

export function trackDeploy(job: Omit<DeployJob, 'startedAt' | 'status'>) {
  if (jobs.some((existing) => existing.id === job.id)) return;
  jobs = [...jobs, { ...job, startedAt: Date.now(), status: 'running' }];
  emit();
}

export function updateDeploy(id: string, status: DeployJob['status'], detail?: string) {
  const job = jobs.find((existing) => existing.id === id);
  if (!job || job.status === status) return;
  job.status = status;
  job.detail = detail;
  emit();
  // Finished jobs linger briefly so the outcome is visible, then clear themselves.
  if (status !== 'running') setTimeout(() => dismissDeploy(id), 20_000);
}

export function dismissDeploy(id: string) {
  jobs = jobs.filter((job) => job.id !== id);
  emit();
}

export function useDeployJobs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => jobs,
    () => jobs,
  );
}
