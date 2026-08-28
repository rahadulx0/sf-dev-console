import type { ReactNode } from 'react';
import { ArrowLeft, LoaderCircle, Rocket, Search, ShieldCheck } from 'lucide-react';
import { Badge, Callout, CodeBlock, Field } from '../../ui/primitives';
import type { CompareResult, TestLevel } from '../../types';
import { SelectMenu } from '../../ui/SelectMenu';

const TEST_LEVELS: { value: TestLevel; label: string }[] = [
  { value: 'NoTestRun', label: 'No test run (deploy only)' },
  { value: 'RunSpecifiedTests', label: 'Run specified tests' },
  { value: 'RunLocalTests', label: 'Run local tests' },
  { value: 'RunAllTestsInOrg', label: 'Run all tests in org' },
];

export function DeploySettingsStep({
  compare,
  selectedCount,
  destructiveCount,
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
  previewBusy,
  preview,
  onPreview,
  onBack,
  onExecute,
  children,
}: {
  compare: CompareResult;
  selectedCount: number;
  destructiveCount: number;
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
  previewBusy: boolean;
  preview: any;
  onPreview: () => void;
  onBack: () => void;
  onExecute: () => void;
  children?: ReactNode;
}) {
  const phrase = `${mode === 'deploy' ? 'DEPLOY' : 'VALIDATE'} ${compare.targetOrg}`;

  return (
    <div className="page-stack deploy-settings-page">
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
            <div>
              <span>Explicit deletions</span>
              <b className={destructiveCount ? 'text-danger' : ''}>{destructiveCount}</b>
            </div>
          </div>
          <div className="hint mt-4">
            {selectedTypes.map((type) => (
              <Badge key={type}>{type}</Badge>
            ))}
          </div>
        </div>
      </section>

      {children}

      {selectedCount ? <section className="panel">
        <div className="panel-head">
          <div><h3>Prepared package preview</h3><p>Inspect the exact regular and destructive manifests that will be submitted to Salesforce.</p></div>
          <button className="btn" onClick={onPreview} disabled={busy || previewBusy}>
            {previewBusy ? <LoaderCircle className="spin" /> : <Search />} {preview ? 'Refresh preview' : 'Run preview'}
          </button>
        </div>
        {preview ? <div className="panel-body"><CodeBlock>{JSON.stringify(preview, null, 2)}</CodeBlock></div> : null}
      </section> : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Mode</h3>
            <p>Validation never commits anything to the target org. Deployment does.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="action-row mt-0">
            <button className={`btn${mode === 'validate' ? ' btn-primary' : ''}`} onClick={() => setMode('validate')}>
              <ShieldCheck /> Validate only
            </button>
            <button className={`btn${mode === 'deploy' ? ' btn-danger' : ' btn-destructive'}`} onClick={() => setMode('deploy')}>
              <Rocket /> Deploy for real
            </button>
          </div>

          <div className="form-row mt-5">
            <Field label="Apex test level">
              <SelectMenu
                value={testLevel}
                onChange={(value) => setTestLevel(value as TestLevel)}
                ariaLabel="Deployment Apex test level"
                options={TEST_LEVELS.map((level) => ({
                  value: level.value,
                  label: level.label,
                  disabled: mode === 'validate' && level.value === 'NoTestRun',
                }))}
              />
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
                  {destructiveCount ? `This deployment will delete ${destructiveCount} target component${destructiveCount === 1 ? '' : 's'}. ` : ''}
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
