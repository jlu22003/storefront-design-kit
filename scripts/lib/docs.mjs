// Renders the catalog docs to disk, or checks that the committed copies are current.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCatalog, validateCatalog } from './catalog.mjs';
import { renderAll } from './render.mjs';

export const CATALOG_DIR = join(import.meta.dirname, '..', '..', 'catalog');

// Line endings are normalised so a Windows checkout with autocrlf is not stale.
const normalise = (text) => text.replace(/\r\n/g, '\n');

/**
 * Renders the docs for the catalog in `dir`. With `check`, writes nothing and
 * returns the files that differ; otherwise writes them all.
 */
export async function catalogDocs({ dir = CATALOG_DIR, check = false } = {}) {
  const catalog = await loadCatalog(dir);
  const errors = validateCatalog(catalog);
  if (errors.length) return { errors, stale: [], written: [] };

  const stale = [];
  const written = [];
  for (const [name, content] of Object.entries(renderAll(catalog))) {
    const path = join(dir, name);
    if (check) {
      const current = await readFile(path, 'utf8').catch(() => null);
      if (current === null || normalise(current) !== content) stale.push(name);
    } else {
      await writeFile(path, content);
      written.push(name);
    }
  }
  return { errors, stale, written };
}
