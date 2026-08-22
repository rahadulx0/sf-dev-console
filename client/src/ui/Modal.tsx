import { useEffect, useId, useRef, type ComponentType, type ReactNode } from 'react';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.offsetParent !== null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => focusable()[0]?.focus());
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, closeDisabled]);

  return (
    <div className="modal-backdrop" onMouseDown={() => !closeDisabled && onClose()}>
      <div
        ref={dialogRef}
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          {Icon ? <Icon /> : null}
          <b id={titleId}>{title}</b>
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
