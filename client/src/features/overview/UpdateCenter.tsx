import { useEffect, useState } from 'react';
import { Check, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { Badge } from '../../ui/primitives';

/** Desktop-only: hidden entirely when the preload bridge is absent (browser or dev server). */
export function UpdateCenter() {
  const bridge = window.desktopUpdater;
  const [state, setState] = useState<DesktopUpdateState>();

  useEffect(() => {
    if (!bridge) return;
    void bridge.getState().then(setState);
    return bridge.onState(setState);
  }, [bridge]);

  if (!bridge) return null;

  const working = ['checking', 'downloading', 'installing'].includes(state?.status || '');

  async function update() {
    if (!bridge) return;
    const checked = await bridge.check();
    if (checked.status !== 'available') return;
    const downloaded = await bridge.download();
    if (downloaded.status === 'ready') await bridge.install();
  }

  const label =
    state?.status === 'checking'
      ? 'Checking…'
      : state?.status === 'downloading'
        ? `Downloading ${state.progress ?? 0}%`
        : state?.status === 'installing'
          ? 'Restarting…'
          : 'Check for updates';

  return (
    <div className={`update-card is-${state?.status || 'idle'}`}>
      <span className="row-icon">
        {working ? <LoaderCircle className="spin" /> : state?.status === 'current' ? <Check /> : <Download />}
      </span>
      <div className="row-main">
        <b>
          Application updates
          {state?.currentVersion ? <Badge>v{state.currentVersion}</Badge> : null}
          {state?.latestVersion && state.status === 'available' ? (
            <Badge tone="accent">v{state.latestVersion} available</Badge>
          ) : null}
        </b>
        <small>{state?.message || 'Download, install, and restart from the latest GitHub Release.'}</small>
        {state?.status === 'downloading' ? <progress className="progress" max={100} value={state.progress || 0} /> : null}
      </div>
      <button className="btn" disabled={working} onClick={update}>
        {working ? <LoaderCircle className="spin" /> : <RefreshCw />} {label}
      </button>
    </div>
  );
}
