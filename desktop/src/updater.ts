import { app, BrowserWindow, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OWNER = 'rahadulx0';
const REPO = 'sf-dev-console';

type ReleaseAsset = { name: string; browser_download_url: string; size: number };
type Release = { tag_name: string; name: string; body: string; draft: boolean; prerelease: boolean; assets: ReleaseAsset[] };
export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'installing' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  progress?: number;
  message?: string;
};

let release: Release | undefined;
let dmgPath = '';
let state: UpdateState = { status: 'idle', currentVersion: app.getVersion() };

function publish(next: Partial<UpdateState>) {
  state = { ...state, ...next };
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('updater:state', state);
  return state;
}

function numbers(version: string) {
  return version.replace(/^v/i, '').split(/[.+-]/).map(part => Number.parseInt(part, 10) || 0);
}

function newer(candidate: string, current: string) {
  const a = numbers(candidate); const b = numbers(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

function matchingDmg(assets: ReleaseAsset[]) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return assets.find(asset => asset.name.toLowerCase().endsWith('.dmg') && asset.name.toLowerCase().includes(arch))
    || assets.find(asset => asset.name.toLowerCase().endsWith('.dmg') && !/(arm64|x64|intel)/i.test(asset.name));
}

async function check() {
  publish({ status: 'checking', message: 'Checking GitHub Releases…', progress: undefined });
  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${REPO}/${app.getVersion()}` },
    });
    if (!response.ok) throw new Error(response.status === 404 ? 'No published GitHub release was found.' : `GitHub returned ${response.status}.`);
    release = await response.json() as Release;
    const available = newer(release.tag_name, app.getVersion());
    return publish({
      status: available ? 'available' : 'current',
      latestVersion: release.tag_name.replace(/^v/i, ''),
      releaseName: release.name || release.tag_name,
      releaseNotes: release.body || '',
      message: available ? 'A new version is ready to download.' : 'You have the latest version.',
    });
  } catch (error) {
    return publish({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

async function sha256(file: string) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function download() {
  if (!release) await check();
  if (!release || state.status === 'error') return state;
  const asset = matchingDmg(release.assets);
  if (!asset) return publish({ status: 'error', message: 'This release does not contain a macOS DMG.' });
  try {
    publish({ status: 'downloading', progress: 0, message: `Downloading ${asset.name}…` });
    const response = await fetch(asset.browser_download_url, { headers: { 'User-Agent': `${REPO}/${app.getVersion()}` } });
    if (!response.ok || !response.body) throw new Error(`Download failed with status ${response.status}.`);
    const total = Number(response.headers.get('content-length')) || asset.size;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length;
      publish({ status: 'downloading', progress: total ? Math.min(100, Math.round(received / total * 100)) : undefined });
    }
    const directory = path.join(app.getPath('userData'), 'updates');
    await mkdir(directory, { recursive: true });
    dmgPath = path.join(directory, asset.name);
    await writeFile(dmgPath, Buffer.concat(chunks));

    const checksumAsset = release.assets.find(item => item.name === `${asset.name}.sha256` || item.name === 'SHA256SUMS');
    if (checksumAsset) {
      const checksumResponse = await fetch(checksumAsset.browser_download_url, { headers: { 'User-Agent': `${REPO}/${app.getVersion()}` } });
      if (!checksumResponse.ok) throw new Error('The update checksum could not be downloaded.');
      const checksumText = await checksumResponse.text();
      const expected = checksumText.match(new RegExp(`([a-fA-F0-9]{64})\\s+[*]?${asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))?.[1]
        || checksumText.trim().match(/^[a-fA-F0-9]{64}/)?.[0];
      if (!expected || (await sha256(dmgPath)).toLowerCase() !== expected.toLowerCase()) throw new Error('The downloaded update failed checksum verification.');
    }
    return publish({ status: 'ready', progress: 100, message: 'Update downloaded and ready to install.' });
  } catch (error) {
    return publish({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

function quote(value: string) { return `'${value.replaceAll("'", "'\\''")}'`; }

async function install() {
  if (!dmgPath || state.status !== 'ready') throw new Error('Download the update before installing it.');
  const actualHelperDir = path.join(os.tmpdir(), `${REPO}-installer-${process.pid}`);
  await mkdir(actualHelperDir, { recursive: true });
  const scriptPath = path.join(actualHelperDir, 'install-update.sh');
  const mountPath = path.join(actualHelperDir, 'mounted');
  const target = '/Applications/SF Dev Console.app';
  const command = `set -e\nMOUNT=${quote(mountPath)}\nDMG=${quote(dmgPath)}\nTARGET=${quote(target)}\nmkdir -p "$MOUNT"\ncleanup() { hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; }\ntrap cleanup EXIT\nhdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT" -quiet\nSOURCE=$(find "$MOUNT" -maxdepth 1 -name 'SF Dev Console.app' -print -quit)\n[ -n "$SOURCE" ] || exit 2\n/usr/bin/osascript - "$SOURCE" "$TARGET" <<'APPLESCRIPT'\non run argv\n  set sourcePath to item 1 of argv\n  set targetPath to item 2 of argv\n  set backupPath to targetPath & ".update-backup"\n  set installCommand to "/bin/rm -rf " & quoted form of backupPath & "; if [ -e " & quoted form of targetPath & " ]; then /bin/mv " & quoted form of targetPath & " " & quoted form of backupPath & "; fi; if /usr/bin/ditto " & quoted form of sourcePath & " " & quoted form of targetPath & "; then /bin/rm -rf " & quoted form of backupPath & "; else /bin/rm -rf " & quoted form of targetPath & "; if [ -e " & quoted form of backupPath & " ]; then /bin/mv " & quoted form of backupPath & " " & quoted form of targetPath & "; fi; exit 1; fi"\n  do shell script installCommand with administrator privileges\nend run\nAPPLESCRIPT\nopen "$TARGET"\n`;
  await writeFile(scriptPath, command, { mode: 0o700 });
  await chmod(scriptPath, 0o700);
  publish({ status: 'installing', message: 'Installing update and restarting…' });
  const child = spawn('/bin/zsh', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.quit(), 400);
}

export function registerUpdater() {
  ipcMain.handle('updater:get-state', () => state);
  ipcMain.handle('updater:check', () => check());
  ipcMain.handle('updater:download', () => download());
  ipcMain.handle('updater:install', () => install());
}
