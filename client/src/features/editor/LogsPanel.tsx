import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollText, X } from 'lucide-react';
import { useLocalStorage } from '../../lib/hooks';
import { Empty } from '../../ui/primitives';
import type { LogEntry } from './logs';

const LOG_ROW_HEIGHT = 22;
const DEFAULT_VISIBLE_ROWS = 5;
const DEFAULT_PANEL_HEIGHT = 39 + LOG_ROW_HEIGHT * DEFAULT_VISIBLE_ROWS;
const MIN_PANEL_HEIGHT = 39 + LOG_ROW_HEIGHT * 2;
const MAX_PANEL_HEIGHT = 520;
const MIN_EDITOR_HEIGHT = 120;

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
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ y: 0, height: DEFAULT_PANEL_HEIGHT });
  const [height, setHeight] = useLocalStorage('sf-editor-logs-height', DEFAULT_PANEL_HEIGHT);
  const [resizing, setResizing] = useState(false);

  const clampHeight = useCallback((requested: number) => {
    const available = (panelRef.current?.parentElement?.clientHeight ?? MAX_PANEL_HEIGHT) - MIN_EDITOR_HEIGHT;
    return Math.round(Math.max(MIN_PANEL_HEIGHT, Math.min(requested, MAX_PANEL_HEIGHT, available)));
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs.length]);

  useEffect(() => {
    if (!resizing) return;
    function onPointerMove(event: PointerEvent) {
      setHeight(clampHeight(dragStart.current.height + dragStart.current.y - event.clientY));
    }
    function stopResizing() {
      setResizing(false);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResizing, { once: true });
    window.addEventListener('pointercancel', stopResizing, { once: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [clampHeight, resizing, setHeight]);

  useEffect(() => {
    function fitToWindow() {
      setHeight((current) => clampHeight(Number.isFinite(current) ? current : DEFAULT_PANEL_HEIGHT));
    }
    fitToWindow();
    window.addEventListener('resize', fitToWindow);
    return () => window.removeEventListener('resize', fitToWindow);
  }, [clampHeight, setHeight]);

  function resizeBy(delta: number) {
    setHeight((current) => clampHeight((Number.isFinite(current) ? current : DEFAULT_PANEL_HEIGHT) + delta));
  }

  if (hidden) {
    return (
      <button className="logs-reopen" onClick={onShow}>
        <ScrollText /> Logs{logs.length ? ` (${logs.length})` : ''}
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`logs-panel${resizing ? ' is-resizing' : ''}`}
      style={{ height: Number.isFinite(height) ? height : DEFAULT_PANEL_HEIGHT }}
    >
      <div
        className="logs-resize-handle"
        role="separator"
        aria-label="Resize logs panel"
        aria-orientation="horizontal"
        aria-valuemin={MIN_PANEL_HEIGHT}
        aria-valuemax={MAX_PANEL_HEIGHT}
        aria-valuenow={height}
        tabIndex={0}
        title="Drag to resize logs. Double-click to reset."
        onPointerDown={(event) => {
          event.preventDefault();
          dragStart.current = { y: event.clientY, height: panelRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT };
          setResizing(true);
        }}
        onDoubleClick={() => setHeight(clampHeight(DEFAULT_PANEL_HEIGHT))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            resizeBy(event.shiftKey ? 50 : 10);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            resizeBy(event.shiftKey ? -50 : -10);
          } else if (event.key === 'Home') {
            event.preventDefault();
            setHeight(clampHeight(MIN_PANEL_HEIGHT));
          } else if (event.key === 'End') {
            event.preventDefault();
            setHeight(clampHeight(MAX_PANEL_HEIGHT));
          }
        }}
      />
      <div className="logs-panel-head">
        <b>Logs</b>
        <span className="logs-panel-actions">
          <button className="btn btn-link" onClick={onClear} disabled={!logs.length}>
            Clear Logs
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Hide logs">
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
