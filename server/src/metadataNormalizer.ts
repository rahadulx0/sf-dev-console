import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  trimValues: true,
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Produces stable bytes for comparison only. Object/tag property order and formatting are
 * normalized, while repeated XML element arrays retain their original order because order is
 * meaningful for metadata such as layouts, flows, and picklists.
 */
export function normalizeMetadataContent(file: string, content: Buffer): Buffer | string {
  if (!file.toLowerCase().endsWith('.xml')) {
    return content.toString('utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  }
  try {
    return JSON.stringify(canonical(parser.parse(content.toString('utf8'))));
  } catch {
    // Malformed or nonstandard XML remains comparable as raw normalized text rather than
    // making the entire comparison fail.
    return content.toString('utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  }
}
