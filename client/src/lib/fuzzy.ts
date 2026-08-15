/*
 * Fuzzy matching for type, object, field, and capability lists.
 *
 * These lists reach several thousand entries and are re-scored on every keystroke, so
 * normalisation results are memoised: the expensive part is `normalize`, not the scan.
 */

const normalizeCache = new Map<string, string>();
const NORMALIZE_CACHE_LIMIT = 20_000;

function normalized(value: string) {
  const hit = normalizeCache.get(value);
  if (hit !== undefined) return hit;
  const result = value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  // The cache is bounded so a long session cannot grow it without limit.
  if (normalizeCache.size >= NORMALIZE_CACHE_LIMIT) normalizeCache.clear();
  normalizeCache.set(value, result);
  return result;
}

export function fuzzyScore(value: string, query: string) {
  const text = normalized(value);
  const needle = normalized(query.trim());
  if (!needle) return 1;
  if (text === needle) return 1_000;
  if (text.startsWith(needle)) return 900 - text.length * 0.01;
  const substring = text.indexOf(needle);
  if (substring >= 0) return 750 - substring * 2 - text.length * 0.01;
  let queryIndex = 0;
  let score = 0;
  let previousMatch = -2;
  for (let index = 0; index < text.length && queryIndex < needle.length; index++) {
    if (text[index] !== needle[queryIndex]) continue;
    const consecutive = index === previousMatch + 1;
    const boundary = index === 0 || /[\s_.\-/]/.test(text[index - 1]);
    score += 12 + (consecutive ? 10 : 0) + (boundary ? 8 : 0) - index * 0.04;
    previousMatch = index;
    queryIndex++;
  }
  return queryIndex === needle.length ? score - (text.length - needle.length) * 0.05 : -1;
}

export function fuzzySearch<T>(items: T[], query: string, searchable: (item: T) => string | string[]): T[] {
  if (!query.trim()) return items;
  const scored: { item: T; index: number; score: number }[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const values = searchable(item);
    let score = -1;
    if (Array.isArray(values)) {
      for (const value of values) {
        const next = fuzzyScore(String(value ?? ''), query);
        if (next > score) score = next;
      }
    } else {
      score = fuzzyScore(String(values ?? ''), query);
    }
    if (score >= 0) scored.push({ item, index, score });
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((result) => result.item);
}

/** Convenience for the common case of a plain string list. */
export function fuzzyStrings(items: string[], query: string): string[] {
  if (!query.trim()) return items;
  const scored: { item: string; index: number; score: number }[] = [];
  for (let index = 0; index < items.length; index++) {
    const score = fuzzyScore(items[index], query);
    if (score >= 0) scored.push({ item: items[index], index, score });
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((result) => result.item);
}
