import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { invalidate } from '../../lib/resource';
import { useAppState } from '../../app/state';
import { useLocalStorage } from '../../lib/hooks';
import { useToast } from '../../ui/Toast';
import type { CompareResult, OrgDeployRecord, Selection, TestLevel } from '../../types';
import { SelectOrgsStep } from './SelectOrgsStep';
import { SelectMetadataStep } from './SelectMetadataStep';
import { CompareReviewStep } from './CompareReviewStep';
import { DeploySettingsStep } from './DeploySettingsStep';
import { ExecuteResultStep } from './ExecuteResultStep';
import { HistoryPanel } from './HistoryPanel';

type StepKey = 'orgs' | 'metadata' | 'review' | 'settings' | 'result';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'orgs', label: '1 · Orgs' },
  { key: 'metadata', label: '2 · Metadata' },
  { key: 'review', label: '3 · Compare & review' },
  { key: 'settings', label: '4 · Settings' },
  { key: 'result', label: '5 · Execute & results' },
];

export default function OrgDeployPage() {
  const { orgs } = useAppState();
  const toast = useToast();

  const [step, setStep] = useState<StepKey>('orgs');
  const [sourceOrg, setSourceOrg] = useLocalStorage('sf-org-deploy-source', '');
  const [targetOrg, setTargetOrg] = useLocalStorage('sf-org-deploy-target', '');
  const [selections, setSelections] = useState<Selection[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<'validate' | 'deploy'>('validate');
  const [testLevel, setTestLevel] = useState<TestLevel>('RunLocalTests');
  const [testsInput, setTestsInput] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [executing, setExecuting] = useState(false);
  const [deployResult, setDeployResult] = useState<{ record: OrgDeployRecord; response: any } | null>(null);

  const unlocked = useMemo(() => {
    const set = new Set<StepKey>(['orgs']);
    if (sourceOrg && targetOrg && sourceOrg !== targetOrg) set.add('metadata');
    if (compare) {
      set.add('review');
      set.add('settings');
    }
    if (deployResult) set.add('result');
    return set;
  }, [sourceOrg, targetOrg, compare, deployResult]);

  async function runCompare() {
    setComparing(true);
    try {
      const result = await api<CompareResult>('/org-deploy/compare', {
        method: 'POST',
        body: JSON.stringify({ sourceOrg, targetOrg, selections }),
      });
      setCompare(result);
      setSelectedKeys(new Set(result.rows.map((row) => row.key)));
      setStep('review');
      if (!result.targetAvailable) {
        toast.info('Comparison completed with warnings', 'The target org could not be read — see the review step.');
      } else {
        toast.success('Comparison complete', `${result.rows.length} components compared`);
      }
    } catch (error) {
      toast.error(error);
    } finally {
      setComparing(false);
    }
  }

  async function runExecute() {
    if (!compare) return;
    const tests = testsInput
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const phrase = `${mode === 'deploy' ? 'DEPLOY' : 'VALIDATE'} ${targetOrg}`;
    setExecuting(true);
    try {
      const result = await api<{ record: OrgDeployRecord; response: any }>('/org-deploy/deploy', {
        method: 'POST',
        body: JSON.stringify({
          id: compare.id,
          keys: [...selectedKeys],
          targetOrg,
          mode,
          testLevel,
          tests,
          confirmation: mode === 'deploy' ? confirmation : phrase,
        }),
      });
      invalidate('org-deploy:history');
      setDeployResult(result);
      setStep('result');
      toast.success(mode === 'deploy' ? 'Deployment started' : 'Validation submitted', result.record.jobId ? `Job ${result.record.jobId}` : undefined);
    } catch (error) {
      toast.error(error);
    } finally {
      setExecuting(false);
    }
  }

  function restart() {
    setCompare(null);
    setSelectedKeys(new Set());
    setDeployResult(null);
    setConfirmation('');
    setStep('metadata');
  }

  const selectedTypes = compare ? [...new Set(compare.rows.filter((row) => selectedKeys.has(row.key)).map((row) => row.type))] : [];

  return (
    <>
      <nav className="step-tabs">
        {STEPS.map((definition) => (
          <button
            key={definition.key}
            className={`step-tab${step === definition.key ? ' is-active' : ''}`}
            disabled={!unlocked.has(definition.key)}
            onClick={() => setStep(definition.key)}
          >
            {definition.label}
          </button>
        ))}
      </nav>

      {step === 'orgs' ? (
        <SelectOrgsStep
          orgs={orgs}
          sourceOrg={sourceOrg}
          targetOrg={targetOrg}
          onSourceChange={setSourceOrg}
          onTargetChange={setTargetOrg}
          onNext={() => setStep('metadata')}
        />
      ) : null}

      {step === 'metadata' ? (
        <SelectMetadataStep
          sourceOrg={sourceOrg}
          selections={selections}
          setSelections={setSelections}
          comparing={comparing}
          onBack={() => setStep('orgs')}
          onCompare={runCompare}
        />
      ) : null}

      {step === 'review' && compare ? (
        <CompareReviewStep
          compare={compare}
          selectedKeys={selectedKeys}
          setSelectedKeys={setSelectedKeys}
          onBack={() => setStep('metadata')}
          onNext={() => setStep('settings')}
        />
      ) : null}

      {step === 'settings' && compare ? (
        <DeploySettingsStep
          compare={compare}
          selectedCount={selectedKeys.size}
          selectedTypes={selectedTypes}
          mode={mode}
          setMode={setMode}
          testLevel={testLevel}
          setTestLevel={setTestLevel}
          testsInput={testsInput}
          setTestsInput={setTestsInput}
          confirmation={confirmation}
          setConfirmation={setConfirmation}
          busy={executing}
          onBack={() => setStep('review')}
          onExecute={runExecute}
        />
      ) : null}

      {step === 'result' && deployResult ? (
        <ExecuteResultStep record={deployResult.record} submitResponse={deployResult.response} onRestart={restart} />
      ) : null}

      <HistoryPanel />
    </>
  );
}
