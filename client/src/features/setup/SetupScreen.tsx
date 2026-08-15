import { useState } from 'react';
import { ArrowRight, Check, Cloud, Plus, RefreshCw, X } from 'lucide-react';
import { AuthorizeOrgDialog } from '../org/AuthorizeOrgDialog';
import type { Org, SystemStatus } from '../../types';
import { orgIdOf } from '../../types';

/**
 * Pre-flight screen shown until the Salesforce CLI and at least one authorized org exist.
 * It also offers authorization, so a machine with zero orgs is not a dead end.
 */
export function SetupScreen({
  status,
  orgs,
  error,
  onRetry,
  onContinue,
}: {
  status?: SystemStatus;
  orgs: Org[];
  error?: string;
  onRetry: () => void;
  onContinue: (org: Org) => void;
}) {
  const [authorizing, setAuthorizing] = useState(false);
  const cliOk = !!status?.cli.installed;

  const checks = [
    { ok: !!status?.node, label: 'Node.js', detail: status?.node || 'Checking…' },
    { ok: cliOk, label: 'Salesforce CLI', detail: status?.cli.version || status?.cli.error || 'Not detected' },
    {
      ok: orgs.length > 0,
      label: 'Authorized orgs',
      detail: orgs.length ? `${orgs.length} org${orgs.length === 1 ? '' : 's'} available` : 'No local orgs found',
    },
  ];

  return (
    <div className="setup">
      <section className="setup-panel">
        <span className="brandmark">
          <Cloud />
        </span>
        <span className="badge badge-accent">Local-first developer tool</span>
        <h1>
          Your Salesforce workflow,
          <br />
          without the command line.
        </h1>
        <p>
          SF Dev Console drives the Salesforce CLI and the orgs already authorized on this device. No cloud account, no
          database, and no access tokens in the browser.
        </p>

        <div className="setup-checks">
          {checks.map((check) => (
            <div className={`setup-check${check.ok ? '' : ' is-bad'}`} key={check.label}>
              {check.ok ? <Check /> : <X />}
              <div>
                <b>{check.label}</b>
                <small>{check.detail}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="setup-actions">
          {orgs.length ? (
            <button className="btn btn-primary btn-lg" onClick={() => onContinue(orgs[0])}>
              Continue as {orgIdOf(orgs[0])} <ArrowRight />
            </button>
          ) : null}
          <button className="btn btn-lg" disabled={!cliOk} onClick={() => setAuthorizing(true)}>
            <Plus /> Authorize an org
          </button>
          <button className="btn btn-lg" onClick={onRetry}>
            <RefreshCw /> Re-check
          </button>
        </div>

        {!cliOk ? (
          <p className="setup-hint">
            Install the Salesforce CLI, then re-check. On macOS the launcher looks in <code>~/.local/bin</code>,{' '}
            <code>/opt/homebrew/bin</code>, and <code>/usr/local/bin</code>.
          </p>
        ) : null}
        {error ? <p className="setup-error">{error}</p> : null}
      </section>

      <aside className="setup-art">
        <div className="terminal">
          <div className="terminal-bar">
            <i />
            <i />
            <i />
          </div>
          <pre>
            <span className="terminal-prompt">$</span> sf org list --json{'\n'}
            <span className="terminal-ok">✓</span> Salesforce CLI detected{'\n'}
            <span className="terminal-ok">✓</span> Authorized orgs loaded{'\n'}
            {'\n'}
            <span className="terminal-dim">Ready for development.</span>
          </pre>
        </div>
      </aside>

      {authorizing ? <AuthorizeOrgDialog onClose={() => setAuthorizing(false)} onAuthorized={onRetry} /> : null}
    </div>
  );
}
