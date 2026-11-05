#!/usr/bin/env node
// Makes a frozen local copy of a web page: `npm run lab:copy -- <url>`.
//
//   npm run lab:copy -- https://example.com/products/shirt [--viewport desktop|phone] [--max-mb 100] [--timeout 60]
//
// Writes lab/copies/<host>-<stamp>/ (gitignored): index.html, assets/, and
// manifest.json. With `npm run dev` running, the playground serves it at
// /lab/copies/<host>-<stamp>/. See playground/README.md for what a copy keeps
// and its limits. Copy only sites you own or have permission to test.

import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS, VIEWPORTS, capturePage } from './lib/lab/capture.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE = 'usage: npm run lab:copy -- <url> [--viewport desktop|phone] [--max-mb 100] [--timeout 60]';

function positiveNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${flag} must be a positive number (got ${value}).\n${USAGE}`);
  return number;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      viewport: { type: 'string', default: 'desktop' },
      'max-mb': { type: 'string', default: String(DEFAULT_MAX_BYTES / 1024 / 1024) },
      timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_MS / 1000) },
    },
  });
  const [url] = positionals;
  if (!url || positionals.length > 1) throw new Error(USAGE);
  if (!(values.viewport in VIEWPORTS)) throw new Error(`--viewport must be one of: ${Object.keys(VIEWPORTS).join(', ')}.\n${USAGE}`);

  console.log(`Copying ${url} at ${values.viewport} width…`);
  const { name, dir, manifest } = await capturePage(url, {
    copiesDir: join(ROOT, 'lab', 'copies'),
    viewport: values.viewport,
    maxBytes: positiveNumber(values['max-mb'], '--max-mb') * 1024 * 1024,
    timeoutMs: positiveNumber(values.timeout, '--timeout') * 1000,
  });

  const { saved, failed, skipped } = manifest.files;
  const { scripts, eventHandlers, frames } = manifest.removed;
  console.log(`Saved ${relative(ROOT, dir)}/ (${plural(saved.length, 'file')} plus the page, ${mb(manifest.bytes)}).`);
  console.log(`Removed ${plural(scripts, 'script')}, ${plural(eventHandlers, 'event handler')}, and ${plural(frames, 'embedded frame')}.`);
  if (failed.length || skipped.length) {
    console.log(`${plural(failed.length + skipped.length, 'file')} could not be saved; manifest.json lists them and why.`);
  }
  console.log(`With \`npm run dev\` running, open http://127.0.0.1:4400/lab/copies/${name}/`);
  console.log('The copy is frozen: menus, carousels, and the cart do not work. playground/README.md lists the limits.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
