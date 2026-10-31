// Renders the README images, docs/overlay.png and docs/devices.png, by running
// the extension in Chromium on assets/demo-store.html (a made-up shop).
// Run after changing the toolbar or a device: npm run docs-images
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = readFileSync(join(root, 'assets/demo-store.html'), 'utf8');
const { devices } = JSON.parse(readFileSync(join(root, 'extension/devices.json'), 'utf8'));
const SHADOW_SIDE = 70; // overlay.js SHADOW_PAD.side, in device CSS px

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Like the e2e test: a copy with <all_urls>, since only a real click grants activeTab.
const extensionDir = mkdtempSync(join(tmpdir(), 'previewer-ext-'));
cpSync(join(root, 'extension'), extensionDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(join(extensionDir, 'manifest.json'), JSON.stringify(manifest));

async function openPreview(viewport, settings) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'previewer-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    viewport,
    deviceScaleFactor: 2,
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
  const tab = await context.newPage();
  await tab.goto(url);
  await tab.bringToFront();
  await worker.evaluate(async (u) => {
    const [t] = await chrome.tabs.query({ url: u });
    await globalThis.previewer.toggle(t);
  }, tab.url());
  await tab.waitForTimeout(1200);
  return {
    tab,
    close: async () => {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

// The overlay, wide enough that the toolbar shows its shortcut labels.
{
  const { tab, close } = await openPreview({ width: 1200, height: 840 }, {});
  await tab.screenshot({ path: join(root, 'docs/overlay.png') });
  await close();
}

// Each device saved with Previewer's own Screenshot, then laid out in a row at
// one common scale, bottoms aligned.
{
  const { tab, close } = await openPreview({ width: 1800, height: 1300 }, { shadowInScreenshot: true });
  const pngs = [];
  for (let i = 0; i < devices.length; i++) {
    await tab.keyboard.press(`ControlOrMeta+${i + 1}`);
    await tab.waitForTimeout(600);
    const [download] = await Promise.all([tab.waitForEvent('download'), tab.keyboard.press('ControlOrMeta+s')]);
    pngs.push(readFileSync(await download.path()).toString('base64'));
    await tab.waitForTimeout(2800); // the toast must be gone before the next capture
  }
  // Each PNG's width in device CSS px: frame plus the shadow padding.
  const widths = devices.map((d) => d.viewport.width + d.frame.bezel.left + d.frame.bezel.right + 6 + SHADOW_SIDE * 2);
  const base64 = await tab.evaluate(async ({ pngs, widths }) => {
    const bitmaps = await Promise.all(pngs.map(async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())));
    const scale = 0.95; // output px per device CSS px
    const overlap = 60 * scale; // the shadow padding already spaces them out
    const sizes = bitmaps.map((b, i) => [widths[i] * scale, (widths[i] * scale * b.height) / b.width]);
    const width = Math.round(sizes.reduce((sum, [w]) => sum + w, 0) - overlap * (sizes.length - 1));
    const height = Math.round(Math.max(...sizes.map(([, h]) => h)));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    let x = 0;
    bitmaps.forEach((b, i) => {
      const [w, h] = sizes[i];
      ctx.drawImage(b, x, height - h, w, h);
      x += w - overlap;
    });
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const dataUrl = await new Promise((r) => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result);
      reader.readAsDataURL(blob);
    });
    return dataUrl.split(',')[1];
  }, { pngs, widths });
  writeFileSync(join(root, 'docs/devices.png'), Buffer.from(base64, 'base64'));
  await close();
}

server.close();
rmSync(extensionDir, { recursive: true, force: true });
