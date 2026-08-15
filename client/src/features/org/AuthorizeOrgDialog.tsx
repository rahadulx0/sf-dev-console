import { useState } from 'react';
import { Cloud, ExternalLink, FlaskConical, LoaderCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { invalidate } from '../../lib/resource';
import { Modal } from '../../ui/Modal';
import { Field } from '../../ui/primitives';

/**
 * Hands authorization to `sf org login web`. Credentials and tokens never pass through this
 * application; it only chooses the login host and the CLI's own flags.
 */
export function AuthorizeOrgDialog({ onClose, onAuthorized }: { onClose: () => void; onAuthorized?: () => void }) {
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production');
  const [alias, setAlias] = useState('');
  const [setDefault, setSetDefault] = useState(false);
  const [setDevHub, setSetDevHub] = useState(false);
  const [browser, setBrowser] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function authorize() {
    setBusy(true);
    setError('');
    try {
      await api('/orgs/authorize', {
        method: 'POST',
        body: JSON.stringify({
          environment,
          alias: alias || undefined,
          setDefault,
          setDevHub,
          browser: browser || undefined,
        }),
      });
      invalidate('system:orgs');
      onAuthorized?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      icon={Cloud}
      title="Authorize a Salesforce org"
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={authorize} disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <ExternalLink />} Open Salesforce login
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
        Salesforce CLI opens a secure browser window. Credentials and tokens stay managed by the CLI.
      </p>

      <div className="choice-grid">
        {(
          [
            ['production', Cloud, 'Production / Developer', 'login.salesforce.com'],
            ['sandbox', FlaskConical, 'Sandbox', 'test.salesforce.com'],
          ] as const
        ).map(([value, Icon, title, host]) => (
          <button
            key={value}
            className={`choice${environment === value ? ' is-active' : ''}`}
            onClick={() => setEnvironment(value)}
          >
            <Icon />
            <span>
              <b>{title}</b>
              <small>{host}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="form-row" style={{ marginTop: 'var(--s-4)' }}>
        <Field label="Org alias" hint="Recommended">
          <input
            className="input"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="dev-sandbox"
            spellCheck={false}
          />
        </Field>
        <Field label="Preferred browser">
          <select className="select" value={browser} onChange={(event) => setBrowser(event.target.value)}>
            <option value="">System default</option>
            <option value="chrome">Google Chrome</option>
            <option value="firefox">Firefox</option>
            <option value="edge">Microsoft Edge</option>
          </select>
        </Field>
      </div>

      <div className="choice-grid" style={{ marginTop: 'var(--s-4)' }}>
        <label className="choice">
          <input type="checkbox" checked={setDefault} onChange={(event) => setSetDefault(event.target.checked)} />
          <span>
            <b>Set as default org</b>
            <small>Used when CLI commands omit a target.</small>
          </span>
        </label>
        <label className="choice">
          <input type="checkbox" checked={setDevHub} onChange={(event) => setSetDevHub(event.target.checked)} />
          <span>
            <b>Set as default Dev Hub</b>
            <small>Used for scratch org and package work.</small>
          </span>
        </label>
      </div>

      {error ? (
        <div className="callout callout-danger" style={{ marginTop: 'var(--s-4)' }}>
          <span />
          <div>
            <b>Authorization failed</b>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="callout callout-accent" style={{ marginTop: 'var(--s-4)' }}>
          <LoaderCircle className="spin" />
          <div>
            <b>Complete login in your browser</b>
            <p>This dialog closes once Salesforce CLI confirms the authorization.</p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
