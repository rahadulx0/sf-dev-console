import { useEffect, useRef } from 'react';
import { ScrollText, X } from 'lucide-react';
import { Empty } from '../../ui/primitives';
import type { LogEntry } from './logs';

export function LogsPanel({
  logs,
  hidden,
  onClear,
  onClose,
  onShow,
}: {
  logs: LogEntry[];
  hidden: boolean;
  onClear: () => void;
  onClose: () => void;
  onShow: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs.length]);

  if (hidden) {
    return (
      <button className="logs-reopen" onClick={onShow}>
        <ScrollText /> Logs{logs.length ? ` (${logs.length})` : ''}
      </button>
    );
  }

  return (
    <div className="logs-panel">
      <div className="logs-panel-head">
        <b>Logs</b>
        <span className="logs-panel-actions">
          <button className="btn btn-link" onClick={onClear} disabled={!logs.length}>
            Clear Logs
          </button>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Hide logs">
            <X />
          </button>
        </span>
      </div>
      <div className="logs-panel-body" ref={bodyRef}>
        {logs.length === 0 ? (
          <Empty icon={ScrollText} title="No activity yet" text="Open, save, or manage a component to see activity here." />
        ) : (
          logs.map((log) => (
            <div className={`log-row log-row-${log.kind.toLowerCase()}`} key={log.id}>
              <span className="log-kind">{log.kind}</span>
              <span className="log-message">
                <b className="mono">{log.component}</b> · {log.category} · {log.message}
              </span>
              <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
