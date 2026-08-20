import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  FileCode2,
  Info,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Callout, Empty } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import type { CompareResult, ComparisonRow, ComparisonStatus, DiffResult } from '../../types';
import { SelectMenu } from '../../ui/SelectMenu';

const STATUS_LABEL: Record<ComparisonStatus, string> = {
  new: 'New',
  changed: 'Changed',
  identical: 'No difference',
  'missing-source': 'Target only',
  unknown: 'Unknown',
};

type StatusFilter = 'all' | ComparisonStatus;

function statusClass(status: ComparisonStatus) {
  return `comparison-status comparison-status-${status}`;
}

function CodePane({
  label,
  org,
  text,
  side,
  lines,
}: {
  label: string;
  org: string;
  text?: string;
  side: 'source' | 'target';
  lines?: { op: 'equal' | 'add' | 'remove'; text: string }[] | null;
}) {
  let lineNumber = 0;
  const rendered = lines
    ? lines.map((line) => {
        const visible = line.op === 'equal' || (side === 'source' ? line.op === 'remove' : line.op === 'add');
        if (visible) lineNumber++;
        return { ...line, visible, lineNumber: visible ? lineNumber : undefined };
      })
    : (text ?? '').split('\n').map((line, index) => ({ op: 'equal' as const, text: line, visible: true, lineNumber: index + 1 }));
  return (
    <section className="comparison-code-pane">
      <header>
        <div>
          <b>{label}</b>
          <span>{org}</span>
        </div>
      </header>
      {text === undefined ? (
        <div className="comparison-code-empty">This file does not exist in this org.</div>
      ) : (
        <pre className="comparison-code">
          {rendered.map((line, index) => (
            <div className={`comparison-code-line is-${line.visible ? line.op : 'placeholder'}`} key={index}>
              <span>{line.lineNumber ?? ''}</span>
              <code>{line.visible ? line.text || ' ' : ' '}</code>
            </div>
          ))}
        </pre>
      )}
    </section>
  );
}

