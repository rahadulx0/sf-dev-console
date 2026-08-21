interface FileKind {
  label: string;
  className: string;
}

const BY_SUFFIX: [string, FileKind][] = [
  ['-meta.xml', { label: '<>', className: 'xml' }],
  ['.xml', { label: '<>', className: 'xml' }],
  ['.cls', { label: 'AP', className: 'apex' }],
  ['.trigger', { label: 'TG', className: 'trigger' }],
  ['.page', { label: 'VF', className: 'vf' }],
  ['.component', { label: 'VC', className: 'vf' }],
  ['.cmp', { label: 'AU', className: 'aura' }],
  ['.js', { label: 'JS', className: 'js' }],
  ['.html', { label: '<>', className: 'html' }],
  ['.css', { label: '#', className: 'css' }],
  ['.design', { label: '◆', className: 'meta' }],
  ['.auradoc', { label: '?', className: 'meta' }],
  ['.svg', { label: '◆', className: 'meta' }],
];

export function fileKindFor(file: string): FileKind {
  const lower = file.toLowerCase();
  for (const [suffix, kind] of BY_SUFFIX) {
    if (lower.endsWith(suffix)) return kind;
  }
  return { label: '•', className: 'meta' };
}

export function FileChip({ file }: { file: string }) {
  const kind = fileKindFor(file);
  return <span className={`file-chip file-chip-${kind.className}`}>{kind.label}</span>;
}
