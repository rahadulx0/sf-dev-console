export type LogKind = 'FETCH' | 'SUCCESS' | 'ERROR';

export interface LogEntry {
  id: string;
  kind: LogKind;
  component: string;
  category: string;
  message: string;
  timestamp: number;
}

/** Renders each deploy component failure as its own log-friendly line, e.g. "Foo.cls (Line 12, Col 4)". */
export function deployFailureMessages(result: any): string[] {
  const failures = result?.details?.componentFailures;
  const list = Array.isArray(failures) ? failures : failures ? [failures] : [];
  return list.map((f: any) => {
    const where = f.lineNumber != null ? ` (Line ${f.lineNumber}${f.columnNumber != null ? `, Col ${f.columnNumber}` : ''})` : '';
    return `${f.problem || f.message || 'Unknown error'}${where}`;
  });
}

export function deployFailed(result: any): boolean {
  return result?.success === false || result?.status === 'Failed';
}
