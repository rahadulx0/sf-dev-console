import { useState } from 'react';
import { AlertTriangle, Check, Code2, Copy, LoaderCircle, Play, X } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAppState } from '../../app/state';
import { useHotkey, useLocalStorage } from '../../lib/hooks';
import { Badge, CodeBlock, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { Modal } from '../../ui/Modal';

const SAMPLE = `Account a = new Account(Name = 'Created from SF Dev Console');
insert a;
System.debug('Created account: ' + a.Id);`;

function cleanMessage(value: string) {
  return value.replaceAll(/\u001b\[[0-9;]*m/g, '').replace(/^Error \(\d+\):\s*/i, '').trim();
}

function conciseMessage(value: string) {
  const lines = cleanMessage(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const useful = lines.find((line) => !/^at\s|^\w*Error:\s*$|^stack trace/i.test(line)) || 'Salesforce could not execute the Apex code.';
  return useful.length > 220 ? `${useful.slice(0, 217)}…` : useful;
}

function responseError(response: any) {
  const parts = [
    response?.compileProblem,
    response?.exceptionMessage,
    response?.exceptionStackTrace,
    response?.logs,
    JSON.stringify(response, null, 2),
  ].filter((value, index, values) => typeof value === 'string' && value.trim() && values.indexOf(value) === index);
  return cleanMessage(parts.join('\n\n'));
}

export default function ApexPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  // The draft survives navigation, which the single-file version lost on every page change.
  const [code, setCode] = useLocalStorage('sf-apex-draft', SAMPLE);
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [fullError, setFullError] = useState('');

  function showError(summary: string, full: string) {
    toast.error('Anonymous Apex failed', conciseMessage(summary), { label: 'View full message', run: () => setFullError(full) });
  }

  async function run() {
    if (busy || !code.trim()) return;
    setBusy(true);
    try {
      const response = await api('/apex/execute', { method: 'POST', body: JSON.stringify({ org: orgId, code }) });
      setResult(response);
      if (response?.success === false || response?.compiled === false) {
        const full = responseError(response);
        showError(response?.compileProblem || response?.exceptionMessage || full, full);
      }
    } catch (error) {
      const full = error instanceof ApiError
        ? cleanMessage([error.message, error.details].filter(Boolean).join('\n\n'))
        : cleanMessage(errorMessage(error));
      showError(error instanceof ApiError && error.message ? error.message : full, full);
    } finally {
      setBusy(false);
    }
  }

  useHotkey('Enter', run, { meta: true, allowInInput: true });

  const failed = result && (result.success === false || result.compiled === false);

  return (
    <>
    <Panel className={`workspace-panel apex-workspace${result ? ' has-result' : ''}`}>
      <PanelHead title="Anonymous Apex" description="Execute an Apex script through the local Salesforce CLI.">
        <span className="hint-inline">
          <span className="kbd">⌘↵</span> run
        </span>
        <button className="btn btn-primary" onClick={run} disabled={busy || !code.trim()}>
          {busy ? <LoaderCircle className="spin" /> : <Play />} Execute
        </button>
      </PanelHead>
      <div className="panel-body">
        <textarea
          className="editor"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
          rows={14}
          aria-label="Anonymous Apex"
        />

        {result ? (
          <div className="result">
            <div className="result-head">
              <Badge tone={failed ? 'danger' : 'success'}>
                {failed ? <X /> : <Check />}
                {failed ? 'Failed' : 'Success'}
              </Badge>
              {result.exceptionMessage || result.compileProblem ? (
                <button className="btn btn-link result-note" onClick={() => setFullError(responseError(result))}>
                  {conciseMessage(result.exceptionMessage || result.compileProblem)} · View full message
                </button>
              ) : null}
            </div>
            <CodeBlock>{typeof result.logs === 'string' && result.logs ? result.logs : JSON.stringify(result, null, 2)}</CodeBlock>
          </div>
        ) : (
          <p className="hint">
            <Code2 style={{ width: 12, height: 12 }} /> Output and debug logs appear here after execution. This runs
            against <b>{orgId}</b> and can change org data.
          </p>
        )}
      </div>
    </Panel>
    {fullError ? (
      <Modal
        icon={AlertTriangle}
        title="Anonymous Apex error details"
        wide
        onClose={() => setFullError('')}
        footer={
          <button className="btn" onClick={() => void navigator.clipboard.writeText(fullError)}>
            <Copy /> Copy full message
          </button>
        }
      >
        <p className="apex-error-summary">{conciseMessage(fullError)}</p>
        <CodeBlock>{fullError}</CodeBlock>
      </Modal>
    ) : null}
    </>
  );
}
