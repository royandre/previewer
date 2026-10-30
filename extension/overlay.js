// The preview overlay. Injected into the current tab by background.js and run in
// the extension's isolated world, so the page's own scripts can't see it.
//
// The page is loaded again in a same-origin iframe sized to the device's CSS
// viewport. Same origin keeps the user's cookies and login, and lets us read the
// framed page's colours for the status bar.
(() => {
  'use strict';

  if (globalThis.__previewer) return;

  const { geometry, frameShapes, toSvg, drawShapes } = globalThis.PreviewerFrame;
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  // Space around the phone in a screenshot with shadow, in device CSS px.
  const SHADOW_PAD = { top: 40, side: 70, bottom: 110 };

  const ICONS = {
    camera: '<path d="M4 8a2 2 0 0 1 2-2h2l2-2h4l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24">${ICONS[name]}</svg>`;

  const SIGNAL = '<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
  const WIFI = '<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0z M2.9 6.3a7.3 7.3 0 0 1 10.2 0l-1.4 1.4a5.3 5.3 0 0 0-7.4 0z M.2 3.6a11.2 11.2 0 0 1 15.6 0l-1.4 1.4a9.2 9.2 0 0 0-12.8 0z"/></svg>';
  const BATTERY = '<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2"/><path d="M25 4.5v4a2 2 0 0 0 0-4z" opacity=".4"/></svg>';
  const STATUS = {
    island: `<span>9:41</span><span class="icons">${SIGNAL}${WIFI}${BATTERY}</span>`,
    classic: `<span class="icons">${SIGNAL}${WIFI}</span><span>9:41</span><span class="icons">100%${BATTERY}</span>`,
    android: `<span>9:41</span><span class="icons">${WIFI}${SIGNAL}${BATTERY}</span>`,
    tablet: `<span>9:41</span><span class="icons">${WIFI}100%${BATTERY}</span>`,
  };

  let ui = null; // everything that exists while the preview is open

  function open({ devices, settings, css }) {
    if (ui) return;

    const host = document.createElement('previewer-root');
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];

    root.innerHTML = `
      <dialog aria-label="${t('extName')}" tabindex="-1">
        <div class="bar" role="toolbar">
          <div class="seg" role="radiogroup" aria-label="${t('device')}"></div>
          <span class="sep"></span>
          <button type="button" class="primary" data-action="save">${icon('camera')}<span>${t('screenshot')}</span></button>
          <button type="button" class="icon" data-action="copy">${icon('copy')}</button>
          <button type="button" class="icon" data-action="reload">${icon('reload')}</button>
          <button type="button" class="icon" data-action="settings" aria-expanded="false">${icon('gear')}</button>
          <button type="button" class="icon" data-action="close">${icon('close')}</button>
          <div class="settings" hidden>
            ${toggle('statusBar')}
            ${toggle('frameInScreenshot')}
            ${toggle('shadowInScreenshot')}
            <div class="keys">${shortcutHelp()}</div>
          </div>
        </div>
        <div class="stage">
          <div class="phone-wrap">
            <div class="phone-box">
              <div class="phone">
                <div class="frame"></div>
                <div class="screen">
                  <div class="status"></div>
                  <iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation allow-storage-access-by-user-activation" allow="fullscreen; clipboard-write"></iframe>
                  <div class="cutout"></div>
                  <div class="home-indicator"></div>
                </div>
              </div>
            </div>
            <div class="caption"></div>
          </div>
        </div>
        <div class="toast" role="status" hidden></div>
      </dialog>`;

    const $ = (sel) => root.querySelector(sel);
    ui = {
      host,
      devices,
      settings: { ...settings },
      device: devices.find((d) => d.id === settings.deviceId) ?? devices[0],
      scale: 1,
      busy: false,
      toastTimer: 0,
      pageObserver: null,
      htmlOverflow: document.documentElement.style.overflow,
      el: {
        dialog: $('dialog'),
        seg: $('.seg'),
        settings: $('.settings'),
        settingsButton: $('[data-action="settings"]'),
        save: $('[data-action="save"]'),
        stage: $('.stage'),
        phoneBox: $('.phone-box'),
        phone: $('.phone'),
        frame: $('.frame'),
        screen: $('.screen'),
        status: $('.status'),
        iframe: $('iframe'),
        cutout: $('.cutout'),
        homeIndicator: $('.home-indicator'),
        caption: $('.caption'),
        toast: $('.toast'),
      },
    };
    const { el } = ui;

    el.seg.innerHTML = devices
      .map((d, i) => `<button type="button" role="radio" data-id="${d.id}" title="${d.name} (${keyLabel(String(i + 1))})">${d.name}</button>`)
      .join('');
    const shortcuts = { save: 'S', copy: 'C' };
    for (const button of root.querySelectorAll('[data-action]')) {
      const action = button.dataset.action; // also the i18n key
      const shortcut = shortcuts[action];
      button.title = shortcut ? `${t(action)} (${keyLabel(shortcut)})` : t(action);
      if (button.classList.contains('icon')) button.setAttribute('aria-label', t(action));
    }
    for (const input of root.querySelectorAll('.switch')) input.checked = ui.settings[input.name];

    root.addEventListener('click', onClick);
    root.addEventListener('change', onSettingChange);
    el.dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!el.settings.hidden) setSettingsOpen(false);
      else close();
    });
    el.dialog.addEventListener('keydown', onKeydown);
    el.iframe.addEventListener('load', onFrameLoad);
    ui.resizeObserver = new ResizeObserver(fit);
    ui.resizeObserver.observe(el.stage);

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.append(host);
    el.dialog.showModal();
    el.dialog.focus(); // keep the first toolbar button from showing a focus ring on open
    renderDevice();
    el.iframe.src = location.href;
  }

  function close() {
    if (!ui) return;
    ui.resizeObserver.disconnect();
    ui.pageObserver?.disconnect();
    clearTimeout(ui.toastTimer);
    document.documentElement.style.overflow = ui.htmlOverflow;
    ui.host.remove();
    ui = null;
    send({ type: 'closed' });
  }

  function toggle(name) {
    return `<label><span>${t(name)}<small>${t(name + 'Hint')}</small></span><input class="switch" type="checkbox" name="${name}"></label>`;
  }

  function keyLabel(key) {
    return isMac ? `⌘${key}` : `Ctrl+${key}`;
  }

  function shortcutHelp() {
    const k = (key) => `<kbd>${keyLabel(key)}</kbd>`;
    return [
      `${k('1')} – ${k('4')} ${t('keysDevices')}`,
      `${k('S')} ${t('keysSave')} · ${k('C')} ${t('keysCopy')}`,
      `<kbd>Esc</kbd> ${t('keysClose')}`,
    ].join('<br>');
  }

  // --- Rendering ---------------------------------------------------------------

  function renderDevice() {
    const { device: d, el } = ui;
    const f = d.frame;
    const g = geometry(d);

    el.frame.innerHTML = toSvg(frameShapes(d), g.width, g.height);
    setSize(el.phone, g.width, g.height);
    Object.assign(el.screen.style, {
      left: `${g.screen.x}px`,
      top: `${g.screen.y}px`,
      width: `${g.screen.width}px`,
      height: `${g.screen.height}px`,
      borderRadius: `${f.screenRadius}px`,
    });

    el.status.dataset.layout = f.statusBar.layout;
    el.status.style.height = `${f.statusBar.height}px`;
    el.status.innerHTML = STATUS[f.statusBar.layout] ?? '';
    el.status.classList.toggle('blank', !ui.settings.statusBar);

    // The iframe keeps its document when resized, so switching device keeps the
    // user's place on the page.
    setSize(el.iframe, d.viewport.width, d.viewport.height - f.statusBar.height);

    el.cutout.hidden = !f.cutout;
    if (f.cutout) {
      Object.assign(el.cutout.style, {
        top: `${f.cutout.top}px`,
        width: `${f.cutout.width}px`,
        height: `${f.cutout.height}px`,
      });
    }
    el.homeIndicator.hidden = !f.homeIndicator;
    el.caption.textContent = `${d.name} · ${d.viewport.width} × ${d.viewport.height}`;
    for (const b of el.seg.children) b.setAttribute('aria-checked', String(b.dataset.id === d.id));
    fit();
  }

  function setSize(node, width, height) {
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
  }

  // Scale the phone down so it always fits the window; a screenshot needs the
  // whole screen visible.
  function fit() {
    if (!ui) return;
    const g = geometry(ui.device);
    const stage = ui.el.stage.getBoundingClientRect();
    const captionSpace = 34;
    const scale = Math.min(1, (stage.height - 32 - captionSpace) / g.height, (stage.width - 32) / g.width);
    ui.scale = Math.max(0.1, scale);
    ui.el.phone.style.transform = `scale(${ui.scale})`;
    setSize(ui.el.phoneBox, g.width * ui.scale, g.height * ui.scale);
  }

  function selectDevice(id) {
    const device = ui.devices.find((d) => d.id === id);
    if (!device || device === ui.device) return;
    ui.device = device;
    ui.settings.deviceId = id;
    saveSettings();
    renderDevice();
    send({ type: 'device', deviceId: id });
  }

  // --- The framed page -------------------------------------------------------

  function frameDocument() {
    try {
      return ui.el.iframe.contentDocument;
    } catch {
      return null; // navigated to another site
    }
  }

  function onFrameLoad() {
    if (!ui) return;
    ui.pageObserver?.disconnect();
    ui.pageObserver = null;
    const doc = frameDocument();
    if (!doc?.documentElement) {
      setPageColor('#ffffff');
      return;
    }

    // Phones overlay their scrollbars; hide desktop scrollbars so the page gets
    // its full width (Windows otherwise takes ~15px of a 402px viewport).
    try {
      const sheet = new doc.defaultView.CSSStyleSheet();
      sheet.replaceSync('html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }');
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    } catch {
      // Not critical: the page just keeps its scrollbar.
    }

    doc.addEventListener('keydown', onKeydown, true);
    updatePageColor();
    if (doc.head) {
      ui.pageObserver = new MutationObserver(updatePageColor);
      ui.pageObserver.observe(doc.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'media'] });
    }
  }

  // The status bar takes the page's theme-color, or its background, like
  // Safari and Chrome do on a phone.
  function updatePageColor() {
    const doc = frameDocument();
    if (!ui || !doc) return;
    const win = doc.defaultView;
    const meta = [...doc.querySelectorAll('meta[name="theme-color"]')].find((m) => !m.media || win.matchMedia(m.media).matches);
    const candidates = [
      meta?.content,
      doc.body && win.getComputedStyle(doc.body).backgroundColor,
      win.getComputedStyle(doc.documentElement).backgroundColor,
    ];
    setPageColor(candidates.map(parseColor).find((c) => c && c.a > 0.5) ?? { r: 255, g: 255, b: 255, a: 1 });
  }

  function setPageColor(color) {
    const c = typeof color === 'string' ? parseColor(color) : color;
    const luminance = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    ui.el.screen.style.setProperty('--page-bg', `rgb(${c.r} ${c.g} ${c.b})`);
    ui.el.screen.style.setProperty('--page-fg', luminance > 0.6 ? '#000' : '#fff');
  }

  const colorCanvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function parseColor(value) {
    if (!value) return null;
    colorCanvas.clearRect(0, 0, 1, 1);
    colorCanvas.fillStyle = '#000';
    colorCanvas.fillStyle = value; // invalid values leave the previous style
    colorCanvas.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCanvas.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  }

  function reloadPage() {
    try {
      ui.el.iframe.contentWindow.location.reload();
    } catch {
      // The page navigated to another site, whose location we can't touch:
      // reload from the address the preview started on.
      ui.el.iframe.setAttribute('src', ui.el.iframe.getAttribute('src'));
    }
  }

  function pageHost() {
    try {
      return ui.el.iframe.contentWindow.location.hostname || location.hostname;
    } catch {
      return location.hostname;
    }
  }

  // --- Screenshot ------------------------------------------------------------

  async function screenshot(mode) {
    if (ui.busy) return;
    ui.busy = true;
    ui.el.save.disabled = true;
    setSettingsOpen(false);
    try {
      const blob = await renderPng();
      if (mode === 'copy') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast(t('copied'));
      } else {
        const name = fileName();
        download(blob, name);
        showToast(t('saved', [name]));
      }
    } catch (err) {
      console.warn('[Previewer]', err);
      showToast(t(mode === 'copy' ? 'copyFailed' : 'captureFailed'));
    } finally {
      if (ui) {
        ui.busy = false;
        ui.el.save.disabled = false;
      }
    }
  }

  async function renderPng() {
    // The toast can sit over a tall device's screen; hide it, and let the
    // popover close and the frame settle, before the tab is captured.
    clearTimeout(ui.toastTimer);
    ui.el.toast.hidden = true;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const response = await chrome.runtime.sendMessage({ type: 'capture' });
    if (!response?.dataUrl) throw new Error(response?.error ?? 'capture failed');
    const shot = await createImageBitmap(dataUrlToBlob(response.dataUrl));

    const { device, settings, scale } = ui;
    const g = geometry(device);
    const toShot = shot.width / window.innerWidth; // capture px per CSS px of this tab
    const px = toShot * scale; // output px per device CSS px
    const screen = ui.el.screen.getBoundingClientRect();
    const source = [screen.left * toShot, screen.top * toShot, screen.width * toShot, screen.height * toShot];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!settings.frameInScreenshot) {
      canvas.width = Math.round(g.screen.width * px);
      canvas.height = Math.round(g.screen.height * px);
      ctx.drawImage(shot, ...source, 0, 0, canvas.width, canvas.height);
      return toBlob(canvas);
    }

    const pad = settings.shadowInScreenshot ? SHADOW_PAD : { top: 0, side: 0, bottom: 0 };
    canvas.width = Math.round((g.width + pad.side * 2) * px);
    canvas.height = Math.round((g.height + pad.top + pad.bottom) * px);
    ctx.translate(pad.side * px, pad.top * px);

    const shapes = frameShapes(device);
    if (settings.shadowInScreenshot) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 60 * px;
      ctx.shadowOffsetY = 30 * px;
      drawShapes(ctx, shapes.slice(0, device.frame.buttons.length + 1), px);
      ctx.restore();
    }
    drawShapes(ctx, shapes, px);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(g.screen.x * px, g.screen.y * px, g.screen.width * px, g.screen.height * px, device.frame.screenRadius * px);
    ctx.clip();
    ctx.drawImage(shot, ...source, g.screen.x * px, g.screen.y * px, g.screen.width * px, g.screen.height * px);
    ctx.restore();
    return toBlob(canvas);
  }

  function dataUrlToBlob(dataUrl) {
    const [head, base64] = dataUrl.split(',');
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    return new Blob([bytes], { type: head.slice(5, head.indexOf(';')) });
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty canvas'))), 'image/png'));
  }

  function fileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const host = pageHost().replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '') || 'page';
    return `${host}-${ui.device.id}-${stamp}.png`;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    ui.el.dialog.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function showToast(text) {
    const { toast } = ui.el;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => {
      if (ui) toast.hidden = true;
    }, 2600);
  }

  // --- Input -----------------------------------------------------------------

  function onClick(e) {
    const deviceButton = e.target.closest('.seg button');
    if (deviceButton) return selectDevice(deviceButton.dataset.id);
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'save') screenshot('save');
    else if (action === 'copy') screenshot('copy');
    else if (action === 'reload') reloadPage();
    else if (action === 'settings') setSettingsOpen(ui.el.settings.hidden);
    else if (action === 'close') close();
    else if (!ui.el.settings.hidden && !e.target.closest('.settings')) setSettingsOpen(false);
  }

  function onSettingChange(e) {
    if (!e.target.classList.contains('switch')) return;
    ui.settings[e.target.name] = e.target.checked;
    saveSettings();
    if (e.target.name === 'statusBar') ui.el.status.classList.toggle('blank', !e.target.checked);
  }

  function setSettingsOpen(open) {
    ui.el.settings.hidden = !open;
    ui.el.settingsButton.setAttribute('aria-expanded', String(open));
  }

  // Shortcuts work both in the toolbar and inside the framed page.
  function onKeydown(e) {
    if (!ui) return;
    const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    const index = Number(key) - 1;
    if (index >= 0 && index < ui.devices.length) {
      selectDevice(ui.devices[index].id);
    } else if (key === 's') {
      screenshot('save');
    } else if (key === 'c') {
      // Inside the page, ⌘C with text selected still copies the text.
      const selection = e.target.ownerDocument?.getSelection?.();
      if (selection && !selection.isCollapsed) return;
      screenshot('copy');
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  // --- Plumbing --------------------------------------------------------------

  function saveSettings() {
    chrome.storage.local.set({ settings: ui.settings }).catch(() => {});
  }

  function send(message) {
    chrome.runtime.sendMessage(message).catch(() => {
      // The extension was reloaded or updated; nothing to tell.
    });
  }

  globalThis.__previewer = { open, close, isOpen: () => ui !== null };
})();
