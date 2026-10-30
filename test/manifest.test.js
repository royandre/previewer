// Guards the manifest: permissions are part of the project's promise to users.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ext = new URL('../extension/', import.meta.url);
const read = (path) => readFileSync(new URL(path, ext), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('permissions are exactly the documented set', () => {
  // Changing this list? Update the "Permissions" section in README.md too.
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'declarativeNetRequestWithHostAccess', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined, 'no standing access to websites');
  assert.equal(manifest.content_scripts, undefined, 'nothing runs on pages until the user clicks');
});

test('version is semver and matches package.json', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, manifest.version);
});

test('referenced files exist', () => {
  const files = [manifest.background.service_worker, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  files.push('frame.js', 'overlay.js', 'overlay.css', 'devices.json', 'rules.js');
  for (const file of files) assert.ok(existsSync(new URL(file, ext)), file);
});

test('every locale has the same messages as English', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const locale of ['nb']) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort(), locale);
  }
});

test('every message used in code exists', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  const code = read('overlay.js') + read('background.js');
  // t('key'), getMessage('key'), and toolbar buttons whose data-action is the key.
  const used = new Set([...code.matchAll(/\bt\('([A-Za-z]+)'|getMessage\('([A-Za-z]+)'|data-action="([A-Za-z]+)"/g)].map((m) => m[1] ?? m[2] ?? m[3]));
  for (const key of used) assert.ok(en[key], key);
  for (const key of ['extName', 'extDescription', 'actionTitle']) assert.ok(en[key], key);
});
