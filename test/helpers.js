import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// frame.js is a classic script that sets globalThis.PreviewerFrame.
export function loadFrame() {
  const context = {};
  vm.runInNewContext(readFileSync(new URL('../extension/frame.js', import.meta.url), 'utf8'), context);
  return context.PreviewerFrame;
}
