// Service worker: opens and closes the preview, keeps the per-tab network rule
// in step with the chosen device, and captures the tab for screenshots.
import { buildRule, ruleId } from './rules.js';

const DEFAULT_SETTINGS = {
  deviceId: 'iphone-18-pro',
  statusBar: true,
  frameInScreenshot: true,
  shadowInScreenshot: false,
};

let assets; // devices.json and overlay.css, loaded once per service worker life

async function loadAssets() {
  assets ??= Promise.all([
    fetch(chrome.runtime.getURL('devices.json')).then((r) => r.json()),
    fetch(chrome.runtime.getURL('overlay.css')).then((r) => r.text()),
  ]).then(([{ devices }, css]) => ({ devices, css }));
  return assets;
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function toggle(tab) {
  const target = { tabId: tab.id };
  try {
    const [{ result: isOpen }] = await chrome.scripting.executeScript({
      target,
      func: () => Boolean(globalThis.__previewer?.isOpen()),
    });
    if (isOpen) {
      await chrome.scripting.executeScript({ target, func: () => globalThis.__previewer.close() });
      return;
    }

    const [{ devices, css }, settings] = await Promise.all([loadAssets(), loadSettings()]);
    const device = devices.find((d) => d.id === settings.deviceId) ?? devices[0];
    // The rule must be in place before the overlay sets the iframe's src.
    await applyRule(tab.id, device);
    await chrome.scripting.executeScript({ target, files: ['frame.js', 'overlay.js'] });
    await chrome.scripting.executeScript({
      target,
      func: (options) => globalThis.__previewer.open(options),
      args: [{ devices, settings, css }],
    });
  } catch (err) {
    // chrome:// pages, the Chrome Web Store and other pages extensions can't touch.
    console.warn('[Previewer]', err);
    await removeRule(tab.id);
    await flagUnsupported(tab.id);
  }
}

async function applyRule(tabId, device) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId(tabId)],
    addRules: [buildRule(tabId, device)],
  });
}

async function removeRule(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId(tabId)] });
}

async function flagUnsupported(tabId) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setTitle({ tabId, title: chrome.i18n.getMessage('unsupportedPage') });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    chrome.action.setTitle({ tabId, title: '' }).catch(() => {});
  }, 4000);
}

async function onMessage(message, sender) {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return {};
  switch (message.type) {
    case 'device': {
      const { devices } = await loadAssets();
      const device = devices.find((d) => d.id === message.deviceId);
      if (device) await applyRule(tabId, device);
      return {};
    }
    case 'capture':
      try {
        return { dataUrl: await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }) };
      } catch (err) {
        return { error: String(err?.message ?? err) };
      }
    case 'closed':
      await removeRule(tabId);
      return {};
    default:
      return {};
  }
}

chrome.action.onClicked.addListener(toggle);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  onMessage(message, sender).then(sendResponse);
  return true; // async response
});

// Drop the rule once the preview is gone. Without the "tabs" permission Chrome
// doesn't say which frame or URL is loading, so ask the tab's top frame: after
// the tab navigates away, the overlay script no longer exists to answer.
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (change.status !== 'complete') return;
  const rules = await chrome.declarativeNetRequest.getSessionRules({ ruleIds: [ruleId(tabId)] });
  if (rules.length === 0) return;
  const open = await chrome.tabs.sendMessage(tabId, { type: 'isOpen' }, { frameId: 0 }).catch(() => false);
  if (!open) await removeRule(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => removeRule(tabId).catch(() => {}));

// Handle for the end-to-end tests and for debugging from the service worker console.
globalThis.previewer = { toggle };
