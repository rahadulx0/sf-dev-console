import { useEffect } from 'react';
import { Check, FileArchive, LoaderCircle, Rocket, X } from 'lucide-react';
import { api } from '../lib/api';
import { useResource } from '../lib/resource';
import { useDeployJobs, updateDeploy, dismissDeploy } from '../lib/jobs';
import { useTicker } from '../lib/hooks';
import { elapsed } from '../lib/format';
import { navigate } from '../lib/router';
import type { RetrievalRecord } from '../types';

const POLL_MS = 3000;

/** Live status for work that outlives the page that started it. Hidden when nothing runs. */
export function JobStrip() {
  const retrievals = useResource<{ retrievals: RetrievalRecord[] }>(
    'jobs:retrievals',
    (signal) => api('/retrievals', { signal }),
    { ttl: POLL_MS },
  );
  const deploys = useDeployJobs();
  const running = (retrievals.data?.retrievals ?? []).filter((record) => record.status === 'running');
  const active = running.length > 0 || deploys.some((job) => job.status === 'running');

  useTicker(1000, active);

  useEffect(() => {
    if (!running.length) return;
    const timer = setInterval(retrievals.refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [running.length, retrievals.refresh]);

  useEffect(() => {
    const pending = deploys.filter((job) => job.status === 'running');
    if (!pending.length) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      for (const job of pending) {
        try {
          const report = await api<any>(`/deploy/${encodeURIComponent(job.org)}/${job.id}`, { signal: controller.signal });
          const status = String(report?.status ?? report?.deployResult?.status ?? '');
          if (/succeeded/i.test(status)) updateDeploy(job.id, 'success', status);
          else if (/failed|canceled|cancelled/i.test(status)) updateDeploy(job.id, 'failed', status);
        } catch {
          // Transient polling failures are not worth surfacing; the page has a manual check.
        }
      }
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [deploys]);

  if (!deploys.length && !running.length) return null;

  return (
    <div className="jobstrip">
      <span className="jobstrip-label">
        <LoaderCircle className={active ? 'spin' : ''} /> Running
      </span>
      {running.map((record) => (
        <button className="job" key={record.id} onClick={() => navigate('history')} title="Open retrieval history">
          <FileArchive />
          <b>Retrieve</b>
          <span className="mono">{record.orgLabel}</span>
          <span className="mono">{elapsed(record.createdAt)}</span>
        </button>
      ))}
      {deploys.map((job) => (
        <span className="job" key={job.id}>
          {job.status === 'running' ? <Rocket /> : job.status === 'success' ? <Check /> : <X />}
          <b>{job.label}</b>
          <span className="mono">{job.id}</span>
          <span className="mono">{job.status === 'running' ? elapsed(job.startedAt) : job.detail || job.status}</span>
          <button className="btn btn-ghost btn-icon" onClick={() => dismissDeploy(job.id)} aria-label="Dismiss">
            <X />
          </button>
        </span>
      ))}
    </div>
  );
}
