#!/usr/bin/env node
// Starts a private sketch: `npm run sketch -- <name> [--from landing|product|collection]`.
//
// Copies a starter page to sketches/<name>/index.html. sketches/ is gitignored,
// so nothing in it reaches the public repository. Starters link the kit's CSS
// by absolute path (/theme/assets/...), so the copy works unchanged.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(import.meta.dirname, '..');
export const STARTERS = ['landing', 'product', 'collection'];
export const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { from: { type: 'string', default: 'landing' } },
  });
  const [name] = positionals;
  if (!name || !NAME.test(name)) {
    throw new Error('usage: npm run sketch -- <name> [--from landing|product|collection]\n<name> is lowercase letters, digits, and hyphens.');
  }
  if (!STARTERS.includes(values.from)) throw new Error(`--from must be one of: ${STARTERS.join(', ')}`);

  const dir = join(ROOT, 'sketches', name);
  const target = join(dir, 'index.html');
  try {
    await stat(target);
    throw new Error(`sketches/${name}/index.html already exists; pick another name.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dir, { recursive: true });
  await copyFile(join(ROOT, 'playground', 'starters', `${values.from}.html`), target);
  console.log(`Created sketches/${name}/index.html from the ${values.from} starter.`);
  console.log(`With \`npm run dev\` running, open http://127.0.0.1:4400/sketches/${name}/`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
