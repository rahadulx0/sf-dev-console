import { ArrowLeft, LoaderCircle, Rocket, ShieldCheck } from 'lucide-react';
import { Badge, Callout, Field } from '../../ui/primitives';
import type { CompareResult, TestLevel } from '../../types';

const TEST_LEVELS: { value: TestLevel; label: string }[] = [
  { value: 'NoTestRun', label: 'No test run' },
  { value: 'RunSpecifiedTests', label: 'Run specified tests' },
  { value: 'RunLocalTests', label: 'Run local tests' },
  { value: 'RunAllTestsInOrg', label: 'Run all tests in org' },
];

export function DeploySettingsStep({
  compare,
  selectedCount,
  selectedTypes,
  mode,
  setMode,
  testLevel,
  setTestLevel,
  testsInput,
  setTestsInput,
  confirmation,
  setConfirmation,
  busy,
  onBack,
  onExecute,
}: {
  compare: CompareResult;
  selectedCount: number;
  selectedTypes: string[];
  mode: 'validate' | 'deploy';
  setMode: (mode: 'validate' | 'deploy') => void;
  testLevel: TestLevel;
  setTestLevel: (level: TestLevel) => void;
  testsInput: string;
  setTestsInput: (value: string) => void;
  confirmation: string;
  setConfirmation: (value: string) => void;
  busy: boolean;
  onBack: () => void;
  onExecute: () => void;
}) {
  const phrase = `${mode === 'deploy' ? 'DEPLOY' : 'VALIDATE'} ${compare.targetOrg}`;

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Deployment review</h3>
            <p>Confirm the scope before choosing how to run it.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="detail-grid">
            <div>
              <span>Source org</span>
              <b>{compare.sourceOrg}</b>
            </div>
            <div>
              <span>Target org</span>
              <b>{compare.targetOrg}</b>
            </div>
            <div>
              <span>Selected components</span>
              <b>{selectedCount}</b>
            </div>
            <div>
              <span>Metadata types</span>
              <b>{selectedTypes.length}</b>
            </div>
          </div>
          <div className="hint" style={{ marginTop: 'var(--s-4)' }}>
            {selectedTypes.map((type) => (
              <Badge key={type}>{type}</Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Mode</h3>
            <p>Validation never commits anything to the target org. Deployment does.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="action-row" style={{ marginTop: 0 }}>
            <button className={`btn${mode === 'validate' ? ' btn-primary' : ''}`} onClick={() => setMode('validate')}>
              <ShieldCheck /> Validate only
            </button>
            <button className={`btn${mode === 'deploy' ? ' btn-danger' : ' btn-destructive'}`} onClick={() => setMode('deploy')}>
              <Rocket /> Deploy for real
            </button>
          </div>

          <div className="form-row" style={{ marginTop: 'var(--s-5)' }}>
            <Field label="Apex test level">
              <select className="select" value={testLevel} onChange={(event) => setTestLevel(event.target.value as TestLevel)}>
                {TEST_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </Field>
            {testLevel === 'RunSpecifiedTests' ? (
              <Field label="Apex test classes" hint="Comma or space separated class names">
                <input
                  className="input input-mono"
                  value={testsInput}
                  onChange={(event) => setTestsInput(event.target.value)}
                  placeholder="MyClassTest, OtherClassTest"
                  spellCheck={false}
                />
              </Field>
            ) : null}
          </div>

          {mode === 'deploy' ? (
            <div className="danger-zone">
              <div>
                <b>Deploy to {compare.targetOrg}</b>
                <small>
                  Type <code>{phrase}</code> to enable this deployment.
                </small>
              </div>
              <input
                className="input input-mono"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={phrase}
                spellCheck={false}
              />
              <button className="btn btn-danger" disabled={busy || confirmation !== phrase} onClick={onExecute}>
                {busy ? <LoaderCircle className="spin" /> : <Rocket />} Deploy metadata
              </button>
            </div>
          ) : (
            <Callout icon={ShieldCheck} tone="accent" title="Validation is non-mutating">
              This submits a check-only deployment to Salesforce. Nothing is saved to {compare.targetOrg}.
              <div className="action-row">
                <button className="btn btn-primary" disabled={busy} onClick={onExecute}>
                  {busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} Run validation
                </button>
              </div>
            </Callout>
          )}
        </div>
      </section>

      <div className="action-row">
        <button className="btn" onClick={onBack} disabled={busy}>
          <ArrowLeft /> Back to review
        </button>
      </div>
    </div>
  );
}
