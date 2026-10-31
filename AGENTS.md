# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
human-facing version.

## What this is

Previewer is a Manifest V3 Chrome extension. One click shows the current tab's page inside a phone or tablet frame and
can save a transparent PNG. Plain JavaScript, no build step, no runtime dependencies: `extension/` is loaded into Chrome
as-is and is exactly what ships in the release zip.

## Layout

```
extension/            The extension. Everything here ships.
  manifest.json       Permissions are deliberate; see "Rules" below.
  background.js       Service worker (ES module): toggle, per-tab network rule, tab capture.
  rules.js            Builds the declarativeNetRequest session rule for a tab and device.
  devices.json        All device data: viewport, user agent, client hints, frame artwork.
  frame.js            Frame geometry and shapes, rendered as SVG (overlay) and on canvas (PNG).
  overlay.js          The UI injected into the page (closed shadow root inside a modal <dialog>).
  overlay.css         Overlay styles, passed in as text and adopted as a constructable stylesheet.
  _locales/           UI strings. en is the default; every locale has the same keys.
  icons/              Generated from assets/icon.svg with `npm run icons`.
assets/               Source artwork, and demo-store.html for the README images.
scripts/              package.js (release zip), icons.js, docs-images.js, bump.js, release-notes.js.
test/                 Unit tests (node:test).
test/e2e/             End-to-end test in Chromium via Playwright.
.github/              CI, release workflow, issue and PR templates.
```

## How it works

1. `chrome.action.onClicked` (or the `_execute_action` shortcut) grants `activeTab` for the tab.
2. `background.js` adds a session rule scoped to that tab id and `sub_frame` requests (`rules.js`), then injects
   `frame.js` + `overlay.js` and calls `__previewer.open({ devices, settings, css })`.
3. The overlay loads `location.href` in a **same-origin** iframe sized to the device viewport. Same origin keeps cookies
   and lets the overlay read the framed document (status-bar colour, hiding scrollbars, keyboard shortcuts).
4. The iframe is sandboxed without `allow-top-navigation`, so frame-busting scripts can't take over the tab.
5. Screenshots: `chrome.tabs.captureVisibleTab` in the worker, then the overlay redraws the frame from the same shapes
   on a canvas and clips the captured screen into it. Edges are vector-drawn, so the PNG is cleanly transparent.
6. Closing, navigating or closing the tab removes the rule.

## Commands

```sh
npm ci                  # dev dependencies only (ESLint, Playwright)
npx playwright install chromium   # once, for the e2e test
npm run check           # lint + unit tests — run before every commit
npm run test:e2e        # loads the extension in Chromium and drives it
HEADED=1 npm run test:e2e         # watch it run
npm run package         # dist/previewer.zip
npm run docs-images     # README images in docs/, from assets/demo-store.html
```

## Rules

- **No new permissions** without a strong reason and a matching update to the Permissions table in README.md.
  `test/manifest.test.js` pins the list. Never add `host_permissions`, `<all_urls>`, `debugger`, `tabs`,
  `webNavigation`, `downloads` or `clipboardWrite` — the current design works without them.
- **No runtime dependencies and no build step.** `extension/` must load unpacked as-is.
- **No network requests** from the extension, no analytics, no remote code.
- **Device data belongs in `devices.json`**, not in code. Keep ⌘1–⌘9 in mind: at most nine devices. Cite a source for
  viewport sizes in the PR description (Apple/Google specs, or `window.innerWidth` on a real device).
- **Content-script injected code runs in arbitrary pages.** Keep everything inside the closed shadow root. Don't add
  `<style>` elements or `<img src="chrome-extension://…">` (page CSP can block them); use the adopted stylesheet and
  inline SVG. Don't load anything from the page's origin.
- **UI text** goes through `chrome.i18n` (`t('key')`) with keys in every `_locales/*/messages.json`. Write in plain
  words, sentence case, and say what a control does.
- **Style**: match the surrounding code. Two-space indent, single quotes, semicolons, ES2022+. Comments explain *why*.
- **Tests**: add or update unit tests for `frame.js`, `rules.js` and `devices.json` changes. Behaviour changes in the
  overlay get an e2e assertion in `test/e2e/preview.test.js`.
- Keep `CHANGELOG.md` → `## [Unreleased]` up to date in the same PR.

## Releasing (maintainers)

```sh
npm run bump 1.1.0      # sets manifest.json + package.json, moves Unreleased notes under 1.1.0
git commit -am "Release 1.1.0" && git tag v1.1.0 && git push && git push --tags
```

The `Release` workflow checks that the tag matches the manifest version, runs the checks, zips `extension/`, and
publishes a GitHub release with `previewer-vX.Y.Z.zip` and `previewer.zip` (the stable "latest" download link).
