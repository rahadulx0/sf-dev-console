import { contextBridge, ipcRenderer } from 'electron';

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'installing' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  progress?: number;
  message?: string;
};

contextBridge.exposeInMainWorld('desktopUpdater', {
  getState: (): Promise<UpdateState> => ipcRenderer.invoke('updater:get-state'),
  check: (): Promise<UpdateState> => ipcRenderer.invoke('updater:check'),
  download: (): Promise<UpdateState> => ipcRenderer.invoke('updater:download'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onState: (listener: (state: UpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState) => listener(state);
    ipcRenderer.on('updater:state', handler);
    return () => ipcRenderer.removeListener('updater:state', handler);
  },
});
