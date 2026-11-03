// Writes the generated token outputs, or checks that the committed ones are current.
//
// Each output is { path, render(model), committed }. To add an emitter (for example the
// C header dist/sdk_tokens.h planned for the Clay toolkit), add an entry here with a
// render function that takes the same model; nothing else changes.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { renderCss } from './css.mjs';
import { loadModel, TOKENS_DIR } from './tokens.mjs';

export const ROOT = join(import.meta.dirname, '..', '..');

/** A resolved, flat view of the tokens for tests and tools: { core: { name: value }, modes: { id: { name: value } } }. */
export function renderJson(model) {
  const flat = (tokens) => Object.fromEntries(tokens.map((token) => [token.name, { type: token.type, value: token.value }]));
  const modes = Object.fromEntries(Object.entries(model.modes).map(([id, tokens]) => [id, flat(tokens)]));
  return `${JSON.stringify({ core: flat(model.core), modes }, null, 2)}\n`;
}

/**
 * The outputs, relative to the repo root. `committed` outputs are tracked in git and
 * checked by --check; the rest land in dist/, which is ignored.
 * The theme copy is committed because Shopify's GitHub integration deploys files as-is.
 */
export const OUTPUTS = [
  { path: 'dist/sdk-tokens.css', render: renderCss, committed: false },
  { path: 'dist/tokens.json', render: renderJson, committed: false },
  { path: 'theme/assets/sdk-tokens.css', render: renderCss, committed: true },
];

// Line endings are normalised so a Windows checkout with autocrlf is not stale.
const normalise = (text) => text.replace(/\r\n/g, '\n');

/**
 * Builds the tokens in `tokensDir`. With `check`, writes nothing and returns the
 * committed outputs under `root` that are missing or differ; otherwise writes every output.
 */
export async function buildTokens({ tokensDir = TOKENS_DIR, root = ROOT, check = false, outputs = OUTPUTS } = {}) {
  const model = await loadModel(tokensDir);
  if (model.errors.length) return { errors: model.errors, stale: [], written: [] };

  const stale = [];
  const written = [];
  const rendered = new Map();
  for (const output of outputs) {
    if (check && !output.committed) continue;
    if (!rendered.has(output.render)) rendered.set(output.render, output.render(model));
    const content = rendered.get(output.render);
    const path = join(root, output.path);
    if (check) {
      const current = await readFile(path, 'utf8').catch(() => null);
      if (current === null || normalise(current) !== content) stale.push(output.path);
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      written.push(output.path);
    }
  }
  return { errors: [], stale, written };
}
