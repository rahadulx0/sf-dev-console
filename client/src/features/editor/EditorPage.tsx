import { useRef, useState } from 'react';
import {
  FilePlus2,
  FileX2,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pencil,
  Save,
  Search as SearchIcon,
  Trash2,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api, errorMessage, orgPath } from '../../lib/api';
import { invalidate } from '../../lib/resource';
import { orgKey, useAppState } from '../../app/state';
import { useDebounced, useLocalStorage } from '../../lib/hooks';
import { navigate } from '../../lib/router';
import { Empty, Loading, Panel, PanelHead, SearchInput } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { CodeEditor } from './CodeEditor';
import { FileChip } from './FileChip';
import { LogsPanel } from './LogsPanel';
import { deployFailed, deployFailureMessages, type LogEntry } from './logs';
import { NewComponentModal } from './NewComponentModal';
import { TypeSection } from './TypeSection';
import { languageForFile } from './language';
import { EDITOR_TYPE_DEFS, componentKey, fileLabel, tabKey, type EditorTab } from './types';

const API_VERSION = '65.0';

export default function EditorPage() {
  const { orgId } = useAppState();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const query = useDebounced(search);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ [EDITOR_TYPE_DEFS[0].type]: true });
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());
  const [componentFiles, setComponentFiles] = useState<Record<string, { files: string[]; mainFile?: string }>>({});
  const [busyComponent, setBusyComponent] = useState<string | null>(null);

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ type: string; fullName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; fullName: string } | null>(null);
  const [deleteValue, setDeleteValue] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [wordWrap, setWordWrap] = useLocalStorage('sf-editor-wrap', false);
  const [zen, setZen] = useLocalStorage('sf-editor-zen', false);
  const [fontSize, setFontSize] = useLocalStorage('sf-editor-font-size', 13);
  const editorHandleRef = useRef<{ find: () => void } | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsHidden, setLogsHidden] = useLocalStorage('sf-editor-logs-hidden', false);

  function pushLog(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
    setLogs((current) => [...current.slice(-199), { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: Date.now() }]);
  }

  function logDeployOutcome(result: any, component: string, category: string, successMessage: string) {
    if (deployFailed(result)) {
      const messages = deployFailureMessages(result);
      if (messages.length) messages.forEach((message) => pushLog({ kind: 'ERROR', component, category, message }));
      else pushLog({ kind: 'ERROR', component, category, message: 'The org rejected the deployment.' });
      return false;
    }
    pushLog({ kind: 'SUCCESS', component, category, message: successMessage });
    return true;
  }

  const activeTab = tabs.find((tab) => tab.key === activeTabKey);

  function refreshList(type: string) {
    invalidate(orgKey(orgId, 'metadata', type));
  }

  async function openComponent(type: string, fullName: string, force = false) {
    const key = componentKey(type, fullName);
    setBusyComponent(key);
    pushLog({ kind: 'FETCH', component: fullName, category: type, message: 'Fetch process started. Please wait…' });
    try {
      const response = await api<{ type: string; fullName: string; files: string[]; mainFile?: string }>(
        `${orgPath(orgId)}/editor/open`,
        { method: 'POST', body: JSON.stringify({ type, fullName, force }) },
      );
      setComponentFiles((current) => ({ ...current, [key]: { files: response.files, mainFile: response.mainFile } }));
      pushLog({ kind: 'SUCCESS', component: fullName, category: type, message: 'Fetched successfully.' });
      return response;
    } catch (error) {
      pushLog({ kind: 'ERROR', component: fullName, category: type, message: errorMessage(error) });
      toast.error(error);
      return undefined;
    } finally {
      setBusyComponent(null);
    }
  }

  async function openFile(type: string, fullName: string, file: string) {
    const key = tabKey(type, fullName, file);
    if (tabs.some((tab) => tab.key === key)) {
      setActiveTabKey(key);
      return;
    }
    const componentEntry = componentFiles[componentKey(type, fullName)];
    const placeholder: EditorTab = {
      key,
      type,
      fullName,
      file,
      files: componentEntry?.files ?? [file],
      mainFile: componentEntry?.mainFile,
      content: '',
      original: '',
      loading: true,
      saving: false,
    };
    setTabs((current) => [...current, placeholder]);
    setActiveTabKey(key);
    try {
      const response = await api<{ file: string; content: string }>(
        `${orgPath(orgId)}/editor/file?type=${encodeURIComponent(type)}&fullName=${encodeURIComponent(fullName)}&file=${encodeURIComponent(file)}`,
      );
      setTabs((current) =>
        current.map((tab) => (tab.key === key ? { ...tab, content: response.content, original: response.content, loading: false } : tab)),
      );
    } catch (error) {
      toast.error(error);
      setTabs((current) => current.filter((tab) => tab.key !== key));
      setActiveTabKey((current) => (current === key ? null : current));
    }
  }

  async function toggleComponent(type: string, fullName: string) {
    const key = componentKey(type, fullName);
    if (expandedComponents.has(key)) {
      setExpandedComponents((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return;
    }
    setExpandedComponents((current) => new Set(current).add(key));
    if (!componentFiles[key]) await openComponent(type, fullName);
  }

  function updateTabContent(key: string, content: string) {
    setTabs((current) => current.map((tab) => (tab.key === key ? { ...tab, content } : tab)));
  }

  function closeTab(key: string) {
    setTabs((current) => current.filter((tab) => tab.key !== key));
    setActiveTabKey((current) => {
      if (current !== key) return current;
      const remaining = tabs.filter((tab) => tab.key !== key);
      return remaining.length ? remaining[remaining.length - 1].key : null;
    });
  }

  async function saveTab(key: string) {
    const tab = tabs.find((t) => t.key === key);
    if (!tab || tab.saving) return;
    setTabs((current) => current.map((t) => (t.key === key ? { ...t, saving: true } : t)));
    pushLog({ kind: 'FETCH', component: tab.fullName, category: tab.type, message: `Deploying ${fileLabel(tab.file)}. Please wait…` });
    try {
      const result = await api(`${orgPath(orgId)}/editor/file`, {
        method: 'PUT',
        body: JSON.stringify({ type: tab.type, fullName: tab.fullName, file: tab.file, content: tab.content }),
      });
      setTabs((current) => current.map((t) => (t.key === key ? { ...t, saving: false, original: t.content } : t)));
      const ok = logDeployOutcome(result, tab.fullName, tab.type, `${fileLabel(tab.file)} deployed successfully.`);
      if (ok) toast.success('Deployed', `${fileLabel(tab.file)} saved to ${orgId}`);
      else toast.error('Deploy failed', `${tab.fullName} was saved locally but the org rejected the deployment.`);
    } catch (error) {
      setTabs((current) => current.map((t) => (t.key === key ? { ...t, saving: false } : t)));
      pushLog({ kind: 'ERROR', component: tab.fullName, category: tab.type, message: errorMessage(error) });
      toast.error(error);
    }
  }

  async function createComponent(type: string, fullName: string, sobject?: string) {
    setCreating(true);
    pushLog({ kind: 'FETCH', component: fullName, category: type, message: 'Create process started. Please wait…' });
    try {
      const response = await api<{ type: string; fullName: string; files: string[]; mainFile?: string; deploy: any }>(
        `${orgPath(orgId)}/editor/create`,
        { method: 'POST', body: JSON.stringify({ type, fullName, sobject }) },
      );
      refreshList(type);
      setOpenSections((current) => ({ ...current, [type]: true }));
      setComponentFiles((current) => ({ ...current, [componentKey(type, fullName)]: { files: response.files, mainFile: response.mainFile } }));
      setExpandedComponents((current) => new Set(current).add(componentKey(type, fullName)));
      setNewOpen(false);
      if (response.mainFile) await openFile(type, fullName, response.mainFile);
      const ok = logDeployOutcome(response.deploy, fullName, type, 'Created and deployed successfully.');
      if (ok) toast.success('Component created', `${fullName} deployed to ${orgId}`);
      else toast.error('Created locally, but deploy failed', `${fullName} was not created in ${orgId}. See Logs.`);
    } catch (error) {
      pushLog({ kind: 'ERROR', component: fullName, category: type, message: errorMessage(error) });
      toast.error(error);
    } finally {
      setCreating(false);
    }
  }

  async function renameComponent() {
    if (!renameTarget) return;
    setRenameBusy(true);
    pushLog({ kind: 'FETCH', component: renameTarget.fullName, category: renameTarget.type, message: `Renaming to ${renameValue}. Please wait…` });
    try {
      const response = await api<{ type: string; fullName: string; files: string[]; mainFile?: string; created: any; deleted: any }>(
        `${orgPath(orgId)}/editor/rename`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: renameTarget.type,
            fullName: renameTarget.fullName,
            newFullName: renameValue,
            confirmation: `RENAME ${renameTarget.fullName}`,
          }),
        },
      );
      refreshList(renameTarget.type);
      setTabs((current) => current.filter((tab) => !(tab.type === renameTarget.type && tab.fullName === renameTarget.fullName)));
      setComponentFiles((current) => {
        const next = { ...current };
        delete next[componentKey(renameTarget.type, renameTarget.fullName)];
        next[componentKey(response.type, response.fullName)] = { files: response.files, mainFile: response.mainFile };
        return next;
      });
      setExpandedComponents((current) => {
        const next = new Set(current);
        next.delete(componentKey(renameTarget.type, renameTarget.fullName));
        next.add(componentKey(response.type, response.fullName));
        return next;
      });
      setRenameTarget(null);
      setRenameValue('');
      logDeployOutcome(response.created, response.fullName, response.type, `Renamed from ${renameTarget.fullName}.`);
      if (response.deleted?.error) {
        pushLog({ kind: 'ERROR', component: renameTarget.fullName, category: renameTarget.type, message: `Old component was not removed: ${response.deleted.error}` });
      } else {
        logDeployOutcome(response.deleted, renameTarget.fullName, renameTarget.type, 'Old component deleted.');
      }
      toast.success('Renamed', `${renameTarget.fullName} → ${response.fullName}. The old component was deleted from ${orgId}.`);
    } catch (error) {
      pushLog({ kind: 'ERROR', component: renameTarget.fullName, category: renameTarget.type, message: errorMessage(error) });
      toast.error(error);
    } finally {
      setRenameBusy(false);
    }
  }

  async function deleteComponent() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    pushLog({ kind: 'FETCH', component: deleteTarget.fullName, category: deleteTarget.type, message: 'Delete process started. Please wait…' });
    try {
      const result = await api(`${orgPath(orgId)}/editor/delete`, {
        method: 'POST',
        body: JSON.stringify({ type: deleteTarget.type, fullName: deleteTarget.fullName, confirmation: `DELETE ${deleteTarget.fullName}` }),
      });
      refreshList(deleteTarget.type);
      setTabs((current) => current.filter((tab) => !(tab.type === deleteTarget.type && tab.fullName === deleteTarget.fullName)));
      setComponentFiles((current) => {
        const next = { ...current };
        delete next[componentKey(deleteTarget.type, deleteTarget.fullName)];
        return next;
      });
      setExpandedComponents((current) => {
        const next = new Set(current);
        next.delete(componentKey(deleteTarget.type, deleteTarget.fullName));
        return next;
      });
      const target = deleteTarget;
      setDeleteTarget(null);
      setDeleteValue('');
      const ok = logDeployOutcome(result, target.fullName, target.type, 'Deleted successfully.');
      if (ok) toast.success('Deleted', `${target.fullName} was removed from ${orgId}`);
      else toast.error('Delete failed', `${target.fullName} may not have been removed from ${orgId}. See Logs.`);
    } catch (error) {
      pushLog({ kind: 'ERROR', component: deleteTarget.fullName, category: deleteTarget.type, message: errorMessage(error) });
      toast.error(error);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function backupComponent(type: string, fullName: string) {
    pushLog({ kind: 'FETCH', component: fullName, category: type, message: 'Backup started. Please wait…' });
    try {
      await api('/retrievals', {
        method: 'POST',
        body: JSON.stringify({
          org: orgId,
          orgLabel: orgId,
          selections: [{ type, members: [fullName] }],
          apiVersion: API_VERSION,
          downloadName: `${fullName}.zip`,
        }),
      });
      invalidate('jobs:retrievals');
      pushLog({ kind: 'SUCCESS', component: fullName, category: type, message: 'Backup queued — see Retrieval history.' });
      toast.success('Backup started', `${fullName} is being retrieved as a ZIP`, { label: 'Track it', run: () => navigate('history') });
    } catch (error) {
      pushLog({ kind: 'ERROR', component: fullName, category: type, message: errorMessage(error) });
      toast.error(error);
    }
  }

  async function addBundleFile(type: string, fullName: string, kind: string) {
    const key = componentKey(type, fullName);
    setBusyComponent(key);
    pushLog({ kind: 'FETCH', component: fullName, category: type, message: `Adding ${kind.toLowerCase()} file. Please wait…` });
    try {
      const response = await api<{ files: string[]; mainFile?: string; deploy: any }>(`${orgPath(orgId)}/editor/files`, {
        method: 'POST',
        body: JSON.stringify({ type, fullName, kind }),
      });
      setComponentFiles((current) => ({ ...current, [key]: { files: response.files, mainFile: response.mainFile } }));
      logDeployOutcome(response.deploy, fullName, type, `${kind.toLowerCase()} file added and deployed.`);
    } catch (error) {
      pushLog({ kind: 'ERROR', component: fullName, category: type, message: errorMessage(error) });
      toast.error(error);
    } finally {
      setBusyComponent(null);
    }
  }

  return (
    <>
      <div className={`code-editor-page${zen ? ' is-zen' : ''}`}>
        {!zen ? (
          <Panel className="code-editor-sidebar">
            <PanelHead title="Components" description={`Live from ${orgId}`}>
              <button className="btn btn-primary btn-icon" onClick={() => setNewOpen(true)} title="New component" aria-label="New component">
                <FilePlus2 />
              </button>
            </PanelHead>
            <div className="panel-body">
              <SearchInput value={search} onChange={setSearch} placeholder="Search components…" />
              <div className="editor-sections">
                {EDITOR_TYPE_DEFS.map((def) => (
                  <TypeSection
                    key={def.type}
                    def={def}
                    orgId={orgId}
                    query={query}
                    open={!!openSections[def.type]}
                    onToggleOpen={() => setOpenSections((current) => ({ ...current, [def.type]: !current[def.type] }))}
                    expandedComponents={expandedComponents}
                    componentFiles={componentFiles}
                    busyComponent={busyComponent}
                    activeTabKey={activeTabKey}
                    onToggleComponent={toggleComponent}
                    onOpenFile={openFile}
                    onRefresh={(type, fullName) => openComponent(type, fullName, true)}
                    onBackup={backupComponent}
                    onRename={(type, fullName) => {
                      setRenameTarget({ type, fullName });
                      setRenameValue('');
                    }}
                    onDelete={(type, fullName) => {
                      setDeleteTarget({ type, fullName });
                      setDeleteValue('');
                    }}
                    onAddFile={addBundleFile}
                  />
                ))}
              </div>
            </div>
          </Panel>
        ) : null}

        <Panel className="code-editor-main">
          <div className="code-editor-tabbar">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`code-editor-tab${activeTabKey === tab.key ? ' is-active' : ''}`}
                onClick={() => setActiveTabKey(tab.key)}
              >
                <FileChip file={tab.file} />
                {tab.content !== tab.original ? <span className="code-editor-dirty-dot" /> : null}
                <span className="mono">{fileLabel(tab.file)}</span>
                <span
                  className="code-editor-tab-close"
                  role="button"
                  aria-label={`Close ${tab.file}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.key);
                  }}
                >
                  <X />
                </span>
              </button>
            ))}
          </div>

          {activeTab ? (
            <div className="code-editor-toolbar">
              <span className="hint-inline mono">
                {activeTab.type} / {activeTab.fullName} / {fileLabel(activeTab.file)}
              </span>
              <span className="code-editor-toolbar-actions">
                <button className="btn btn-ghost btn-icon" title="Find" onClick={() => editorHandleRef.current?.find()}>
                  <SearchIcon />
                </button>
                <button
                  className={`btn btn-ghost btn-icon${wordWrap ? ' is-active' : ''}`}
                  title="Toggle word wrap"
                  onClick={() => setWordWrap((v) => !v)}
                >
                  <WrapText />
                </button>
                <button className="btn btn-ghost btn-icon" title="Zoom out" onClick={() => setFontSize((v) => Math.max(10, v - 1))}>
                  <ZoomOut />
                </button>
                <button className="btn btn-ghost btn-icon" title="Zoom in" onClick={() => setFontSize((v) => Math.min(24, v + 1))}>
                  <ZoomIn />
                </button>
                <button className="btn btn-ghost btn-icon" title={zen ? 'Exit zen mode' : 'Zen mode'} onClick={() => setZen((v) => !v)}>
                  {zen ? <Minimize2 /> : <Maximize2 />}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={activeTab.saving || activeTab.content === activeTab.original}
                  onClick={() => saveTab(activeTab.key)}
                >
                  {activeTab.saving ? <LoaderCircle className="spin" /> : <Save />} Save &amp; deploy
                </button>
              </span>
            </div>
          ) : null}

          <div className="code-editor-body">
            {!activeTab ? (
              <Empty icon={FileX2} title="No file open" text="Pick a component from the sidebar, or create a new one." />
            ) : activeTab.loading ? (
              <Loading label="Loading file…" />
            ) : (
              <CodeEditor
                key={activeTab.key}
                value={activeTab.content}
                language={languageForFile(activeTab.file)}
                wordWrap={wordWrap}
                fontSize={fontSize}
                onChange={(value) => updateTabContent(activeTab.key, value)}
                onSave={() => saveTab(activeTab.key)}
                editorRef={(handle) => (editorHandleRef.current = handle)}
              />
            )}
          </div>

          <LogsPanel
            logs={logs}
            hidden={logsHidden}
            onClear={() => setLogs([])}
            onClose={() => setLogsHidden(true)}
            onShow={() => setLogsHidden(false)}
          />
        </Panel>
      </div>

      {newOpen ? (
        <NewComponentModal
          initialType={activeTab?.type ?? EDITOR_TYPE_DEFS[0].type}
          busy={creating}
          onClose={() => setNewOpen(false)}
          onCreate={createComponent}
        />
      ) : null}

      {renameTarget ? (
        <ConfirmDialog
          icon={Pencil}
          title={`Rename ${renameTarget.fullName}`}
          description={
            <>
              Salesforce has no true rename for this metadata type. This deploys <b>{renameValue || 'the new name'}</b> as a new
              component, then deletes <b>{renameTarget.fullName}</b>. Anything referencing the old name elsewhere in the org will break.
            </>
          }
          phrase={`RENAME ${renameTarget.fullName}`}
          confirmLabel="Rename"
          value={renameValue}
          onChange={setRenameValue}
          onConfirm={renameComponent}
          onClose={() => setRenameTarget(null)}
          busy={renameBusy}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          icon={Trash2}
          title={`Delete ${deleteTarget.fullName}`}
          description={
            <>
              This permanently deletes <b>{deleteTarget.fullName}</b> from <b>{orgId}</b> via a destructive-changes deployment.
              Consider a backup first.
            </>
          }
          phrase={`DELETE ${deleteTarget.fullName}`}
          confirmLabel="Delete"
          value={deleteValue}
          onChange={setDeleteValue}
          onConfirm={deleteComponent}
          onClose={() => setDeleteTarget(null)}
          busy={deleteBusy}
        />
      ) : null}
    </>
  );
}
