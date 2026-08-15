function normalized(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
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
  for (
    let index = 0;
    index < text.length && queryIndex < needle.length;
    index++
  ) {
    if (text[index] !== needle[queryIndex]) continue;
    const consecutive = index === previousMatch + 1;
    const boundary = index === 0 || /[\s_.\-/]/.test(text[index - 1]);
    score += 12 + (consecutive ? 10 : 0) + (boundary ? 8 : 0) - index * 0.04;
    previousMatch = index;
    queryIndex++;
  }
  return queryIndex === needle.length
    ? score - (text.length - needle.length) * 0.05
    : -1;
}

export function fuzzySearch<T>(
  items: T[],
  query: string,
  searchable: (item: T) => string | string[],
) {
  if (!query.trim()) return items;
  return items
    .map((item, index) => {
      const values = searchable(item);
      const score = Math.max(
        ...(Array.isArray(values) ? values : [values]).map((value) =>
          fuzzyScore(String(value ?? ""), query),
        ),
      );
      return { item, index, score };
    })
    .filter((result) => result.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((result) => result.item);
}
