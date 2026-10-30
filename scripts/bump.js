// Sets the version in manifest.json and package.json and moves the
// "Unreleased" changelog notes under the new version.
// Usage: npm run bump 1.2.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run bump <major.minor.patch>');
  process.exit(1);
}

for (const path of ['../extension/manifest.json', '../package.json']) {
  const url = new URL(path, import.meta.url);
  const json = JSON.parse(readFileSync(url, 'utf8'));
  json.version = version;
  writeFileSync(url, `${JSON.stringify(json, null, 2)}\n`);
}

const changelogUrl = new URL('../CHANGELOG.md', import.meta.url);
const today = new Date().toISOString().slice(0, 10);
const repo = 'https://github.com/royandre/previewer';
let changelog = readFileSync(changelogUrl, 'utf8');
const previous = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
changelog = changelog
  .replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${version}] - ${today}\n`)
  .replace(
    /^\[Unreleased\]: .*$/m,
    `[Unreleased]: ${repo}/compare/v${version}...HEAD\n[${version}]: ${repo}/compare/v${previous}...v${version}`,
  );
writeFileSync(changelogUrl, changelog);
console.log(`Version ${version}. Review CHANGELOG.md, then commit and tag v${version}.`);
