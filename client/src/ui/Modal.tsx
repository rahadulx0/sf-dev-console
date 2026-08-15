import { useEffect, type ComponentType, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  icon: Icon,
  title,
  onClose,
  wide,
  flush,
  footer,
  children,
  closeDisabled,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  onClose: () => void;
  wide?: boolean;
  flush?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  closeDisabled?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, closeDisabled]);

  return (
    <div className="modal-backdrop" onMouseDown={() => !closeDisabled && onClose()}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          {Icon ? <Icon /> : null}
          <b>{title}</b>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={closeDisabled} aria-label="Close">
            <X />
          </button>
        </div>
        <div className={`modal-body${flush ? ' modal-body-flush' : ''}`}>{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * A destructive action gated on typing an exact phrase. The phrase is also revalidated on the
 * server, so this is a deliberate speed bump rather than the security boundary.
 */
export function ConfirmDialog({
  icon,
  title,
  phrase,
  description,
  confirmLabel,
  value,
  onChange,
  onConfirm,
  onClose,
  busy,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  phrase: string;
  description: ReactNode;
  confirmLabel: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      icon={icon}
      title={title}
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-danger" disabled={value !== phrase || busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{description}</p>
      <pre className="code-block" style={{ margin: 'var(--s-3) 0', color: 'var(--danger)' }}>
        {phrase}
      </pre>
      <input
        className="input input-mono"
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={phrase}
        spellCheck={false}
      />
    </Modal>
  );
}
