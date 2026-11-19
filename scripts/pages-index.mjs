#!/usr/bin/env node
// Regenerates the root of the versioned GitHub Pages site:
//   switcher.json - [{ version, url }] for main and every v* folder, newest tag first
//   index.html    - redirects to the newest v* folder, or main/ if there are no tags
//   .nojekyll     - serve folders as-is
// Usage: node scripts/pages-index.mjs <site-dir> [site-url]
// site-url (e.g. https://gilesknap.github.io/bot-areana/) makes the switcher urls absolute;
// without it they are relative to switcher.json.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, siteUrl = ''] = process.argv.slice(2);
if (!dir) {
  console.error('usage: pages-index.mjs <site-dir> [site-url]');
  process.exit(2);
}
const base = siteUrl && !siteUrl.endsWith('/') ? `${siteUrl}/` : siteUrl;

const folders = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'index.html')))
  .map((d) => d.name);
const tags = folders
  .filter((f) => /^v\d/.test(f))
  .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
const versions = [...(folders.includes('main') ? ['main'] : []), ...tags];

const switcher = versions.map((version) => ({ version, url: `${base}${version}/` }));
writeFileSync(join(dir, 'switcher.json'), `${JSON.stringify(switcher, null, 2)}\n`);

const latest = tags[0] ?? 'main';
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Bot Arena</title>
    <meta http-equiv="refresh" content="0; url=./${latest}/" />
    <script>location.replace('./${latest}/' + location.hash);</script>
  </head>
  <body><a href="./${latest}/">Bot Arena ${latest}</a></body>
</html>
`,
);
writeFileSync(join(dir, '.nojekyll'), '');
console.log(`pages-index: ${versions.join(', ') || '(none)'}; latest ${latest}`);
