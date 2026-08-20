import { useState } from 'react';
import { FlaskConical, LoaderCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppState } from '../../app/state';
import { Badge, CodeBlock, Field, Loading, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { SelectMenu } from '../../ui/SelectMenu';

const LEVELS = ['RunLocalTests', 'RunAllTestsInOrg', 'RunSpecifiedTests'] as const;

export default function TestsPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('RunLocalTests');
  const [tests, setTests] = useState('');
  const [coverage, setCoverage] = useState(true);
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const response = await api('/tests', {
        method: 'POST',
        body: JSON.stringify({
          org: orgId,
          testLevel: level,
          tests: tests.split(',').map((value) => value.trim()).filter(Boolean),
          coverage,
        }),
      });
      setResult(response);
      toast.success('Test run complete');
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  const summary = result?.summary ?? {};

  return (
    <Panel>
      <PanelHead title="Apex test runner" description="Run tests and collect code coverage from the active org.">
        <button className="btn btn-primary" disabled={busy} onClick={run}>
          {busy ? <LoaderCircle className="spin" /> : <FlaskConical />} Run tests
        </button>
      </PanelHead>
      <div className="panel-body">
        <div className="form-row">
          <Field label="Test level">
            <SelectMenu
              value={level}
              onChange={(value) => setLevel(value as typeof level)}
              ariaLabel="Apex test level"
              options={[
                { value: 'RunLocalTests', label: 'Run local tests', description: 'Exclude tests from installed packages' },
                { value: 'RunAllTestsInOrg', label: 'Run all tests in org', description: 'Include managed-package tests' },
                { value: 'RunSpecifiedTests', label: 'Run specified tests', description: 'Choose test classes explicitly' },
              ]}
            />
          </Field>
          {level === 'RunSpecifiedTests' ? (
            <Field label="Test classes" hint="Comma separated">
              <input
                className="input input-mono"
                value={tests}
                onChange={(event) => setTests(event.target.value)}
                placeholder="AccountServiceTest, QuoteServiceTest"
                spellCheck={false}
              />
            </Field>
          ) : null}
          <Field label="Coverage">
            <label className="toggle">
              <input type="checkbox" checked={coverage} onChange={(event) => setCoverage(event.target.checked)} />
              Collect code coverage
            </label>
          </Field>
        </div>

        {busy ? <Loading label="Tests are running. This can take several minutes…" /> : null}

        {result && !busy ? (
          <div className="result">
            <div className="result-head">
              <Badge tone={Number(summary.failing) > 0 ? 'danger' : 'success'}>
                {summary.outcome || (Number(summary.failing) > 0 ? 'Failed' : 'Passed')}
              </Badge>
              {summary.testsRan !== undefined ? (
                <span className="result-note">
                  {summary.passing ?? 0} passed · {summary.failing ?? 0} failed · {summary.skipped ?? 0} skipped
                  {summary.testRunCoverage ? ` · ${summary.testRunCoverage} coverage` : ''}
                  {summary.testTotalTime ? ` · ${summary.testTotalTime}` : ''}
                </span>
              ) : null}
            </div>
            <CodeBlock>{JSON.stringify(result, null, 2)}</CodeBlock>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
