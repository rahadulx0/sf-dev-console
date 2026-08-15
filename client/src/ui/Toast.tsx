import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { errorMessage } from '../lib/api';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  success: (title: string, detail?: string, action?: Toast['action']) => void;
  error: (error: unknown, detail?: string) => void;
  info: (title: string, detail?: string, action?: Toast['action']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const LIFETIME: Record<ToastKind, number> = { success: 4500, info: 6000, error: 9000 };

/** Replaces the blocking window.alert() the application used for job feedback. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, title: string, detail?: string, action?: Toast['action']) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, kind, title, detail, action }]);
      setTimeout(() => dismiss(id), LIFETIME[kind]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, detail, action) => push('success', title, detail, action),
      info: (title, detail, action) => push('info', title, detail, action),
      error: (error, detail) => push('error', errorMessage(error), detail),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id} role="status">
            {toast.kind === 'success' ? <Check /> : toast.kind === 'error' ? <AlertTriangle /> : <Info />}
            <div className="toast-body">
              <b>{toast.title}</b>
              {toast.detail ? <p>{toast.detail}</p> : null}
            </div>
            {toast.action ? (
              <button
                className="btn btn-link"
                onClick={() => {
                  toast.action!.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button className="btn btn-ghost btn-icon" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <X />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
