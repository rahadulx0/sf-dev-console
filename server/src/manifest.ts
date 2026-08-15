import type { Selection } from './types.js';
const escapeXml = (s: string) => s.replace(/[<>&'\"]/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' }[c]!));
export function buildManifest(selections: Selection[], apiVersion = '65.0') {
  const types = selections.filter((s) => s.members.length).sort((a,b) => a.type.localeCompare(b.type)).map((s) =>
    `  <types>\n${[...new Set(s.members)].sort().map((m) => `    <members>${escapeXml(m)}</members>`).join('\n')}\n    <name>${escapeXml(s.type)}</name>\n  </types>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${types}\n  <version>${escapeXml(apiVersion)}</version>\n</Package>\n`;
}
