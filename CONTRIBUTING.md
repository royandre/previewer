# Contributing

Thanks for helping make Previewer better. Small, focused pull requests are the easiest to review and merge.

## Before you start

- **Bug?** [Open a bug report](https://github.com/royandre/previewer/issues/new?template=bug_report.yml) with the page
  URL if it's public, your Chrome version and what you expected.
- **Device wrong or missing?** [Open a device request](https://github.com/royandre/previewer/issues/new?template=device.yml)
  or send a pull request that edits `extension/devices.json`.
- **New feature?** Open an issue first so we can agree on it. Previewer stays deliberately small: a few devices, a few
  settings, one click.

## Set up

You need Node.js 20 or newer and Chrome.

```sh
git clone https://github.com/royandre/previewer.git
cd previewer
npm ci
npx playwright install chromium
```

Load the extension: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the
`extension/` folder. After you change a file, click the reload icon on Previewer's card and reload the tab you're
testing on.

There is no build step. What's in `extension/` is what ships.

## Check your change

```sh
npm run check       # ESLint + unit tests
npm run test:e2e    # loads the extension in Chromium and drives it (HEADED=1 to watch)
```

The end-to-end test opens the preview through the service worker, because automated browsers can't click the toolbar
button. If you touch how the preview opens, also test by hand in Chrome:

1. Load the unpacked extension.
2. Open a site that blocks framing (for example `https://github.com`) and click the Previewer button.
3. Check that the page shows in the phone, switch devices with ⌘1–⌘4 / Ctrl+1–4, and save with ⌘S / Ctrl+S.
4. Close with Esc and check that the page underneath scrolls again.

## Adding or fixing a device

Everything about a device lives in [`extension/devices.json`](extension/devices.json):

| Field         | Meaning                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `id`          | Lower-case slug, used in screenshot file names.                                 |
| `name`        | What the toolbar shows.                                                         |
| `viewport`    | CSS pixel size of the full screen in the orientation shown (`screen.width × screen.height`). |
| `pixelRatio`  | The device's `devicePixelRatio`. Informational.                                 |
| `userAgent`   | The User-Agent the device's default browser sends.                              |
| `headers`     | Extra request headers; `null` removes the header (Safari sends no client hints). |
| `frame`       | Artwork: bezel widths, corner radii, colours, status bar layout, cutout, buttons. |

Please say in the pull request where the viewport size comes from: the manufacturer's spec, or `window.innerWidth` and
`window.innerHeight` measured on a real device. `npm test` checks that the entry is complete and that buttons sit on the
phone's straight edges. Take a screenshot with the new frame and add it to the pull request.

Keep the list short. Every device costs a toolbar slot and a keyboard shortcut, so a new device should cover a screen
size the current ones don't.

## Code style

- Plain JavaScript (ES2022+), two-space indent, single quotes, semicolons. ESLint enforces the basics.
- Match the code around you. Comments explain why, not what.
- UI text goes through `chrome.i18n`: add the key to every file in `extension/_locales/`. English is the default.
- No new permissions, runtime dependencies or network requests. See [AGENTS.md](AGENTS.md) for the reasons.

## Pull requests

- One change per pull request, with a short description of what and why.
- Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- CI must pass. A maintainer reviews, then squashes and merges.

By contributing you agree that your work is released under the [MIT License](LICENSE) and that you follow the
[code of conduct](CODE_OF_CONDUCT.md).
