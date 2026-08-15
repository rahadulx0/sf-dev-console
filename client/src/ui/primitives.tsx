import type { ComponentType, ReactNode } from 'react';
import { Box, LoaderCircle, RefreshCw } from 'lucide-react';
import { relativeTime } from '../lib/format';
import { useTicker } from '../lib/hooks';

export type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warn';

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span className={`badge${tone === 'neutral' ? '' : ` badge-${tone}`}`} title={title}>
      {children}
    </span>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function PanelHead({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="panel-actions">{children}</div> : null}
    </div>
  );
}

export function Empty({
  icon: Icon = Box,
  title,
  text,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <Icon />
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      {label}
    </div>
  );
}

export function Spinner() {
  return <LoaderCircle className="spin" />;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>;
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return <pre className="code-block">{children}</pre>;
}

export function Json({ value }: { value: unknown }) {
  return <CodeBlock>{JSON.stringify(value, null, 2)}</CodeBlock>;
}

export function Callout({
  icon: Icon,
  tone = 'neutral',
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'accent' | 'danger';
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`callout${tone === 'neutral' ? '' : ` callout-${tone}`}`}>
      <Icon />
      <div>
        <b>{title}</b>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

/**
 * Shows how old cached data is and offers a refresh. Every cached view carries one, so
 * "fast because cached" never becomes "silently out of date".
 */
export function StaleBar({
  updatedAt,
  refreshing,
  onRefresh,
  label = 'Loaded',
}: {
  updatedAt: number;
  refreshing?: boolean;
  onRefresh: () => void;
  label?: string;
}) {
  useTicker(15_000, updatedAt > 0);
  return (
    <div className="stale-bar">
      {updatedAt > 0 ? (
        <span>
          {label} {relativeTime(updatedAt)}
          {refreshing ? ' · refreshing…' : ' · cached'}
        </span>
      ) : (
        <span>{refreshing ? 'Loading…' : 'Not loaded'}</span>
      )}
      <button className="btn btn-ghost" onClick={onRefresh} disabled={refreshing} title="Re-run this query against the org">
        {refreshing ? <LoaderCircle className="spin" /> : <RefreshCw />} Refresh
      </button>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="search-input">
      <SearchGlyph />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

export function Pagination({
  total,
  page,
  size,
  onPage,
  onSize,
}: {
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  return (
    <div className="pagination">
      <span>{total ? `${(current - 1) * size + 1}–${Math.min(current * size, total)} of ${total}` : '0 items'}</span>
      <select
        className="select"
        value={size}
        onChange={(event) => {
          onSize(Number(event.target.value));
          onPage(1);
        }}
      >
        <option value="10">10 / page</option>
        <option value="25">25 / page</option>
        <option value="50">50 / page</option>
        <option value="100">100 / page</option>
      </select>
      <button className="btn" disabled={current <= 1} onClick={() => onPage(current - 1)}>
        Previous
      </button>
      <b>
        {current} / {pages}
      </b>
      <button className="btn" disabled={current >= pages} onClick={() => onPage(current + 1)}>
        Next
      </button>
    </div>
  );
}