export function CompareReviewStep({
  compare,
  selectedKeys,
  setSelectedKeys,
  destructiveKeys,
  setDestructiveKeys,
  onBack,
  onNext,
}: {
  compare: CompareResult;
  selectedKeys: Set<string>;
  setSelectedKeys: (keys: Set<string>) => void;
  destructiveKeys: Set<string>;
  setDestructiveKeys: (keys: Set<string>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [activeType, setActiveType] = useState('all');
  const [activeKey, setActiveKey] = useState(compare.rows[0]?.key ?? '');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [diffFullscreen, setDiffFullscreen] = useState(false);
  const [selectedTrayOpen, setSelectedTrayOpen] = useState(false);

  const counts = useMemo(() => {
    const result = { all: compare.rows.length, new: 0, changed: 0, identical: 0, 'missing-source': 0, unknown: 0 };
    compare.rows.forEach((row) => result[row.status]++);
    return result;
  }, [compare.rows]);

  const types = useMemo(() => {
    const grouped = new Map<string, ComparisonRow[]>();
    compare.rows.forEach((row) => grouped.set(row.type, [...(grouped.get(row.type) ?? []), row]));
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [compare.rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return compare.rows.filter(
      (row) =>
        (status === 'all' || row.status === status) &&
        (activeType === 'all' || row.type === activeType) &&
        (!needle || row.fullName.toLowerCase().includes(needle) || row.type.toLowerCase().includes(needle)),
    );
  }, [activeType, compare.rows, query, status]);

  const activeRow = compare.rows.find((row) => row.key === activeKey);

  useEffect(() => {
    setActiveFileIndex(0);
    if (!activeRow || activeRow.status === 'identical' || !compare.targetAvailable) {
      setDiff(null);
      return;
    }
    const controller = new AbortController();
    setDiffLoading(true);
    setDiff(null);
    api<DiffResult>(`/org-deploy/${compare.id}/diff?key=${encodeURIComponent(activeRow.key)}`, { signal: controller.signal })
      .then(setDiff)
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiffLoading(false);
      });
    return () => controller.abort();
  }, [activeKey, activeRow, compare.id, compare.targetAvailable, toast]);

  function toggle(key: string) {
    const row = compare.rows.find((item) => item.key === key);
    if (row?.status === 'missing-source') {
      const next = new Set(destructiveKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setDestructiveKeys(next);
      return;
    }
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  }

  function selectVisible(selected: boolean) {
    const next = new Set(selectedKeys);
    visibleRows.filter((row) => row.status !== 'missing-source').forEach((row) => (selected ? next.add(row.key) : next.delete(row.key)));
    setSelectedKeys(next);
  }

  function toggleType(type: string) {
    const next = new Set(expandedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setExpandedTypes(next);
  }

  function moveActive(direction: -1 | 1) {
    if (!visibleRows.length) return;
    const current = visibleRows.findIndex((row) => row.key === activeKey);
    const next = current < 0 ? 0 : (current + direction + visibleRows.length) % visibleRows.length;
    setActiveKey(visibleRows[next].key);
  }

  function exportResults() {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      ['Name', 'Metadata type', 'Difference type', 'Selected'].map(quote).join(','),
      ...visibleRows.map((row) => [row.fullName, row.type, STATUS_LABEL[row.status], selectedKeys.has(row.key) || destructiveKeys.has(row.key) ? 'Yes' : 'No'].map(quote).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparison-${compare.sourceOrg}-to-${compare.targetOrg}.csv`.replaceAll(/[^A-Za-z0-9_.-]/g, '_');
    link.click();
    URL.revokeObjectURL(url);
  }

  const confirmedMissing = compare.dependencies.filter((dependency) => dependency.confidence === 'confirmed-missing');
  const potential = compare.dependencies.filter((dependency) => dependency.confidence === 'potential');
  const activeFile = diff?.files[activeFileIndex];
  const selectedRows = compare.rows.filter((row) => selectedKeys.has(row.key) || destructiveKeys.has(row.key));

  return (
    <div className="page-stack comparison-review">
      {!compare.targetAvailable ? (
        <Callout icon={AlertTriangle} tone="danger" title="Could not read metadata from the target org">
          {compare.targetError || 'The target retrieval failed.'} Results are marked unknown until the target can be read.
        </Callout>
      ) : null}

      {confirmedMissing.length ? (
        <Callout icon={ShieldAlert} tone="danger" title={`${confirmedMissing.length} possible missing dependencies`}>
          References found in the selected metadata could not be found in this selection or the target org. Verify them before deployment.
        </Callout>
      ) : potential.length ? (
        <Callout icon={Info} tone="accent" title={`${potential.length} references could not be verified`}>
          These references are informational because the target metadata list was unavailable.
        </Callout>
      ) : null}

      {compare.includedFieldLevelSecurity ? (
        <Callout icon={ShieldAlert} tone="accent" title="Field-level security included from the source org">
          Profile and Permission Set differences shown below are scoped to the Custom Fields in this comparison. Keep the required security components selected to deploy their FLS.
        </Callout>
      ) : null}

      {counts['missing-source'] ? (
        <Callout icon={AlertTriangle} tone="danger" title="Target-only metadata is never deleted automatically">
          Select a target-only row explicitly to add it to destructiveChangesPost.xml. Unselected target-only components are ignored.
        </Callout>
      ) : null}

      <section className="comparison-workspace">
        <header className="comparison-toolbar">
          <div className="comparison-route">
            <div><small>Source</small><b>{compare.sourceOrg}</b></div>
            <ArrowRight />
            <div><small>Target</small><b>{compare.targetOrg}</b></div>
          </div>
          <label className="comparison-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter metadata…" />
          </label>
        </header>

        <div className="comparison-filter-tabs">
          {([
            ['all', 'All items'],
            ['new', 'New'],
            ['changed', 'Changed'],
            ['missing-source', 'Target only'],
            ['identical', 'No difference'],
          ] as [StatusFilter, string][]).map(([value, label]) => (
            <button className={status === value ? 'is-active' : ''} key={value} onClick={() => setStatus(value)}>
              <i className={value === 'all' ? 'comparison-dot-all' : `comparison-dot-${value}`} />
              {label}<span>{counts[value]}</span>
            </button>
          ))}
        </div>

        <div className="comparison-layout">
          <aside className="comparison-types">
            <div className="comparison-side-title">Compared types <span>{types.length}</span></div>
            <button className={`comparison-type${activeType === 'all' ? ' is-active' : ''}`} onClick={() => setActiveType('all')}>
              <span>All metadata</span><b>{compare.rows.length}</b>
            </button>
            {types.map(([type, rows]) => (
              <div key={type}>
                <button className={`comparison-type${activeType === type ? ' is-active' : ''}`} onClick={() => setActiveType(type)}>
                  <ChevronRight className={expandedTypes.has(type) ? 'is-rotated' : ''} onClick={(event) => { event.stopPropagation(); toggleType(type); }} />
                  <span>{type}</span><b>{rows.length}</b>
                </button>
                {expandedTypes.has(type) ? rows.map((row) => (
                  <button className="comparison-type-child" key={row.key} onClick={() => { setActiveType(type); setActiveKey(row.key); }}>
                    {row.fullName}<i className={`comparison-dot-${row.status}`} />
                  </button>
                )) : null}
              </div>
            ))}
          </aside>

          <div className="comparison-main">
            <div className="comparison-list-actions">
              <label>
                <input type="checkbox" checked={visibleRows.some((row) => row.status !== 'missing-source') && visibleRows.filter((row) => row.status !== 'missing-source').every((row) => selectedKeys.has(row.key))} onChange={(event) => selectVisible(event.target.checked)} />
                <span>{selectedKeys.size + destructiveKeys.size} selected</span>
              </label>
              <button onClick={() => selectVisible(true)}>Select visible</button>
              <button onClick={() => selectVisible(false)}>Clear visible</button>
              <button onClick={exportResults}><Download /> Export results</button>
              <span>{visibleRows.length} items</span>
            </div>

            <div className="comparison-table-wrap">
              <table className="comparison-table">
                <thead><tr><th /><th>Name</th><th>Metadata type</th><th>Difference type</th></tr></thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.key} className={`${activeKey === row.key ? 'is-active' : ''}${selectedKeys.has(row.key) || destructiveKeys.has(row.key) ? ' is-selected' : ''}`} onClick={() => setActiveKey(row.key)}>
                      <td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedKeys.has(row.key) || destructiveKeys.has(row.key)} onChange={() => toggle(row.key)} aria-label={row.status === 'missing-source' ? `Delete ${row.fullName} from target` : `Select ${row.fullName}`} /></td>
                      <td><FileCode2 /><span>{row.fullName}</span></td>
                      <td>{row.type}</td>
                      <td><span className={statusClass(row.status)}><Circle />{STATUS_LABEL[row.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleRows.length ? <Empty title="No matching metadata" text="Try another type, status, or search term." /> : null}
            </div>

            <section className={`comparison-diff${diffFullscreen ? ' is-fullscreen' : ''}`}>
              <header className="comparison-diff-head">
                <div>
                  <FileCode2 />
                  <span><b>{activeRow?.fullName ?? 'Select a component'}</b><small>{activeRow?.type ?? 'Choose a row above to inspect it'}</small></span>
                </div>
                <div className="comparison-diff-actions">
                  <button className="btn btn-ghost btn-icon" onClick={() => moveActive(-1)} disabled={!visibleRows.length} title="Previous component"><ChevronRight className="is-back" /></button>
                  <span>{Math.max(0, visibleRows.findIndex((row) => row.key === activeKey) + 1)} / {visibleRows.length}</span>
                  <button className="btn btn-ghost btn-icon" onClick={() => moveActive(1)} disabled={!visibleRows.length} title="Next component"><ChevronRight /></button>
                  <button className="btn btn-ghost btn-icon" onClick={() => setDiffFullscreen((value) => !value)} title={diffFullscreen ? 'Exit full screen' : 'View full screen'}>
                    {diffFullscreen ? <Minimize2 /> : <Maximize2 />}
                  </button>
                  {activeRow ? <span className={statusClass(activeRow.status)}><Circle />{STATUS_LABEL[activeRow.status]}</span> : null}
                </div>
              </header>
              {diffLoading ? (
                <div className="comparison-diff-message"><LoaderCircle className="spin" /> Loading source and target…</div>
              ) : activeRow?.status === 'identical' ? (
                <div className="comparison-diff-message"><Check /> The source and target versions are identical.</div>
              ) : activeFile?.binary || activeFile?.tooLarge ? (
                <div className="comparison-diff-message">This file is binary or too large for an inline preview.</div>
              ) : activeFile ? (
                <>
                  <div className="comparison-filebar">
                    <ChevronDown />
                    {diff && diff.files.length > 1 ? (
                      <SelectMenu
                        compact
                        value={String(activeFileIndex)}
                        onChange={(value) => setActiveFileIndex(Number(value))}
                        ariaLabel="Compared file"
                        options={diff.files.map((file, index) => ({ value: String(index), label: file.file }))}
                      />
                    ) : activeFile.file}
                    {diff && diff.files.length > 1 ? <span>{activeFileIndex + 1} of {diff.files.length} files</span> : null}
                  </div>
                  <div className="comparison-code-grid">
                    <CodePane label="Source" org={compare.sourceOrg} text={activeFile.sourceText} side="source" lines={activeFile.diff} />
                    <CodePane label="Target" org={compare.targetOrg} text={activeFile.targetText} side="target" lines={activeFile.diff} />
                  </div>
                </>
              ) : (
                <div className="comparison-diff-message">Select a changed, new, or deleted component to preview its contents.</div>
              )}
            </section>
          </div>
        </div>
      </section>

      <div className="comparison-footer">
        <button className="btn" onClick={onBack}><ArrowLeft /> Back to metadata</button>
        <button className="comparison-selected-toggle" onClick={() => setSelectedTrayOpen((value) => !value)}>
          {selectedKeys.size + destructiveKeys.size} component{selectedKeys.size + destructiveKeys.size === 1 ? '' : 's'} selected <ChevronDown className={selectedTrayOpen ? 'is-rotated' : ''} />
        </button>
        <button className="btn btn-primary" disabled={!selectedKeys.size && !destructiveKeys.size} onClick={onNext}>Deployment settings <ArrowRight /></button>
      </div>
      {selectedTrayOpen ? (
        <section className="comparison-selected-tray">
          <header><b>Selected items</b><span>{selectedRows.length}</span></header>
          <div>
            {selectedRows.map((row) => (
              <button key={row.key} onClick={() => setActiveKey(row.key)}>
                <FileCode2 /><span><b>{row.fullName}</b><small>{row.type}</small></span>
                <span className={statusClass(row.status)}><Circle />{STATUS_LABEL[row.status]}</span>
                <span className="comparison-remove" onClick={(event) => { event.stopPropagation(); toggle(row.key); }}>×</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
