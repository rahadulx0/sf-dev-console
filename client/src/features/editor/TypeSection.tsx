import { useMemo } from 'react';
import { Archive, ChevronRight, FolderPlus, LoaderCircle, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { api, orgPath } from '../../lib/api';
import { useResource } from '../../lib/resource';
import { orgKey } from '../../app/state';
import { fuzzyStrings } from '../../lib/fuzzy';
import { Empty, Loading } from '../../ui/primitives';
import { VirtualList } from '../../ui/VirtualList';
import { FileChip } from './FileChip';
import { componentKey, fileLabel, tabKey, type EditorTypeDef } from './types';

const BUNDLE_FILE_KINDS: Record<string, string[]> = {
  LightningComponentBundle: ['STYLE'],
  AuraDefinitionBundle: ['CONTROLLER', 'HELPER', 'RENDERER', 'STYLE', 'DESIGN', 'DOCUMENTATION', 'SVG'],
};

export function TypeSection({
  def,
  orgId,
  query,
  open,
  onToggleOpen,
  expandedComponent,
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
  expandedComponent: string | null;
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
    () => (components.data?.components ?? []).map((c) => c.fullName).sort((a, b) => a.localeCompare(b)),
    [components.data],
  );
  const shown = useMemo(() => (query ? fuzzyStrings(names, query) : names), [names, query]);
  const bundleKinds = BUNDLE_FILE_KINDS[def.type] ?? [];

  return (
    <div className={`editor-section${open ? ' is-open' : ''}`}>
      <button className="editor-section-head" onClick={onToggleOpen}>
        <ChevronRight className={open ? 'is-rotated' : ''} />
        <def.icon />
        <span>{def.label}</span>
        {open && !components.pending ? (
          <span className="editor-section-count">
            ({shown.length}/{names.length})
          </span>
        ) : null}
      </button>
      {open ? (
        components.pending ? (
          <Loading label="Loading…" />
        ) : !shown.length ? (
          <Empty title="No components" text="Nothing matches, or this org has none of this type." />
        ) : (
          <VirtualList
            items={shown}
            itemHeight={30}
            height={Math.min(320, shown.length * 30)}
            className="type-list"
            emptyState={<Empty title="No components" />}
            renderItem={(fullName) => {
              const key = componentKey(def.type, fullName);
              const isOpen = expandedComponent === key;
              const entry = componentFiles[key];
              const busy = busyComponent === key;
              return (
                <div className={`type${isOpen ? ' is-open' : ''}`} key={fullName}>
                  <button className="type-head" onClick={() => onToggleComponent(def.type, fullName)}>
                    <ChevronRight className={isOpen ? 'is-rotated' : ''} />
                    <span className="mono">{fullName}</span>
                    {busy ? <LoaderCircle className="spin" /> : null}
                  </button>
                  {isOpen ? (
                    <div className="type-body">
                      <div className="component-actions">
                        <button className="btn btn-ghost btn-icon" title="Refresh from org" onClick={() => onRefresh(def.type, fullName)}>
                          <RefreshCw />
                        </button>
                        <button className="btn btn-ghost btn-icon" title="Backup as ZIP" onClick={() => onBackup(def.type, fullName)}>
                          <Archive />
                        </button>
                        <button className="btn btn-ghost btn-icon" title="Rename" onClick={() => onRename(def.type, fullName)}>
                          <Pencil />
                        </button>
                        <button className="btn btn-ghost btn-icon" title="Delete" onClick={() => onDelete(def.type, fullName)}>
                          <Trash2 />
                        </button>
                      </div>
                      {entry?.files.map((file) => (
                        <button
                          key={file}
                          className={`component-file${activeTabKey === tabKey(def.type, fullName, file) ? ' is-active' : ''}`}
                          onClick={() => onOpenFile(def.type, fullName, file)}
                        >
                          <FileChip file={file} />
                          <span className="component-file-name">{fileLabel(file)}</span>
                        </button>
                      ))}
                      {def.bundle && entry
                        ? bundleKinds
                            .filter((kind) => {
                              const suffix = kind === 'STYLE' ? '.css' : '';
                              return suffix ? !entry.files.some((f) => f.endsWith(suffix)) : true;
                            })
                            .map((kind) => (
                              <button key={kind} className="component-file component-file-add" onClick={() => onAddFile(def.type, fullName, kind)}>
                                <FolderPlus /> Add {kind.toLowerCase()}
                              </button>
                            ))
                        : null}
                    </div>
                  ) : null}
                </div>
              );
            }}
          />
        )
      ) : null}
    </div>
  );
}
