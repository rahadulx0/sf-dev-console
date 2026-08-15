import { useMemo, useState } from 'react';
import { LoaderCircle, Pencil, Save, SearchCode } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced } from '../../lib/hooks';
import { fuzzySearch } from '../../lib/fuzzy';
import { cellValue } from '../../lib/format';
import { Badge, Empty, Field, Panel, PanelHead, SearchInput } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { FieldInput } from './FieldInput';
import type { SalesforceField } from '../../types';

export default function InspectorPage() {
  const { orgId } = useAppState();
  const toast = useToast();
  const [sobject, setSobject] = useState('Account');
  const [recordId, setRecordId] = useState('');
  const [record, setRecord] = useState<Record<string, unknown>>();
  const [loadedFor, setLoadedFor] = useState<{ sobject: string; id: string }>();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebounced(search);

  // The describe is cached and shared with the query page, so re-inspecting is one call.
  const describe = useResource<{ describe: { fields?: SalesforceField[] } }>(
    loadedFor ? orgKey(orgId, 'describe', loadedFor.sobject) : null,
    (signal) => api(`${orgPath(orgId)}/objects/${loadedFor!.sobject}`, { signal }),
    { ttl: 600_000 },
  );
  const fields = describe.data?.describe?.fields ?? [];
  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.name, field])), [fields]);

  async function inspect() {
    if (!recordId.trim() || !sobject.trim()) return;
    setBusy(true);
    try {
      const data = await api<Record<string, unknown>>('/data/record', {
        method: 'POST',
        body: JSON.stringify({ org: orgId, sobject, recordId }),
      });
      setRecord(data);
      setDraft(Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'attributes')));
      setLoadedFor({ sobject, id: recordId });
      setEditing(false);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!record) return;
    const changes = Object.fromEntries(
      Object.entries(draft).filter(([key, value]) => value !== record[key] && fieldMap.get(key)?.updateable),
    );
    const count = Object.keys(changes).length;
    if (!count) {
      toast.error('No field values have changed.');
      return;
    }
    setBusy(true);
    try {
      await api('/data/record/update', {
        method: 'POST',
        body: JSON.stringify({ org: orgId, sobject, recordId, changes }),
      });
      toast.success(`${count} field${count === 1 ? '' : 's'} updated`, `${sobject} ${recordId}`);
      await inspect();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  const entries = useMemo(
    () => Object.entries(record ?? {}).filter(([key]) => key !== 'attributes'),
    [record],
  );
  const visible = useMemo(
    () =>
      fuzzySearch(entries, query, ([key, value]) => [
        fieldMap.get(key)?.label || '',
        key,
        fieldMap.get(key)?.type || '',
        cellValue(value),
      ]),
    [entries, query, fieldMap],
  );
  const editableCount = fields.filter((field) => field.updateable).length;

  return (
    <Panel>
      <PanelHead
        title="Record inspector"
        description="Retrieve, review, and update fields permitted by Salesforce field-level security."
      >
        {record && !editing ? (
          <button className="btn" onClick={() => setEditing(true)} disabled={!fields.length}>
            <Pencil /> Edit record
          </button>
        ) : null}
        {editing ? (
          <>
            <button
              className="btn"
              onClick={() => {
                setEditing(false);
                setDraft(Object.fromEntries(entries));
              }}
            >
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? <LoaderCircle className="spin" /> : <Save />} Save changes
            </button>
          </>
        ) : null}
        <button className="btn btn-primary" disabled={busy || !recordId.trim()} onClick={inspect}>
          {busy ? <LoaderCircle className="spin" /> : <SearchCode />} Inspect
        </button>
      </PanelHead>

      <div className="panel-body">
        <div className="form-row">
          <Field label="SObject API name">
            <input
              className="input input-mono"
              value={sobject}
              disabled={editing}
              onChange={(event) => setSobject(event.target.value)}
              placeholder="Account"
              spellCheck={false}
            />
          </Field>
          <Field label="Salesforce record ID">
            <input
              className="input input-mono"
              value={recordId}
              disabled={editing}
              onChange={(event) => setRecordId(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void inspect()}
              placeholder="001…"
              spellCheck={false}
            />
          </Field>
        </div>

        {record ? (
          <>
            <div className="record-toolbar">
              <SearchInput value={search} onChange={setSearch} placeholder="Filter fields…" />
              <span>
                <b>{editableCount}</b> editable · {fields.length} described
                {describe.loading ? ' · loading schema' : ''}
              </span>
            </div>
            <div className={`field-list${editing ? ' is-editing' : ''}`}>
              {visible.map(([key, value]) => {
                const field = fieldMap.get(key);
                const updateable = !!field?.updateable;
                return (
                  <div className={`field-row${editing && updateable ? ' is-editable' : ''}`} key={key}>
                    <span>
                      {field?.label || key}
                      <small className="mono">
                        {key} · {field?.type || typeof value}
                      </small>
                    </span>
                    {editing && updateable ? (
                      <FieldInput
                        field={field!}
                        value={draft[key]}
                        onChange={(next) => setDraft((current) => ({ ...current, [key]: next }))}
                      />
                    ) : (
                      <code title={cellValue(value)}>{cellValue(value) || 'null'}</code>
                    )}
                    {editing && !updateable ? <Badge>Read only</Badge> : null}
                  </div>
                );
              })}
              {!visible.length ? <Empty title="No matching fields" text="Try a different filter." /> : null}
            </div>
          </>
        ) : (
          <Empty
            icon={SearchCode}
            title="No record loaded"
            text="Enter an object API name and a Salesforce record ID, then choose Inspect."
          />
        )}
      </div>
    </Panel>
  );
}
