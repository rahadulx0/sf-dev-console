import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const RELOAD_FLAG = 'sf-chunk-reloaded';

/** A failed dynamic import means the page is holding chunk names from a previous build. */
function isStaleChunkError(error: Error) {
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
}

interface State {
  error?: Error;
}

/**
 * Keeps a page-level failure from blanking the whole application. After an update, an open
 * window still references the previous build's chunks; that case reloads once automatically
 * rather than leaving the user on an empty screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: undefined });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render', error, info.componentStack);
    if (isStaleChunkError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="panel">
        <div className="panel-body">
          <div className="empty">
            <AlertTriangle />
            <b>This page could not be displayed</b>
            <p>{error.message}</p>
            <button className="btn" onClick={() => window.location.reload()} style={{ marginTop: 'var(--s-3)' }}>
              <RefreshCw /> Reload the application
            </button>
          </div>
        </div>
      </section>
    );
  }
}

/** Clears the one-shot reload guard once a build renders successfully. */
export function clearReloadGuard() {
  sessionStorage.removeItem(RELOAD_FLAG);
}
