import type { SalesforceField } from '../../types';

const NUMERIC = ['double', 'currency', 'percent', 'integer', 'long'];

/** Renders the control appropriate to the described Salesforce field type. */
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SalesforceField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === 'boolean') {
    const checked = value === true || value === 'true';
    return (
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {checked ? 'True' : 'False'}
      </label>
    );
  }

  if (field.picklistValues?.length) {
    return (
      <select className="select" value={(value as string) ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">— None —</option>
        {field.picklistValues
          .filter((option) => option.active)
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        className="textarea"
        rows={3}
        value={(value as string) ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  const type = NUMERIC.includes(field.type) ? 'number' : field.type === 'date' ? 'date' : 'text';
  return (
    <input
      className="input"
      type={type}
      value={(value as string) ?? ''}
      maxLength={field.length || undefined}
      onChange={(event) =>
        onChange(type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)
      }
    />
  );
}
