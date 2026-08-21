import { useState } from 'react';
import { FilePlus2, LoaderCircle } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Field } from '../../ui/primitives';
import { EDITOR_TYPE_DEFS } from './types';

export function NewComponentModal({
  initialType,
  busy,
  onClose,
  onCreate,
}: {
  initialType: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (type: string, fullName: string, sobject?: string) => void;
}) {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState('');
  const [sobject, setSobject] = useState('Account');
  const bundle = EDITOR_TYPE_DEFS.find((def) => def.type === type)?.bundle ?? false;
  const namePattern = bundle ? /^[a-z][A-Za-z0-9_]{0,39}$/ : /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
  const valid = namePattern.test(name) && !name.includes('__') && !name.endsWith('_');

  return (
    <Modal
      icon={FilePlus2}
      title="New component"
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid || busy}
            onClick={() => onCreate(type, name, type === 'ApexTrigger' ? sobject : undefined)}
          >
            {busy ? <LoaderCircle className="spin" /> : <FilePlus2 />} Create &amp; deploy
          </button>
        </>
      }
    >
      <Field label="Metadata type">
        <select className="select" value={type} onChange={(event) => setType(event.target.value)} disabled={busy}>
          {EDITOR_TYPE_DEFS.map((def) => (
            <option key={def.type} value={def.type}>
              {def.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={bundle ? 'Component name' : 'API name'}
        hint={bundle ? 'Must start lowercase, letters and numbers only' : 'Must start with a letter; letters, numbers, and underscores'}
      >
        <input
          className="input input-mono"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={bundle ? 'myComponent' : 'MyClass'}
          spellCheck={false}
          disabled={busy}
        />
      </Field>
      {type === 'ApexTrigger' ? (
        <Field label="sObject" hint="The object the trigger runs on">
          <input
            className="input input-mono"
            value={sobject}
            onChange={(event) => setSobject(event.target.value)}
            placeholder="Account"
            spellCheck={false}
            disabled={busy}
          />
        </Field>
      ) : null}
    </Modal>
  );
}
