import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRule } from '../extension/rules.js';

const device = {
  userAgent: 'Mozilla/5.0 (Phone)',
  headers: { 'sec-ch-ua-mobile': '?1', 'sec-ch-ua': null },
};

test('rule only applies to frames in the one tab', () => {
  const rule = buildRule(42, device);
  assert.equal(rule.id, 42);
  assert.deepEqual(rule.condition, { tabIds: [42], resourceTypes: ['sub_frame'] });
});

test('rule sends the device user agent and client hints', () => {
  const { requestHeaders } = buildRule(1, device).action;
  assert.deepEqual(requestHeaders, [
    { header: 'user-agent', operation: 'set', value: 'Mozilla/5.0 (Phone)' },
    { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
    { header: 'sec-ch-ua', operation: 'remove' },
  ]);
});

test('rule lets framing-protected pages load', () => {
  const headers = buildRule(1, device).action.responseHeaders.map((h) => `${h.operation} ${h.header}`);
  assert.deepEqual(headers, ['remove x-frame-options', 'remove content-security-policy']);
});
