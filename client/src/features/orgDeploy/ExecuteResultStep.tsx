import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, LoaderCircle, RotateCcw, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Badge, CodeBlock, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import type { OrgDeployRecord } from '../../types';

const POLL_MS = 4000;
const PENDING_STATUSES = new Set(['Pending', 'InProgress', 'Queued', 'Canceling']);

interface LogEntry {
  at: number;
  text: string;
}

function normalizeList(value: unknown): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function ExecuteResultStep({
  record,
  submitResponse,
  onRestart,
}: {
  record: OrgDeployRecord;
  submitResponse: any;
  onRestart: () => void;
}) {
  const toast = useToast();
  const [report, setReport] = useState<any>(submitResponse);
  const [status, setStatus] = useState<'running' | 'succeeded' | 'failed'>('running');
  const [log, setLog] = useState<LogEntry[]>([{ at: Date.now(), text: `Submitted ${record.mode} job${record.jobId ? ` ${record.jobId}` : ''}` }]);
  const [busy, setBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [jobId, setJobId] = useState(record.jobId || '');
  const [quickConfirmation, setQuickConfirmation] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    if (!jobId) {
      setLog((current) => [...current, { at: Date.now(), text: 'No job ID was returned — nothing to poll.' }]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const response = await api<any>(`/deploy/${encodeURIComponent(record.targetOrg)}/${jobId}`);
        if (cancelled) return;
        setReport(response);
        const done = typeof response?.done === 'boolean' ? response.done : !PENDING_STATUSES.has(response?.status);
        setLog((current) => [...current, { at: Date.now(), text: `Status: ${response?.status || 'Unknown'}` }]);
        if (done) {
          doneRef.current = true;
          const success = !!response?.success;
          setStatus(success ? 'succeeded' : 'failed');
          void api(`/org-deploy/history/${record.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: success ? 'succeeded' : 'failed' }),
          }).catch(() => {});
          return;
        }
      } catch (error) {
        if (cancelled) return;
        setLog((current) => [...current, { at: Date.now(), text: `Poll error: ${error instanceof Error ? error.message : String(error)}` }]);
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, record.targetOrg, record.id]);

  async function cancel() {
    if (!jobId) return;
    setBusy(true);
    try {
      await api('/deploy/cancel', { method: 'POST', body: JSON.stringify({ org: record.targetOrg, jobId }) });
      setLog((current) => [...current, { at: Date.now(), text: 'Cancellation requested' }]);
      toast.info('Cancellation requested', `Job ${jobId}`);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  async function quickDeploy() {
    if (!jobId) return;
    setBusy(true);
    try {
      const response = await api<any>('/deploy/quick', {
        method: 'POST',
        body: JSON.stringify({ org: record.targetOrg, jobId, confirmation: quickConfirmation }),
      });
      const nextJobId = response?.id || response?.jobId || jobId;
      setReport(response);
      setStatus('running');
      setJobId(nextJobId);
      setQuickConfirmation('');
      setLog((current) => [...current, { at: Date.now(), text: `Quick deploy submitted as job ${nextJobId}` }]);
      toast.success('Quick deploy started', `Job ${nextJobId}`);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  const componentFailures = normalizeList(report?.details?.componentFailures);
  const testFailures = normalizeList(report?.details?.runTestResult?.failures);
  const coverageWarnings = normalizeList(report?.details?.runTestResult?.codeCoverageWarnings);

  return (
    <div className="page-stack">
      <Panel>
        <PanelHead
          title={`${record.mode === 'deploy' ? 'Deployment' : 'Validation'} · ${record.sourceOrg} → ${record.targetOrg}`}
          description={jobId ? `Job ${jobId}` : 'Submitted to Salesforce'}
        >
          <Badge tone={status === 'succeeded' ? 'success' : status === 'failed' ? 'danger' : 'accent'}>
            {status === 'running' ? <LoaderCircle className="spin" /> : status === 'succeeded' ? <Check /> : <XCircle />} {status}
          </Badge>
        </PanelHead>
        <div className="panel-body">
          <div className="detail-grid">
            <div>
              <span>Components</span>
              <b>
                {report?.numberComponentsDeployed ?? '—'} / {report?.numberComponentsTotal ?? record.componentCount}
              </b>
            </div>
            <div>
              <span>Component errors</span>
              <b>{report?.numberComponentErrors ?? 0}</b>
            </div>
            <div>
              <span>Tests run</span>
              <b>
                {report?.numberTestsCompleted ?? report?.runTestResult?.numTestsRun ?? '—'} / {report?.numberTestsTotal ?? '—'}
              </b>
            </div>
            <div>
              <span>Test failures</span>
              <b>{report?.numberTestErrors ?? testFailures.length}</b>
            </div>
          </div>

          <div className="action-row">
            {status === 'running' && jobId ? (
              <button className="btn btn-destructive btn-sm" disabled={busy} onClick={cancel}>
                Cancel job
              </button>
            ) : null}
            {status !== 'running' ? (
              <button className="btn btn-sm" onClick={onRestart}>
                <RotateCcw /> Start another deployment
              </button>
            ) : null}
          </div>

          {status === 'succeeded' && record.mode === 'validate' && !record.targetIsSandbox && jobId ? (
            <div className="quick-zone">
              <div><b>Validation succeeded</b><small>Type <code>QUICK DEPLOY {jobId}</code> to deploy this validated package without rerunning tests.</small></div>
              <input className="input input-mono" value={quickConfirmation} onChange={(event) => setQuickConfirmation(event.target.value)} placeholder={`QUICK DEPLOY ${jobId}`} />
              <button className="btn btn-primary" disabled={busy || quickConfirmation !== `QUICK DEPLOY ${jobId}`} onClick={quickDeploy}>Quick deploy</button>
            </div>
          ) : null}

          <div className="row-list" style={{ marginTop: 'var(--s-4)' }}>
            {log.map((entry, i) => (
              <div className="row" key={i}>
                <div className="row-main">
                  <b>{entry.text}</b>
                  <small>{dateTime(new Date(entry.at).toISOString())}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {componentFailures.length ? (
        <Panel>
          <PanelHead title="Component failures" description="Readable errors, straight from Salesforce's deploy result." />
          <div className="panel-body panel-body-flush">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Component</th>
                    <th>Problem</th>
                    <th>Line</th>
                  </tr>
                </thead>
                <tbody>
                  {componentFailures.map((failure, i) => (
                    <tr key={i}>
                      <td className="cell-mono">{failure.componentType}</td>
                      <td>{failure.fullName || failure.fileName}</td>
                      <td>{failure.problem}</td>
                      <td>{failure.lineNumber ? `${failure.lineNumber}:${failure.columnNumber ?? 0}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      ) : null}

      {testFailures.length ? (
        <Panel>
          <PanelHead title="Apex test failures" />
          <div className="panel-body panel-body-flush">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Method</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {testFailures.map((failure, i) => (
                    <tr key={i}>
                      <td className="cell-mono">{failure.name}</td>
                      <td className="cell-mono">{failure.methodName}</td>
                      <td>{failure.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      ) : null}

      {coverageWarnings.length ? (
        <Panel>
          <PanelHead title="Code coverage failures" />
          <div className="panel-body panel-body-flush">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {coverageWarnings.map((warning, i) => (
                    <tr key={i}>
                      <td className="cell-mono">{warning.name}</td>
                      <td>{warning.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHead title="Raw Salesforce CLI output" description="For technical troubleshooting.">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? <ChevronDown /> : <ChevronRight />} {showRaw ? 'Hide' : 'Show'}
          </button>
        </PanelHead>
        {showRaw ? (
          <div className="panel-body">
            <CodeBlock>{JSON.stringify(report, null, 2)}</CodeBlock>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
