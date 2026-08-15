export function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function toTsv(records: any[], columns: string[]) {
  return [
    columns.join('\t'),
    ...records.map((record) => columns.map((c) => cellValue(record[c]).replaceAll('\t', ' ').replaceAll('\n', ' ')).join('\t')),
  ].join('\n');
}

export function downloadCsv(records: any[], filename = 'salesforce-export.csv') {
  if (!records.length) return;
  const columns = Object.keys(records[0]).filter((k) => k !== 'attributes');
  const csv = [
    columns.join(','),
    ...records.map((record) => columns.map((c) => `"${String(record[c] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const RELATIVE_STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
];

/** "just now", "2m ago", "3h ago" — used by the data-freshness bar. */
export function relativeTime(timestamp: number | string): string {
  const value = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp;
  if (!value) return '';
  const seconds = Math.round((Date.now() - value) / 1000);
  if (seconds < 5) return 'just now';
  let amount = seconds;
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  for (const [size, next] of RELATIVE_STEPS) {
    if (amount < size) break;
    amount = Math.floor(amount / size);
    unit = next;
  }
  const short: Record<string, string> = { second: 's', minute: 'm', hour: 'h', day: 'd' };
  return `${amount}${short[unit] ?? unit} ago`;
}

export function dateTime(value: string | number | undefined) {
  if (!value) return '—';
  const parsed = typeof value === 'string' ? new Date(value) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

export function elapsed(since: string | number) {
  const start = typeof since === 'string' ? Date.parse(since) : since;
  const total = Math.max(0, Math.floor((Date.now() - start) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function bytes(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/** Splits a camel-cased Salesforce key into readable words. */
export function humanize(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
