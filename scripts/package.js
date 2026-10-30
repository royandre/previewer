// Zips extension/ into dist/ for a release.
// Writes previewer-v<version>.zip and previewer.zip (the stable name that
// https://github.com/royandre/previewer/releases/latest/download/previewer.zip points to).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(`${root}extension/manifest.json`, 'utf8'));

const tag = process.env.GITHUB_REF_NAME;
if (tag && tag.startsWith('v') && tag !== `v${version}`) {
  console.error(`Tag ${tag} does not match manifest version ${version}.`);
  process.exit(1);
}

const dist = `${root}dist`;
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
const versioned = `${dist}/previewer-v${version}.zip`;
execFileSync('zip', ['-r', '-X', '-q', versioned, '.', '-x', '.*', '-x', '*/.*'], { cwd: `${root}extension`, stdio: 'inherit' });
copyFileSync(versioned, `${dist}/previewer.zip`);
console.log(`dist/previewer-v${version}.zip\ndist/previewer.zip`);
