import { useState } from 'react';
import { LoaderCircle, Rocket, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppState } from '../../app/state';
import { useLocalStorage } from '../../lib/hooks';
import { trackDeploy } from '../../lib/jobs';
import { Badge, Callout, CodeBlock, Field, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const TEST_LEVELS = ['RunLocalTests', 'RunAllTestsInOrg', 'NoTestRun'] as const;

export default function DeployPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  const [project, setProject] = useLocalStorage('sf-project-path', '');
  const [source, setSource] = useLocalStorage('sf-source-path', 'force-app');
  const [testLevel, setTestLevel] = useState<(typeof TEST_LEVELS)[number]>('RunLocalTests');
  const [confirmation, setConfirmation] = useState('');
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<unknown>();
  const [busy, setBusy] = useState('');

  const deployPhrase = `DEPLOY ${orgId}`;
  const quickPhrase = `QUICK DEPLOY ${jobId}`;

  async function run(kind: 'preview' | 'validate' | 'start') {
    setBusy(kind);
    setResult(undefined);
    try {
      const response = await api<any>(`/deploy/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ org: orgId, projectPath: project, sourcePath: source, testLevel, confirmation }),
      });
      setResult(response);
      const id = response?.id || response?.jobId || response?.response?.id;
      if (id) {
        setJobId(id);
        if (kind === 'start') {
          trackDeploy({ id, org: orgId, label: 'Deploy' });
          toast.success('Deployment started', `Job ${id}`);
        }
      }
      if (kind === 'validate') toast.success('Validation submitted', typeof id === 'string' ? `Job ${id}` : undefined);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy('');
    }
  }

  async function job(kind: 'report' | 'quick' | 'cancel') {
    setBusy(kind);
    try {
      const response =
        kind === 'report'
          ? await api<any>(`/deploy/${encodeURIComponent(orgId)}/${jobId}`)
          : await api<any>(`/deploy/${kind}`, {
              method: 'POST',
              body: JSON.stringify({ org: orgId, jobId, confirmation }),
            });
      setResult(response);
      if (kind === 'quick') {
        trackDeploy({ id: jobId, org: orgId, label: 'Quick deploy' });
        toast.success('Quick deploy submitted', `Job ${jobId}`);
      }
      if (kind === 'cancel') toast.info('Cancellation requested', `Job ${jobId}`);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy('');
    }
  }

  return (
    <Panel>
      <PanelHead
        title="Deployment workbench"
        description="Preview, validate, deploy, and monitor metadata from a local Salesforce project."
      >
        <Badge tone="danger">Org mutation</Badge>
      </PanelHead>
      <div className="panel-body">
        <Callout icon={ShieldCheck} tone="accent" title="Guarded deployment workflow">
          Paths must stay inside a valid Salesforce project. Deployments and quick deploys require an exact typed
          confirmation, which the server re-checks before running anything.
        </Callout>

        <div className="form-row" style={{ marginTop: 'var(--s-4)' }}>
          <Field label="Salesforce project path" hint="Directory containing sfdx-project.json">
            <input
              className="input input-mono"
              value={project}
              onChange={(event) => setProject(event.target.value)}
              placeholder="/Users/me/projects/salesforce-app"
              spellCheck={false}
            />
          </Field>
          <Field label="Source path inside project">
            <input
              className="input input-mono"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="force-app"
              spellCheck={false}
            />
          </Field>
          <Field label="Test level">
            <select className="select" value={testLevel} onChange={(event) => setTestLevel(event.target.value as typeof testLevel)}>
              {TEST_LEVELS.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="action-row">
          <button className="btn" disabled={!!busy || !project} onClick={() => run('preview')}>
            {busy === 'preview' ? <LoaderCircle className="spin" /> : <Search />} Preview
          </button>
          <button className="btn" disabled={!!busy || !project} onClick={() => run('validate')}>
            {busy === 'validate' ? <LoaderCircle className="spin" /> : <ShieldCheck />} Validate only
          </button>
        </div>

        <div className="danger-zone">
          <div>
            <b>Deploy to {orgId}</b>
            <small>
              Type <code>{deployPhrase}</code> to enable an asynchronous deployment.
            </small>
          </div>
          <input
            className="input input-mono"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={deployPhrase}
            spellCheck={false}
          />
          <button
            className="btn btn-danger"
            disabled={!!busy || !project || confirmation !== deployPhrase}
            onClick={() => run('start')}
          >
            {busy === 'start' ? <LoaderCircle className="spin" /> : <Rocket />} Deploy metadata
          </button>
        </div>

        <div className="job-tools">
          <Field label="Deployment job ID">
            <input
              className="input input-mono"
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              placeholder="0Af…"
              spellCheck={false}
            />
          </Field>
          <button className="btn" disabled={!jobId || !!busy} onClick={() => job('report')}>
            {busy === 'report' ? <LoaderCircle className="spin" /> : null} Check status
          </button>
          <button className="btn btn-destructive" disabled={!jobId || !!busy} onClick={() => job('cancel')}>
            Cancel deployment
          </button>
        </div>

        <div className="quick-zone">
          <small>
            To promote a successful validation, type <code>{jobId ? quickPhrase : 'QUICK DEPLOY 0Af…'}</code> in the
            confirmation field above.
          </small>
          <button
            className="btn"
            disabled={!jobId || confirmation !== quickPhrase || !!busy}
            onClick={() => job('quick')}
          >
            {busy === 'quick' ? <LoaderCircle className="spin" /> : null} Quick deploy validated job
          </button>
        </div>

        {result ? (
          <div className="result">
            <div className="result-head">
              <Badge tone="accent">Result</Badge>
            </div>
            <CodeBlock>{JSON.stringify(result, null, 2)}</CodeBlock>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
