/*
 * Renders desktop/assets/icon.svg into desktop/assets/icon.icns.
 *
 * The project has no image toolchain, and macOS ships no SVG rasteriser, so this uses the
 * Electron that is already a development dependency: an offscreen window renders the SVG,
 * the frame is captured, and `iconutil` (built into macOS) packs the sizes into an .icns.
 *
 * Run with:  npm run build:icon
 */
import { app, BrowserWindow, nativeImage } from 'electron';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const svgPath = path.join(assets, 'icon.svg');
const iconsetPath = path.join(assets, 'icon.iconset');
const icnsPath = path.join(assets, 'icon.icns');

/** Sizes required by iconutil, as [pixel size, iconset file name]. */
const VARIANTS = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

/** Reads width, height, and colour type straight from the PNG header. */
function pngInfo(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    hasAlpha: buffer.readUInt8(25) === 6,
  };
}

async function main() {
  const svg = await readFile(svgPath, 'utf8');
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:1024px;height:1024px}
  </style>${svg}`;

  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: true },
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  // Give the renderer a frame to paint the vector before capturing.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const captured = await win.webContents.capturePage();
  // Re-wrap at scale factor 1 so resize() targets exact pixels rather than display points.
  const base = nativeImage.createFromBuffer(captured.toPNG(), { scaleFactor: 1 });
  const { width } = base.getSize();
  if (width < 1024) throw new Error(`Captured ${width}px, expected at least 1024px`);

  const corner = base.toBitmap().subarray(0, 4); // BGRA of the top-left pixel
  if (corner[3] !== 0) throw new Error(`Icon corner is not transparent (alpha ${corner[3]})`);

  await rm(iconsetPath, { recursive: true, force: true });
  await mkdir(iconsetPath, { recursive: true });

  for (const [size, name] of VARIANTS) {
    const png = base.resize({ width: size, height: size, quality: 'best' }).toPNG();
    const info = pngInfo(png);
    if (info.width !== size || info.height !== size) {
      throw new Error(`${name}: expected ${size}px, produced ${info.width}x${info.height}`);
    }
    if (!info.hasAlpha) throw new Error(`${name}: no alpha channel`);
    await writeFile(path.join(iconsetPath, name), png);
  }

  await run('iconutil', ['-c', 'icns', iconsetPath, '-o', icnsPath]);
  await rm(iconsetPath, { recursive: true, force: true });

  const icns = await readFile(icnsPath);
  console.log(`Wrote ${path.relative(process.cwd(), icnsPath)} (${(icns.length / 1024).toFixed(0)} KB) from a ${width}px render`);
}

app.whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
