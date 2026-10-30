// Network rules applied while a preview is open in a tab.
//
// They only touch frame documents loaded in that one tab:
// - send the phone's User-Agent and client hints, so sites that serve
//   different HTML to phones do so here too;
// - drop X-Frame-Options and Content-Security-Policy from the response,
//   so sites that refuse to be framed still load inside the phone.

export function ruleId(tabId) {
  // Session rule ids must be positive integers; tab ids already are.
  return tabId;
}

export function buildRule(tabId, device) {
  const requestHeaders = [{ header: 'user-agent', operation: 'set', value: device.userAgent }];
  for (const [header, value] of Object.entries(device.headers ?? {})) {
    requestHeaders.push(value === null ? { header, operation: 'remove' } : { header, operation: 'set', value });
  }
  return {
    id: ruleId(tabId),
    priority: 1,
    condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
    action: {
      type: 'modifyHeaders',
      requestHeaders,
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
  };
}
