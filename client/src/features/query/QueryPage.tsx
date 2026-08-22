import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Database, Download, LoaderCircle, Play, Trash2 } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useHotkey, useLocalStorage } from '../../lib/hooks';
import { fuzzyScore } from '../../lib/fuzzy';
import { cellValue, downloadCsv, toTsv } from '../../lib/format';
import { Empty, Pagination, Panel, PanelHead } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import type { SalesforceField } from '../../types';

const DEFAULT_QUERY = 'SELECT Id, Name\nFROM Account\nORDER BY CreatedDate DESC\nLIMIT 100';
const MAX_SUGGESTIONS = 10;
const EDITOR_MAX_HEIGHT = 320;
/**
 * Salesforce's default query API page size. Not configurable by this app, so the "batch"
 * count shown after a query completes is a deterministic estimate, not a live measurement —
 * the CLI runs the whole query as one blocking call and reports no incremental progress.
 */
const QUERY_BATCH_SIZE = 2000;

export default function QueryPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  const editor = useRef<HTMLTextAreaElement>(null);
  const editorWrap = useRef<HTMLDivElement>(null);

  const [soql, setSoql] = useLocalStorage('sf-soql-draft', DEFAULT_QUERY);
  const [tooling, setTooling] = useState(false);
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [queryRunning, setQueryRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [queryDurationMs, setQueryDurationMs] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [selected, setSelected] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  // A click anywhere outside the editor (or its suggestion dropdown) dismisses suggestions;
  // previously only choosing a suggestion or pressing Escape did.
  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      if (editorWrap.current && !editorWrap.current.contains(event.target as Node)) setSuggestions([]);
    }
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, []);

  // Grows the editor to fit the query (up to a cap, then it scrolls) instead of a tall,
  // mostly-empty box by default.
  useEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, EDITOR_MAX_HEIGHT)}px`;
  }, [soql]);

  const objectName = soql.match(/\bFROM\s+([A-Za-z][A-Za-z0-9_]*)/i)?.[1] || '';

  const objects = useResource<{ objects: string[] }>(
    orgKey(orgId, 'objects', tooling ? 'tooling' : 'all'),
    (signal) => api(`${orgPath(orgId)}/objects?category=all&tooling=${tooling}`, { signal }),
    { ttl: 600_000 },
  );
  const describe = useResource<{ describe: { fields?: SalesforceField[] } }>(
    objectName ? orgKey(orgId, 'describe', objectName, tooling) : null,
    (signal) => api(`${orgPath(orgId)}/objects/${objectName}?tooling=${tooling}`, { signal }),
    { ttl: 600_000 },
  );

  const objectNames = Array.isArray(objects.data?.objects) ? objects.data!.objects : [];
  const fields = describe.data?.describe?.fields ?? [];
  const fieldTypes = useMemo(() => new Map(fields.map((field) => [field.name, field.type])), [fields]);

  function updateSuggestions(value: string, position: number) {
    setCursor(position);
    const before = value.slice(0, position);
    const fromMatch = before.match(/\bFROM\s+([A-Za-z0-9_]*)$/i);
    const token = before.match(/[A-Za-z0-9_]*$/)?.[0] || '';
    if (!fromMatch && !objectName) return setSuggestions([]);
    const source = fromMatch ? objectNames : fields.map((field) => field.name);
    const needle = fromMatch ? fromMatch[1] : token;
    const ranked = source
      .map((name) => ({ name, score: fuzzyScore(name, needle) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, MAX_SUGGESTIONS)
      .map((entry) => entry.name);
    setSuggestions(ranked);
    setActiveSuggestion(0);
  }

  function chooseSuggestion(name: string) {
    const before = soql.slice(0, cursor);
    const after = soql.slice(cursor);
    const start = before.search(/[A-Za-z0-9_]*$/);
    setSoql(before.slice(0, start) + name + after);
    setSuggestions([]);
    const caret = start + name.length;
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      return void run();
    }
    // Tab straight after SELECT expands every field on the FROM object.
    if (event.key === 'Tab' && /^\s*SELECT\s*$/i.test(soql.slice(0, event.currentTarget.selectionStart)) && fields.length) {
      event.preventDefault();
      const names = fields.map((field) => field.name).join(', ');
      const position = event.currentTarget.selectionStart;
      setSoql(soql.slice(0, position) + ' ' + names + soql.slice(position));
      setSuggestions([]);
      const caret = position + names.length + 1;
      requestAnimationFrame(() => editor.current?.setSelectionRange(caret, caret));
      return;
    }
    if (!suggestions.length || !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') setActiveSuggestion((current) => (current + 1) % suggestions.length);
    if (event.key === 'ArrowUp') setActiveSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
    if (event.key === 'Enter') chooseSuggestion(suggestions[activeSuggestion]);
    if (event.key === 'Escape') setSuggestions([]);
  }

  async function run() {
    if (busy || !soql.trim()) return;
    setBusy(true);
    setQueryRunning(true);
    setSelected([]);
    setPage(1);
    setQueryDurationMs(null);
    setElapsedMs(0);
    const startedAt = Date.now();
    // The CLI runs the whole query as one blocking call, so there is no real per-batch
    // progress to report while it's in flight — an honest elapsed timer is what we can show.
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    try {
      const response = await api('/query', { method: 'POST', body: JSON.stringify({ org: orgId, query: soql, tooling }) });
      setResult(response);
      setQueryDurationMs(Date.now() - startedAt);
    } catch (error) {
      toast.error(error);
    } finally {
      window.clearInterval(timer);
      setQueryRunning(false);
      setBusy(false);
    }
  }

  useHotkey('Enter', run, { meta: true, allowInInput: true });

  const records: any[] = result?.records ?? [];
  const columns = useMemo(
    () => (records[0] ? Object.keys(records[0]).filter((key) => key !== 'attributes') : []),
    [records],
  );
  const visible = records.slice((page - 1) * size, page * size);
  const deletePhrase = `DELETE ${selected.length} RECORDS FROM ${objectName}`;

  const resultDescription = useMemo(() => {
    if (!result) return '';
    const total = result.totalSize ?? records.length;
    const batches = Math.max(1, Math.ceil(total / QUERY_BATCH_SIZE));
    const parts = [
      `${total.toLocaleString()} record${total === 1 ? '' : 's'}`,
      `~${batches} batch${batches === 1 ? '' : 'es'} (up to ${QUERY_BATCH_SIZE.toLocaleString()} each)`,
      `${selected.length} selected`,
    ];
    if (queryDurationMs != null) parts.push(`fetched in ${(queryDurationMs / 1000).toFixed(2)}s`);
    return parts.join(' · ');
  }, [result, records.length, selected.length, queryDurationMs]);

  async function copyRows() {
    const rows = selected.length ? records.filter((record) => selected.includes(record.Id)) : records;
    await navigator.clipboard.writeText(toTsv(rows, columns));
    toast.success('Copied for Excel', `${rows.length} rows as tab-separated values`);
  }

  async function deleteRecords() {
    setBusy(true);
    try {
      const response = await api<{ deleted: string[]; failed: { id: string; error: string }[] }>('/data/records/delete', {
        method: 'POST',
        body: JSON.stringify({ org: orgId, sobject: objectName, recordIds: selected, confirmation, tooling }),
      });
      const gone = new Set(response.deleted);
      setResult({
        ...result,
        records: records.filter((record) => !gone.has(record.Id)),
        totalSize: (result.totalSize || records.length) - gone.size,
      });
      setSelected([]);
      setConfirmDelete(false);
      setConfirmation('');
      if (response.failed.length) {
        toast.error(`${response.failed.length} record(s) could not be deleted`, response.failed[0]?.error);
      } else {
        toast.success(`${response.deleted.length} record(s) deleted`, objectName);
      }
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Panel>
        <PanelHead
          title="SOQL editor"
          description="Schema-aware completion. Press Tab straight after SELECT to expand every field on the FROM object."
        >
          <label className="toggle" title="Run this query through the Salesforce Tooling API">
            <input
              type="checkbox"
              checked={tooling}
              disabled={busy}
              onChange={(event) => {
                setTooling(event.target.checked);
                setResult(undefined);
                setSuggestions([]);
                setSelected([]);
              }}
            />
            Tooling API
          </label>
          <span className="hint-inline">
            <span className="kbd">⌘↵</span> run
          </span>
          <button className="btn btn-primary" onClick={run} disabled={busy || !soql.trim()}>
            {busy ? <LoaderCircle className="spin" /> : <Play />} Run query
          </button>
        </PanelHead>
        <div className="panel-body">
          <div className="editor-wrap" ref={editorWrap}>
            <textarea
              ref={editor}
              className="editor editor-auto"
              value={soql}
              rows={1}
              spellCheck={false}
              aria-label="SOQL query"
              onChange={(event) => {
                setSoql(event.target.value);
                updateSuggestions(event.target.value, event.target.selectionStart);
              }}
              onClick={(event) => updateSuggestions(soql, event.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
            />
            {suggestions.length ? (
              <div className="suggestions">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    className={index === activeSuggestion ? 'is-active' : ''}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseSuggestion(suggestion);
                    }}
                  >
                    <span>{suggestion}</span>
                    <small>{fieldTypes.get(suggestion) ?? 'SObject'}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="editor-status">
            {objectName ? (
              <span>
                <Check /> Schema loaded: <b className="mono">{objectName}</b> · {fields.length} fields
                {describe.loading ? ' · refreshing' : ''}
              </span>
            ) : (
              <span>Type FROM to browse Salesforce objects</span>
            )}
            <span>{tooling ? 'Tooling API' : 'Standard API'}</span>
          </div>
          {queryRunning ? (
            <div className="loading loading-inline">
              <LoaderCircle className="spin" /> Fetching records from Salesforce… {(elapsedMs / 1000).toFixed(1)}s elapsed
            </div>
          ) : null}
        </div>
      </Panel>

      {result ? (
        <Panel className="workspace-panel query-results-panel">
          <PanelHead title="Query results" description={resultDescription}>
            <button className="btn" onClick={copyRows} disabled={!records.length}>
              <Copy /> Copy {selected.length ? 'selected' : 'all'}
            </button>
            <button className="btn" onClick={() => downloadCsv(records, 'salesforce-query.csv')} disabled={!records.length}>
              <Download /> CSV
            </button>
            <button
              className="btn btn-destructive"
              disabled={!selected.length || !objectName}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete selected
            </button>
          </PanelHead>
          <div className="panel-body">
            {records.length ? (
              <>
                <div className="table-wrap workspace-data-region">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="cell-check">
                          <input
                            type="checkbox"
                            aria-label="Select all rows on this page"
                            checked={visible.length > 0 && visible.every((record) => selected.includes(record.Id))}
                            onChange={() => {
                              const ids = visible.map((record) => record.Id).filter(Boolean);
                              setSelected((current) =>
                                ids.every((id: string) => current.includes(id))
                                  ? current.filter((id) => !ids.includes(id))
                                  : [...new Set([...current, ...ids])],
                              );
                            }}
                          />
                        </th>
                        {columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((record, index) => (
                        <tr key={record.Id || index} className={record.Id && selected.includes(record.Id) ? 'is-selected' : ''}>
                          <td className="cell-check">
                            <input
                              type="checkbox"
                              aria-label="Select row"
                              disabled={!record.Id}
                              checked={!!record.Id && selected.includes(record.Id)}
                              onChange={() =>
                                record.Id &&
                                setSelected((current) =>
                                  current.includes(record.Id)
                                    ? current.filter((id) => id !== record.Id)
                                    : [...current, record.Id],
                                )
                              }
                            />
                          </td>
                          {columns.map((column) => (
                            <td key={column} title={cellValue(record[column])} className={column === 'Id' ? 'cell-mono' : ''}>
                              {cellValue(record[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination total={records.length} page={page} size={size} onPage={setPage} onSize={setSize} />
              </>
            ) : (
              <Empty icon={Database} title="No records" text="The query completed without returning records." />
            )}
          </div>
        </Panel>
      ) : (
        <div className="hint">
          <Database style={{ width: 12, height: 12 }} /> Results appear here. Queries are read-only; deleting rows requires
          a typed confirmation.
        </div>
      )}

      {confirmDelete ? (
        <ConfirmDialog
          icon={Trash2}
          title={
            <>
              Delete {selected.length} {objectName} record(s)
            </>
          }
          phrase={deletePhrase}
          description="This changes the Salesforce org and may trigger automation. Type the confirmation exactly:"
          confirmLabel={
            <>
              <Trash2 /> Delete records
            </>
          }
          value={confirmation}
          onChange={setConfirmation}
          onConfirm={deleteRecords}
          onClose={() => setConfirmDelete(false)}
          busy={busy}
        />
      ) : null}
    </>
  );
}
