// Prints the CHANGELOG.md section for one version, plus install steps.
// Usage: node scripts/release-notes.js 1.2.0
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/release-notes.js <version>');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const start = changelog.indexOf(`## [${version}]`);
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}
const body = changelog.slice(changelog.indexOf('\n', start) + 1);
const end = body.search(/^## \[|^\[[^\]]+\]: /m);
const notes = (end === -1 ? body : body.slice(0, end)).trim();

console.log(`${notes}

## Install or update

1. Download **previewer.zip** below and unzip it.
2. Open \`chrome://extensions\` and switch on **Developer mode**.
3. New install: click **Load unpacked** and pick the folder. Update: replace the folder's contents and click the reload icon on Previewer's card.`);
