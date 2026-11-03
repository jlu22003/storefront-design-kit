#!/usr/bin/env node
// Builds the live-site design panel bookmarklet: `npm run bookmarklet`.
//
// Writes dist/bookmarklet.txt (the javascript: URL to save as a bookmark) and
// dist/bookmarklet.js (the same code, readable). The playground's
// /playground/bookmarklet.html page builds the same thing in the browser.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildBookmarklet } from '../playground/dev/bookmarklet.js';

const ROOT = resolve(import.meta.dirname, '..');

async function main() {
  const { code, url } = await buildBookmarklet((path) => readFile(join(ROOT, path), 'utf8'));
  const out = join(ROOT, 'dist');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'bookmarklet.txt'), `${url}\n`);
  await writeFile(join(out, 'bookmarklet.js'), `${code}\n`);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`Wrote dist/bookmarklet.txt (${kb(url.length)}) and dist/bookmarklet.js (${kb(code.length)}).`);
  console.log('Make a bookmark and paste the contents of dist/bookmarklet.txt as its URL,');
  console.log('or open /playground/bookmarklet.html with `npm run dev` running and drag the link to your bookmarks bar.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
