import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ['extension/frame.js', 'extension/overlay.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, globals: { ...globals.node } },
  },
  {
    // Functions passed to page.evaluate / worker.evaluate run in the browser.
    files: ['test/e2e/**/*.js', 'scripts/docs-images.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
];
