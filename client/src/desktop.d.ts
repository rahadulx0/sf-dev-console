type DesktopUpdateState = {
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'installing' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  progress?: number;
  message?: string;
};

interface Window {
  desktopUpdater?: {
    getState(): Promise<DesktopUpdateState>;
    check(): Promise<DesktopUpdateState>;
    download(): Promise<DesktopUpdateState>;
    install(): Promise<void>;
    onState(listener: (state: DesktopUpdateState) => void): () => void;
  };
}
