# Privacy

Previewer does not collect, store or send any personal data.

- It makes no network requests of its own and contains no analytics or tracking.
- It runs only in the tab where you click the Previewer button or press its shortcut, and only until you close the
  preview.
- The only thing it stores is your chosen device and settings, in Chrome's local extension storage on your computer.
- Screenshots are saved to your Downloads folder or copied to your clipboard. They never leave your computer unless you
  share them.

While a preview is open, Previewer changes request headers for pages loaded inside the phone in that one tab (the
User-Agent and client hints) and removes the `X-Frame-Options` and `Content-Security-Policy` response headers so the page
can be shown in a frame. Nothing is sent anywhere else.

Questions: open an issue at https://github.com/royandre/previewer/issues.
