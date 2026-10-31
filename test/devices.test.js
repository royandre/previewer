// Checks devices.json, the file most contributions will touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFrame } from './helpers.js';

const { devices } = JSON.parse(readFileSync(new URL('../extension/devices.json', import.meta.url), 'utf8'));
const { geometry } = loadFrame();
const COLOR = /^#[0-9a-f]{6}$/i;
const LAYOUTS = ['island', 'classic', 'android', 'tablet'];

test('there are devices and ids are unique', () => {
  assert.ok(devices.length > 0);
  assert.equal(new Set(devices.map((d) => d.id)).size, devices.length);
});

test('keyboard shortcuts cover every device (⌘1–⌘9)', () => {
  assert.ok(devices.length <= 9);
});

for (const d of devices) {
  test(`${d.id}: well-formed`, () => {
    assert.match(d.id, /^[a-z0-9-]+$/);
    assert.ok(d.name.trim());
    assert.ok(Number.isInteger(d.viewport.width) && d.viewport.width > 0);
    assert.ok(Number.isInteger(d.viewport.height) && d.viewport.height > 0);
    assert.ok(d.pixelRatio >= 1);
    assert.match(d.userAgent, /^Mozilla\/5\.0 /);
    for (const [header, value] of Object.entries(d.headers ?? {})) {
      assert.match(header, /^[a-z0-9-]+$/, 'header names are lower case');
      assert.ok(value === null || typeof value === 'string');
    }

    const f = d.frame;
    for (const side of ['top', 'right', 'bottom', 'left']) assert.ok(f.bezel[side] > f.rim, `bezel.${side} is wider than the rim`);
    for (const key of ['color', 'edge', 'front']) assert.match(f[key], COLOR, `frame.${key}`);
    assert.ok(LAYOUTS.includes(f.statusBar.layout), `statusBar.layout is one of ${LAYOUTS}`);
    assert.ok(f.statusBar.height < d.viewport.height);
    assert.ok(f.screenRadius <= f.bodyRadius);
    if (f.camera) assert.ok(['top', 'right'].includes(f.camera.edge), 'camera.edge is top or right');

    const g = geometry(d);
    for (const b of f.buttons) {
      assert.ok(['left', 'right'].includes(b.side));
      assert.ok(b.top > f.bodyRadius / 2 && b.top + b.length < g.bodyHeight - f.bodyRadius / 2, 'button sits on the straight edge');
    }
  });
}
