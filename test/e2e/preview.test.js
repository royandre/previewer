// End-to-end test: loads the extension in Chromium, opens the preview on local
// test pages and checks what a user would see.
//
// Playwright can't click the toolbar button, and the activeTab grant only comes
// from a real click. The test therefore runs a copy of the extension with
// <all_urls> host permission and opens the preview through the service worker.
// The click-to-open path itself is checked by hand (see CONTRIBUTING.md).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../..', import.meta.url));
const shotsDir = process.env.PREVIEWER_SHOTS; // optional: save overlay screenshots here

const PAGE = (title, body, head = '') => `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}
<title>${title}</title>
<style>body{margin:0;font:16px system-ui;background:#fbf7f2;color:#2b2420}
header{position:sticky;top:0;padding:14px 16px;background:#fbf7f2;border-bottom:1px solid #eadfd3;font-weight:700}
.hero{margin:14px 16px;height:200px;border-radius:14px;background:linear-gradient(160deg,#d8b48f,#9a6b46)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;padding:0 16px 24px}
.grid div{aspect-ratio:1;border-radius:10px;background:#c58b5f}</style></head>
<body><header>${title}</header><div class="hero"></div>${body}
<div class="grid">${'<div></div>'.repeat(12)}</div></body></html>`;

let server;
let base;
let context;
let worker;
let extensionDir;
let userDataDir;
const seenUserAgents = [];

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.headers['sec-fetch-dest'] === 'iframe') seenUserAgents.push(req.headers['user-agent']);
    const send = (html, headers = {}) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
      res.end(html);
    };
    if (url.pathname === '/deny') {
      return send(PAGE('Deny', '<p id="ok">framed</p>'), {
        'x-frame-options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'",
      });
    }
    if (url.pathname === '/buster') {
      return send(PAGE('Buster', '<script>if (top !== self) top.location.href = "/escaped";</script>'));
    }
    if (url.pathname === '/escaped') return send(PAGE('Escaped', ''));
    return send(PAGE('Garnloftet', '', '<meta name="theme-color" content="#1d3557">'));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;

  extensionDir = mkdtempSync(join(tmpdir(), 'previewer-ext-'));
  cpSync(join(root, 'extension'), extensionDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  writeFileSync(join(extensionDir, 'manifest.json'), JSON.stringify(manifest));

  userDataDir = mkdtempSync(join(tmpdir(), 'previewer-profile-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !process.env.HEADED,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

after(async () => {
  await context?.close();
  server?.close();
  rmSync(extensionDir, { recursive: true, force: true });
  rmSync(userDataDir, { recursive: true, force: true });
});

let pageCount = 0;

async function openPreview(path) {
  const page = await context.newPage();
  // A unique URL per test, so the service worker finds exactly this tab.
  await page.goto(`${base}${path}?run=${++pageCount}`);
  await page.bringToFront();
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await globalThis.previewer.toggle(tab);
  }, page.url());
  const frame = await waitForPreviewFrame(page);
  return { page, frame };
}

async function waitForPreviewFrame(page) {
  for (let i = 0; i < 50; i++) {
    const frame = page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith(base));
    if (frame) {
      await frame.waitForLoadState('load');
      return frame;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('preview iframe did not appear');
}

async function shoot(page, name) {
  if (shotsDir) await page.screenshot({ path: join(shotsDir, `${name}.png`) });
}

test('shows the page at the phone width with the phone user agent', async () => {
  const { page, frame } = await openPreview('/');
  assert.equal(await frame.evaluate(() => innerWidth), 402);
  assert.match(await frame.evaluate(() => navigator.userAgent), /Chrome/, 'JS user agent is not overridden (documented)');
  assert.match(seenUserAgents.at(-1), /iPhone/);
  await page.waitForTimeout(300);
  await shoot(page, 'iphone-18-pro');

  // ⌘2 / Ctrl+2 switches device without reloading the page.
  await frame.evaluate(() => (window.__marker = 1));
  await page.keyboard.press('ControlOrMeta+2');
  await page.waitForTimeout(300);
  assert.equal(await frame.evaluate(() => innerWidth), 375);
  assert.equal(await frame.evaluate(() => window.__marker), 1, 'page was not reloaded');
  await shoot(page, 'iphone-se');

  await page.keyboard.press('ControlOrMeta+3');
  await page.waitForTimeout(300);
  assert.equal(await frame.evaluate(() => innerWidth), 412);
  await shoot(page, 'pixel-11');

  await page.keyboard.press('ControlOrMeta+4');
  await page.waitForTimeout(300);
  assert.equal(await frame.evaluate(() => innerWidth), 834);
  await shoot(page, 'ipad-pro-11');

  // Back to the default for the next tests.
  await page.keyboard.press('ControlOrMeta+1');
  await page.close();
});

test('loads sites that forbid framing', async () => {
  const { page, frame } = await openPreview('/deny');
  assert.equal(await frame.locator('#ok').textContent(), 'framed');
  await page.close();
});

test('a frame-busting script cannot take over the tab', async () => {
  const { page } = await openPreview('/buster');
  await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).pathname, '/buster');
  await page.close();
});

test('saves a transparent PNG with ⌘S / Ctrl+S', async () => {
  const { page } = await openPreview('/');
  await page.waitForTimeout(300);
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')]);
  assert.match(download.suggestedFilename(), /^127\.0\.0\.1-iphone-18-pro-\d{8}-\d{6}\.png$/);
  const file = await download.path();
  const png = readFileSync(file);
  if (shotsDir) writeFileSync(join(shotsDir, 'screenshot.png'), png);

  const pixels = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const at = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
    return { width: bitmap.width, height: bitmap.height, corner: at(0, 0), center: at(bitmap.width >> 1, bitmap.height >> 1) };
  }, png.toString('base64'));
  assert.equal(pixels.corner, 0, 'corner outside the frame is transparent');
  assert.equal(pixels.center, 255, 'screen is opaque');
  assert.ok(Math.abs(pixels.width / pixels.height - 432 / 898) < 0.01, 'PNG has the frame proportions');

  // A second screenshot of the tallest device must not include the "Saved" toast.
  await page.keyboard.press('ControlOrMeta+4');
  await page.waitForTimeout(300);
  const [second] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+s')]);
  const bottom = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    // Sample a row just above the screen's bottom edge, away from the home indicator.
    const y = Math.round(bitmap.height * (1 - 30 / 1254));
    return [0.3, 0.7].map((fx) => [...ctx.getImageData(Math.round(bitmap.width * fx), y, 1, 1).data].slice(0, 3));
  }, readFileSync(await second.path()).toString('base64'));
  for (const rgb of bottom) assert.deepEqual(rgb, [251, 247, 242], 'page background, not the toast');
  await page.keyboard.press('ControlOrMeta+1');
  await page.close();
});

test('copies the screenshot to the clipboard with ⌘C / Ctrl+C', async () => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const { page } = await openPreview('/');
  await page.waitForTimeout(300);
  await page.keyboard.press('ControlOrMeta+c');
  const types = await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      const items = await navigator.clipboard.read().catch(() => []);
      const found = items.flatMap((item) => item.types);
      if (found.includes('image/png')) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  });
  assert.ok(types.includes('image/png'));
  await page.close();
});

test('closes on Escape and removes the network rule', async () => {
  const { page } = await openPreview('/');
  assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(page.frames().length, 1);
  assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0);
  await page.close();
});
