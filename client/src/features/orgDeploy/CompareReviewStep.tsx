import { useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, Info, ShieldAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Callout, Empty, Loading } from '../../ui/primitives';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import type { CompareResult, ComparisonStatus, DiffResult } from '../../types';

const STATUS_TONE: Record<ComparisonStatus, 'neutral' | 'accent' | 'success' | 'danger' | 'warn'> = {
  new: 'accent',
  changed: 'warn',
  identical: 'neutral',
  'missing-source': 'danger',
  unknown: 'neutral',
};

const STATUS_LABEL: Record<ComparisonStatus, string> = {
  new: 'New in source',
  changed: 'Changed',
  identical: 'Identical',
  'missing-source': 'Missing from source',
  unknown: 'Unknown (target unavailable)',
};

export function CompareReviewStep({
  compare,
  selectedKeys,
  setSelectedKeys,
  onBack,
  onNext,
}: {
  compare: CompareResult;
  selectedKeys: Set<string>;
  setSelectedKeys: (keys: Set<string>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const [diffKey, setDiffKey] = useState('');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  function toggle(key: string) {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  }

  async function openDiff(key: string) {
    setDiffKey(key);
    setDiffLoading(true);
    try {
      setDiff(await api<DiffResult>(`/org-deploy/${compare.id}/diff?key=${encodeURIComponent(key)}`));
    } catch (error) {
      toast.error(error);
      setDiffKey('');
    } finally {
      setDiffLoading(false);
    }
  }

  const confirmedMissing = compare.dependencies.filter((d) => d.confidence === 'confirmed-missing');
  const potential = compare.dependencies.filter((d) => d.confidence === 'potential');

  return (
    <div className="page-stack">
      {!compare.targetAvailable ? (
        <Callout icon={AlertTriangle} tone="danger" title="Could not read metadata from the target org">
          {compare.targetError || 'The target retrieval failed.'} Every row below is shown as “unknown” because the comparison
          could not actually be performed against the target.
        </Callout>
      ) : null}

      {confirmedMissing.length ? (
        <Callout icon={ShieldAlert} tone="danger" title={`${confirmedMissing.length} possible missing dependencies`}>
          These references were found in the selected metadata but the related component was not found in this selection or in
          the target org. This is a best-effort scan, not a complete dependency graph — verify before deploying.
          <ul className="dependency-list">
            {confirmedMissing.map((dep, i) => (
              <li key={i}>
                <span className="mono">{dep.from}</span> references {dep.relatedType} <span className="mono">{dep.relatedName}</span>
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {potential.length ? (
        <Callout icon={Info} tone="accent" title={`${potential.length} references could not be verified`}>
          The target org's metadata list wasn't available to confirm these, so they're informational only.
        </Callout>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Compare {compare.sourceOrg} → {compare.targetOrg}</h3>
            <p>Deselect anything you don't want to include before continuing.</p>
          </div>
          <div className="panel-actions">
            <Badge>{selectedKeys.size} of {compare.rows.length} selected</Badge>
            <button className="btn btn-sm" onClick={() => setSelectedKeys(new Set(compare.rows.map((r) => r.key)))}>
              Select all
            </button>
            <button className="btn btn-sm" onClick={() => setSelectedKeys(new Set())}>
              Select none
            </button>
          </div>
        </div>
        <div className="panel-body panel-body-flush">
          {compare.rows.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="cell-check" />
                    <th>Type</th>
                    <th>Component</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {compare.rows.map((row) => (
                    <tr key={row.key} className={selectedKeys.has(row.key) ? 'is-selected' : ''}>
                      <td className="cell-check">
                        <input type="checkbox" checked={selectedKeys.has(row.key)} onChange={() => toggle(row.key)} />
                      </td>
                      <td className="cell-mono">{row.type}</td>
                      <td>{row.fullName}</td>
                      <td>
                        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                      </td>
                      <td>
                        {row.status === 'changed' && compare.targetAvailable ? (
                          <button className="btn btn-sm btn-ghost" onClick={() => openDiff(row.key)}>
                            <Eye /> View diff
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Nothing to compare" text="No components were retrieved for this selection." />
          )}
        </div>
      </section>

      <div className="action-row">
        <button className="btn" onClick={onBack}>
          <ArrowLeft /> Back to metadata
        </button>
        <button className="btn btn-primary" disabled={!selectedKeys.size} onClick={onNext}>
          Continue to deployment settings <ArrowRight />
        </button>
      </div>

      {diffKey ? (
        <Modal icon={Eye} title={`Diff · ${diff?.fullName || diffKey}`} wide flush onClose={() => setDiffKey('')}>
          {diffLoading || !diff ? (
            <Loading label="Loading diff…" />
          ) : (
            <div className="diff-files">
              {diff.files.map((file) => (
                <div className="diff-file" key={file.file}>
                  <div className="diff-file-head mono">{file.file}</div>
                  {file.binary ? (
                    <div className="diff-note">Binary or oversized file — content can't be diffed here.</div>
                  ) : file.tooLarge || !file.diff ? (
                    <div className="diff-note">File is too large to diff in the browser.</div>
                  ) : (
                    <pre className="code-block diff-block">
                      {file.diff.map((line, i) => (
                        <div key={i} className={`diff-line diff-${line.op}`}>
                          {line.op === 'add' ? '+ ' : line.op === 'remove' ? '- ' : '  '}
                          {line.text}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
