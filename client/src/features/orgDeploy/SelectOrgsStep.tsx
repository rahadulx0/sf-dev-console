import { ArrowRight, Cloud } from 'lucide-react';
import { Callout, Empty, Field } from '../../ui/primitives';
import { orgIdOf, type Org } from '../../types';
import { SelectMenu } from '../../ui/SelectMenu';

export function SelectOrgsStep({
  orgs,
  sourceOrg,
  targetOrg,
  onSourceChange,
  onTargetChange,
  onNext,
}: {
  orgs: Org[];
  sourceOrg: string;
  targetOrg: string;
  onSourceChange: (id: string) => void;
  onTargetChange: (id: string) => void;
  onNext: () => void;
}) {
  const same = !!sourceOrg && !!targetOrg && sourceOrg === targetOrg;
  const canContinue = !!sourceOrg && !!targetOrg && !same;

  if (!orgs.length) {
    return <Empty icon={Cloud} title="No authorized orgs found" text="Authorize an org from the Overview page first." />;
  }

  return (
    <div className="page-stack">
      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Source org</h3>
              <p>Metadata is retrieved from this org for browsing and comparison. Nothing here is changed.</p>
            </div>
          </div>
          <div className="panel-body">
            <OrgPicker orgs={orgs} value={sourceOrg} disabledId={targetOrg} onChange={onSourceChange} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Target org</h3>
              <p>Selected metadata is compared against this org, and only deployed here after your explicit confirmation.</p>
            </div>
          </div>
          <div className="panel-body">
            <OrgPicker orgs={orgs} value={targetOrg} disabledId={sourceOrg} onChange={onTargetChange} />
          </div>
        </section>
      </div>

      {same ? (
        <Callout icon={Cloud} tone="danger" title="Source and target must be different orgs">
          A deployment between the same org twice would have no effect. Choose two different authorized orgs.
        </Callout>
      ) : null}

      <div className="action-row">
        <button className="btn btn-primary" disabled={!canContinue} onClick={onNext}>
          Continue to metadata <ArrowRight />
        </button>
      </div>
    </div>
  );
}

function OrgPicker({
  orgs,
  value,
  disabledId,
  onChange,
}: {
  orgs: Org[];
  value: string;
  disabledId: string;
  onChange: (id: string) => void;
}) {
  const selected = orgs.find((org) => orgIdOf(org) === value);
  return (
    <>
      <Field label="Choose an authorized org">
        <SelectMenu
          value={value}
          onChange={onChange}
          placeholder="Select an org…"
          ariaLabel="Choose an authorized org"
          options={[...orgs].sort((left, right) => Number(left.isSandbox) - Number(right.isSandbox) || orgIdOf(left).localeCompare(orgIdOf(right))).map((org) => {
            const id = orgIdOf(org);
            const disabled = id === disabledId && disabledId !== value;
            return {
              value: id,
              label: id,
              description: `${org.isSandbox ? 'Sandbox' : 'Production'} · ${org.username}${disabled ? ' · already selected' : ''}`,
              disabled,
              group: org.isSandbox ? 'Sandbox orgs' : 'Production orgs',
            };
          })}
        />
      </Field>
      {selected ? (
        <div className="row" style={{ borderTop: 0, paddingTop: 'var(--s-3)' }}>
          <span className="row-icon">
            <Cloud />
          </span>
          <div className="row-main">
            <b>{value}</b>
            <small>
              {selected.isSandbox ? 'Sandbox' : 'Production'} · {selected.username}
            </small>
          </div>
        </div>
      ) : null}
    </>
  );
}
