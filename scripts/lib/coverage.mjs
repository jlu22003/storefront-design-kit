// Catalog coverage gate: finds which automated standards have tests.
//
// Tests reference catalog IDs in two ways (research report §5.4):
//   - Playwright tags, e.g. test('reflow 320', { tag: ['@LAY-06'] }, ...)
//   - the ID in a test title, e.g. test('COL-01 label on bg >= 4.5', ...)
// The scan is static: it reads test sources as text and does not run them.
// Comments and skipped, fixme or todo calls are dropped first: they test nothing.
// Lint rules map to IDs in catalog/lint-map.json ({ "COL-06": ["stylelint: color-no-hex"] }).

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { hasLabel } from './catalog.mjs';

const TEST_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(['node_modules', '__screenshots__']);
const TAG = /@([A-Z]{3}-\d{2})\b/g;
const TITLE_CALL = /\b(?:test|it|describe)(?:\.\w+)*\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const ID_IN_TITLE = /(?<![\w-])([A-Z]{3}-\d{2})\b/g;
const SKIPPED_CALL = /\b(?:(?:test|it|describe)(?:\.\w+)*\.(?:skip|fixme|todo)|x(?:test|it|describe))\s*\(/g;

const REGEX_PREFIX = /(?:[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await))$/;

function scan(source) {
  let code = '';
  const literal = [];
  const keep = (text, isLiteral) => {
    code += text;
    while (literal.length < code.length) literal.push(isLiteral);
  };
  const templateDepths = [];
  let depth = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    let end = i + 1;
    if (ch === '`' || (ch === '}' && templateDepths.at(-1) === depth)) {
      if (ch === '}') templateDepths.pop();
      while (end < source.length && source[end] !== '`' && !source.startsWith('${', end)) end += source[end] === '\\' ? 2 : 1;
      if (source.startsWith('${', end)) {
        end += 2;
        templateDepths.push(depth);
      } else {
        end += 1;
      }
      keep(source.slice(i, end), true);
    } else if (ch === '"' || ch === "'") {
      while (end < source.length && source[end] !== ch && source[end] !== '\n') end += source[end] === '\\' ? 2 : 1;
      if (source[end] === ch) end += 1;
      keep(source.slice(i, end), true);
    } else if (source.startsWith('//', i)) {
      end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
    } else if (source.startsWith('/*', i)) {
      end = source.indexOf('*/', i + 2);
      end = end === -1 ? source.length : end + 2;
      keep(' ', false);
    } else if (ch === '/' && (code.trim() === '' || REGEX_PREFIX.test(code.slice(-64).trimEnd()))) {
      let inClass = false;
      while (end < source.length && source[end] !== '\n' && (inClass || source[end] !== '/')) {
        if (source[end] === '\\') end += 1;
        else if (source[end] === '[') inClass = true;
        else if (source[end] === ']') inClass = false;
        end += 1;
      }
      end += 1;
      while (end < source.length && /\w/.test(source[end])) end += 1;
      keep(source.slice(i, end), true);
    } else {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      keep(ch, false);
    }
    i = end;
  }
  return { code, literal };
}

function callEnd(code, literal, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (literal[i]) continue;
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i + 1;
  }
  return code.length;
}

function activeCode(source) {
  const { code, literal } = scan(source);
  let out = '';
  let last = 0;
  for (const match of code.matchAll(SKIPPED_CALL)) {
    if (match.index < last || literal[match.index]) continue;
    out += `${code.slice(last, match.index)} `;
    last = callEnd(code, literal, match.index + match[0].length - 1);
  }
  return out + code.slice(last);
}

/** Lists test files under `dir`, sorted, as paths relative to `root`. */
export async function findTestFiles(dir, root = dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) files.push(...await findTestFiles(path, root));
    } else if (entry.isFile() && TEST_FILE.test(entry.name)) {
      files.push(relative(root, path).split(sep).join('/'));
    }
  }
  return files;
}

/**
 * Returns the catalog-style IDs a test source references: every `@ID` tag,
 * and every ID inside a test()/it()/describe() title. Each ID appears once.
 * IDs inside comments or skipped, fixme or todo calls are not references.
 * `families` limits untagged title matches to real family prefixes, so
 * unrelated tokens such as "ISO-99" are not mistaken for references.
 */
