import { useState } from 'react';
import { PackageCheck, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { invalidate, useResource } from '../../lib/resource';
import { useAppState } from '../../app/state';
import { navigate } from '../../lib/router';
import { dateTime } from '../../lib/format';
import { Badge, Empty, Loading, Panel, PanelHead } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import type { SavedSet } from '../../types';

export default function SavedPage() {
  const { selections, setSelections, selectedCount } = useAppState();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const sets = useResource<{ savedSets: SavedSet[] }>('local:saved-sets', (signal) => api('/saved-sets', { signal }), {
    ttl: 30_000,
  });
  const items = sets.data?.savedSets ?? [];

  async function save() {
    if (!name.trim() || !selections.length) return;
    setBusy(true);
    try {
      await api('/saved-sets', { method: 'POST', body: JSON.stringify({ name: name.trim(), selections }) });
      setName('');
      invalidate('local:saved-sets');
      toast.success('Selection saved', `${selectedCount} components`);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove(set: SavedSet) {
    try {
      await api(`/saved-sets/${set.id}`, { method: 'DELETE' });
      invalidate('local:saved-sets');
      toast.success('Selection deleted', set.name);
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <Panel>
      <PanelHead title="Saved selections" description="Reusable metadata groups stored only on this device.">
        <Badge>{items.length} saved</Badge>
      </PanelHead>
      <div className="panel-body">
        <div className="save-bar">
          <input
            className="input"
            placeholder="Selection name (for example, Quote module)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void save()}
          />
          <button className="btn btn-primary" disabled={!name.trim() || !selections.length || busy} onClick={save}>
            <PackageCheck /> Save current selection ({selectedCount})
          </button>
        </div>
        {!selections.length ? (
          <p className="hint">
            Nothing is selected yet.{' '}
            <button className="btn btn-link" onClick={() => navigate('metadata')}>
              Choose metadata components
            </button>{' '}
            first.
          </p>
        ) : null}

        {sets.pending ? (
          <Loading label="Loading saved selections…" />
        ) : items.length ? (
          <div className="row-list" style={{ marginTop: 'var(--s-4)' }}>
            {items.map((set) => (
              <div className="row" key={set.id}>
                <span className="row-icon is-success">
                  <PackageCheck />
                </span>
                <div className="row-main">
                  <b>{set.name}</b>
                  <small>
                    {set.selections.reduce((total, selection) => total + selection.members.length, 0)} components ·{' '}
                    {dateTime(set.createdAt)}
                  </small>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    setSelections(set.selections);
                    toast.success('Selection loaded', set.name, { label: 'Open metadata', run: () => navigate('metadata') });
                  }}
                >
                  Load
                </button>
                <button className="btn btn-ghost btn-icon btn-destructive" onClick={() => remove(set)} title="Delete selection">
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={PackageCheck}
            title="No saved selections"
            text="Select metadata, give the set a name, and save it for later."
          />
        )}
      </div>
    </Panel>
  );
}
