export interface DiffLine {
  op: 'equal' | 'add' | 'remove';
  text: string;
}

const MAX_LINES = 2000;

/** Small LCS-based line diff. Returns null when either side exceeds a safe line count for the O(n*m) table. */
export function diffLines(a: string, b: string): DiffLine[] | null {
  const left = a.split('\n');
  const right = b.split('\n');
  if (left.length > MAX_LINES || right.length > MAX_LINES) return null;

  const n = left.length;
  const m = right.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      result.push({ op: 'equal', text: left[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ op: 'remove', text: left[i] });
      i++;
    } else {
      result.push({ op: 'add', text: right[j] });
      j++;
    }
  }
  while (i < n) result.push({ op: 'remove', text: left[i++] });
  while (j < m) result.push({ op: 'add', text: right[j++] });
  return result;
}
