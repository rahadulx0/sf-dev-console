import { useMemo } from 'react';
import { Archive, ChevronRight, Folder, FolderOpen, FolderPlus, LoaderCircle, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey } from '../../app/state';
import { fuzzyStrings } from '../../lib/fuzzy';
import { Empty, Loading } from '../../ui/primitives';
import { VirtualList } from '../../ui/VirtualList';
import { FileChip } from './FileChip';
import { componentKey, fileLabel, tabKey, type EditorTypeDef } from './types';

const TREE_ROW_HEIGHT = 28;
const EMPTY_KINDS: string[] = [];

const BUNDLE_FILE_KINDS: Record<string, string[]> = {
  LightningComponentBundle: ['STYLE'],
  AuraDefinitionBundle: ['CONTROLLER', 'HELPER', 'RENDERER', 'STYLE', 'DESIGN', 'DOCUMENTATION', 'SVG'],
};

type ExplorerRow =
  | { kind: 'component'; fullName: string }
  | { kind: 'actions'; fullName: string }
  | { kind: 'file'; fullName: string; file: string }
  | { kind: 'add'; fullName: string; fileKind: string };

export function TypeSection({
  def,
  orgId,
  query,
  open,
  onToggleOpen,
  expandedComponents,
  componentFiles,
  busyComponent,
  activeTabKey,
  onToggleComponent,
  onOpenFile,
  onRefresh,
  onBackup,
  onRename,
  onDelete,
  onAddFile,
}: {
  def: EditorTypeDef;
  orgId: string;
  query: string;
  open: boolean;
  onToggleOpen: () => void;
  expandedComponents: Set<string>;
  componentFiles: Record<string, { files: string[]; mainFile?: string }>;
  busyComponent: string | null;
  activeTabKey: string | null;
  onToggleComponent: (type: string, fullName: string) => void;
  onOpenFile: (type: string, fullName: string, file: string) => void;
  onRefresh: (type: string, fullName: string) => void;
  onBackup: (type: string, fullName: string) => void;
  onRename: (type: string, fullName: string) => void;
  onDelete: (type: string, fullName: string) => void;
  onAddFile: (type: string, fullName: string, kind: string) => void;
}) {
  const components = useResource<{ components: { fullName: string }[] }>(
    open ? orgKey(orgId, 'metadata', def.type) : null,
    (signal) => api(`${orgPath(orgId)}/metadata/${def.type}`, { signal }),
    { ttl: 300_000 },
  );
  const names = useMemo(
    () => (components.data?.components ?? []).map((component) => component.fullName).sort((left, right) => left.localeCompare(right)),
    [components.data],
  );
  const shown = useMemo(() => (query ? fuzzyStrings(names, query) : names), [names, query]);
  const bundleKinds = BUNDLE_FILE_KINDS[def.type] ?? EMPTY_KINDS;

  const rows = useMemo<ExplorerRow[]>(() => {
    const next: ExplorerRow[] = [];
    for (const fullName of shown) {
      next.push({ kind: 'component', fullName });
      const key = componentKey(def.type, fullName);
      if (!expandedComponents.has(key)) continue;
      const entry = componentFiles[key];
      if (!entry) continue;

      next.push({ kind: 'actions', fullName });
      for (const file of [...entry.files].sort(compareBundleFiles)) next.push({ kind: 'file', fullName, file });
      if (def.bundle) {
        for (const fileKind of bundleKinds) {
          const suffix = fileKind === 'STYLE' ? '.css' : '';
          if (!suffix || !entry.files.some((file) => file.endsWith(suffix))) next.push({ kind: 'add', fullName, fileKind });
        }
      }
    }
    return next;
  }, [bundleKinds, componentFiles, def.bundle, def.type, expandedComponents, shown]);

  function renderRow(row: ExplorerRow) {
    const key = componentKey(def.type, row.fullName);
    const isOpen = expandedComponents.has(key);
    const busy = busyComponent === key;

    if (row.kind === 'component') {
      return (
        <button
          className={`explorer-row explorer-component${isOpen ? ' is-open' : ''}`}
          key={`component:${row.fullName}`}
          onClick={() => onToggleComponent(def.type, row.fullName)}
          aria-expanded={isOpen}
          title={isOpen ? `Collapse ${row.fullName}` : `Reveal files in ${row.fullName}`}
        >
          <ChevronRight className="explorer-chevron" />
          {isOpen ? <FolderOpen className="explorer-folder" /> : <Folder className="explorer-folder" />}
          <span className="mono">{row.fullName}</span>
          {busy ? <LoaderCircle className="spin explorer-busy" /> : null}
        </button>
      );
    }

    if (row.kind === 'actions') {
      return (
        <div className="explorer-row explorer-actions" key={`actions:${row.fullName}`} aria-label={`Actions for ${row.fullName}`}>
          <span>Bundle actions</span>
          <button className="btn btn-ghost btn-icon btn-sm" title="Refresh from org" onClick={() => onRefresh(def.type, row.fullName)}><RefreshCw /></button>
          <button className="btn btn-ghost btn-icon btn-sm" title="Backup as ZIP" onClick={() => onBackup(def.type, row.fullName)}><Archive /></button>
          <button className="btn btn-ghost btn-icon btn-sm" title="Rename" onClick={() => onRename(def.type, row.fullName)}><Pencil /></button>
          <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => onDelete(def.type, row.fullName)}><Trash2 /></button>
        </div>
      );
    }

    if (row.kind === 'file') {
      const active = activeTabKey === tabKey(def.type, row.fullName, row.file);
      return (
        <button
          className={`explorer-row explorer-file${active ? ' is-active' : ''}`}
          key={`file:${row.fullName}:${row.file}`}
          onClick={() => onOpenFile(def.type, row.fullName, row.file)}
          aria-current={active ? 'page' : undefined}
          title={fileLabel(row.file)}
        >
          <FileChip file={row.file} />
          <span className="component-file-name">{fileLabel(row.file)}</span>
        </button>
      );
    }

    return (
      <button
        className="explorer-row explorer-file explorer-file-add"
        key={`add:${row.fullName}:${row.fileKind}`}
        onClick={() => onAddFile(def.type, row.fullName, row.fileKind)}
      >
        <FolderPlus />
        <span>Add {row.fileKind.toLowerCase()}</span>
      </button>
    );
  }

  return (
    <div className={`editor-section${open ? ' is-open' : ''}`}>
      <button className="editor-section-head" onClick={onToggleOpen} aria-expanded={open}>
        <ChevronRight className={open ? 'is-rotated' : ''} />
        <def.icon />
        <span>{def.label}</span>
        {open && !components.pending ? <span className="editor-section-count">({shown.length}/{names.length})</span> : null}
      </button>
      {open ? (
        components.pending ? (
          <Loading label="Loading…" />
        ) : !shown.length ? (
          <Empty title="No components" text="Nothing matches, or this org has none of this type." />
        ) : (
          <VirtualList
            items={rows}
            itemHeight={TREE_ROW_HEIGHT}
            height={Math.min(360, rows.length * TREE_ROW_HEIGHT)}
            className="editor-tree"
            resetKey={`${def.type}:${query}`}
            emptyState={<Empty title="No components" />}
            renderItem={renderRow}
          />
        )
      ) : null}
    </div>
  );
}

function compareBundleFiles(left: string, right: string) {
  const rank = (file: string) => {
    const name = file.toLowerCase();
    if (name.endsWith('.html') || name.endsWith('.cmp')) return 0;
    if (name.endsWith('.js')) return 1;
    if (name.endsWith('.css')) return 2;
    if (name.endsWith('-meta.xml')) return 4;
    return 3;
  };
  return rank(left) - rank(right) || fileLabel(left).localeCompare(fileLabel(right));
}
