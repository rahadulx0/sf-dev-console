import { app, BrowserWindow, dialog, shell } from 'electron';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let mainWindow: BrowserWindow | null = null;

function enrichPath() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];
  const existing = (process.env.PATH || '').split(path.delimiter);
  process.env.PATH = [...new Set([...candidates, ...existing])].join(path.delimiter);
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 4173;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${url}/api/system/status`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error('The local SF Dev Console server did not start.');
}

async function startApplication() {
  enrichPath();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.SF_CONSOLE_HOME = path.join(app.getPath('userData'), 'data');
  process.env.SF_DISABLE_TELEMETRY = 'true';

  const serverEntry = path.join(app.getAppPath(), 'server', 'dist', 'server.js');
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
  await dynamicImport(pathToFileURL(serverEntry).href);
  await waitForServer(url);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f4f7fb',
    title: 'SF Dev Console',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://')) void shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(startApplication).catch((error) => {
    void dialog.showErrorBox('SF Dev Console could not start', error instanceof Error ? error.message : String(error));
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
