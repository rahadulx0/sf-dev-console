import { useState } from 'react';
import { Check, Code2, LoaderCircle, Play, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppState } from '../../app/state';
import { useHotkey, useLocalStorage } from '../../lib/hooks';
import { Badge, CodeBlock, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const SAMPLE = `Account a = new Account(Name = 'Created from SF Dev Console');
insert a;
System.debug('Created account: ' + a.Id);`;

export default function ApexPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  // The draft survives navigation, which the single-file version lost on every page change.
  const [code, setCode] = useLocalStorage('sf-apex-draft', SAMPLE);
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy || !code.trim()) return;
    setBusy(true);
    try {
      const response = await api('/apex/execute', { method: 'POST', body: JSON.stringify({ org: orgId, code }) });
      setResult(response);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  useHotkey('Enter', run, { meta: true, allowInInput: true });

  const failed = result && (result.success === false || result.compiled === false);

  return (
    <Panel>
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
              {result.exceptionMessage ? <span className="result-note">{result.exceptionMessage}</span> : null}
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
  );
}
