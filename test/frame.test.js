import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFrame } from './helpers.js';

const { devices } = JSON.parse(readFileSync(new URL('../extension/devices.json', import.meta.url), 'utf8'));
const { BUTTON_DEPTH, geometry, frameShapes, toSvg } = loadFrame();
const iphone = devices.find((d) => d.id === 'iphone-18-pro');

test('geometry puts the screen inside the bezel', () => {
  const g = geometry(iphone);
  assert.equal(g.bodyWidth, 402 + 12 + 12);
  assert.equal(g.width, g.bodyWidth + BUTTON_DEPTH * 2);
  assert.equal(g.height, 874 + 12 + 12);
  assert.deepEqual({ ...g.screen }, { x: BUTTON_DEPTH + 12, y: 12, width: 402, height: 874 });
});

test('every shape stays inside the frame', () => {
  for (const d of devices) {
    const g = geometry(d);
    for (const s of frameShapes(d)) {
      const [x0, y0, x1, y1] =
        s.type === 'circle' ? [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r] : [s.x, s.y, s.x + s.width, s.y + s.height];
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= g.width + 1e-9 && y1 <= g.height + 1e-9, `${d.id}: ${JSON.stringify(s)}`);
    }
  }
});

test('the shadow pass can use buttons + body as the silhouette', () => {
  // overlay.js draws the first buttons.length + 1 shapes with a shadow.
  for (const d of devices) {
    const shapes = frameShapes(d);
    const body = shapes[d.frame.buttons.length];
    assert.equal(body.x, BUTTON_DEPTH);
    assert.equal(body.width, geometry(d).bodyWidth);
  }
});

test('toSvg renders one element per shape', () => {
  const shapes = frameShapes(iphone);
  const svg = toSvg(shapes, 100, 200);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 100 200"/);
  assert.equal((svg.match(/<(rect|circle) /g) ?? []).length, shapes.length);
});