export function extractIds(source, families) {
  const code = activeCode(source);
  const ids = new Set();
  for (const [, id] of code.matchAll(TAG)) ids.add(id);
  for (const [, , title] of code.matchAll(TITLE_CALL)) {
    for (const [, id] of title.matchAll(ID_IN_TITLE)) {
      if (families.has(id.slice(0, 3))) ids.add(id);
    }
  }
  // Liberties are not standards, so a tag such as @LIB-04 is not a test reference.
  return [...ids].filter((id) => !id.startsWith('LIB-'));
}

/**
 * Computes coverage. `testSources` maps a file name to its source text;
 * `lintMap` maps IDs to lint rules (or is null when there is no lint map).
 */
export function computeCoverage(standardsDoc, testSources, lintMap = null) {
  const families = new Set(standardsDoc.families.map((family) => family.id));
  const known = new Map(standardsDoc.standards.map((standard) => [standard.id, standard]));
  const referencedBy = new Map();
  const unknown = new Map();
  const note = (id, where) => {
    const target = known.has(id) ? referencedBy : unknown;
    if (!target.has(id)) target.set(id, []);
    target.get(id).push(where);
  };

  for (const [file, source] of Object.entries(testSources)) {
    for (const id of extractIds(source, families)) note(id, file);
  }
  for (const [id, rules] of Object.entries(lintMap ?? {})) {
    if (Array.isArray(rules) && rules.length) note(id, 'catalog/lint-map.json');
  }

  const automated = standardsDoc.standards.filter((standard) => hasLabel(standard, 'automated'));
  const covered = automated.filter((standard) => referencedBy.has(standard.id)).map((standard) => standard.id);
  const missing = automated.filter((standard) => !referencedBy.has(standard.id)).map((standard) => standard.id);
  return {
    automated: automated.length,
    covered,
    missing,
    unknown: Object.fromEntries([...unknown].sort(([a], [b]) => a.localeCompare(b))),
    references: Object.fromEntries([...referencedBy].sort(([a], [b]) => a.localeCompare(b))),
  };
}

/** Reads the test files under each of `testDirs` (resolved against `root`) and the optional lint map. */
export async function readCoverageInputs({ root, testDirs, lintMapPath }) {
  const testSources = {};
  for (const dir of testDirs) {
    const base = resolve(root, dir);
    for (const file of await findTestFiles(base)) {
      const name = relative(root, join(base, file)).split(sep).join('/');
      testSources[name] = await readFile(join(base, file), 'utf8');
    }
  }
  let lintMap = null;
  try {
    lintMap = JSON.parse(await readFile(lintMapPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`cannot read ${lintMapPath}: ${error.message}`, { cause: error });
  }
  return { testSources, lintMap };
}

/** Formats a coverage result as the plain-text summary the CLI prints. */
export function formatCoverage(result, { enforce, testFiles }) {
  const lines = [
    `catalog:check (${enforce ? 'enforcing' : 'report-only'}): ${result.covered.length}/${result.automated} automated standards have tests (${testFiles} test files scanned).`,
  ];
  if (result.missing.length) {
    lines.push('', `Automated standards without tests (${result.missing.length}):`);
    const byFamily = new Map();
    for (const id of result.missing) {
      const family = id.slice(0, 3);
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family).push(id);
    }
    for (const [family, ids] of byFamily) lines.push(`  ${family}: ${ids.join(', ')}`);
  }
  const unknown = Object.entries(result.unknown);
  if (unknown.length) {
    lines.push('', `Unknown catalog IDs referenced (${unknown.length}):`);
    for (const [id, where] of unknown) lines.push(`  ${id}: ${[...new Set(where)].join(', ')}`);
  }
  if (!enforce) {
    lines.push('', 'Report-only mode: exit 0. Pass --enforce to fail on missing tests or unknown IDs.');
  }
  return lines.join('\n');
}

/** True when an enforcing run should fail. */
export const coverageFails = (result) => result.missing.length > 0 || Object.keys(result.unknown).length > 0;
