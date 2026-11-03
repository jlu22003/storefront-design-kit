// Catalog coverage gate: which standards have tests that actually run
// (research report §5.4).
//
// Coverage comes from what the test runners report, never from reading test
// source, so comments, string literals, hook titles, and skipped tests cannot
// count:
//   - Playwright: the JSON report of a run (or of `playwright test --list`).
//     Catalog IDs are tags, e.g. test('reflow 320', { tag: ['@LAY-06'] }, ...).
//     A test counts when at least one project ran it. In a listing only static
//     skips are visible, so --enforce needs a run report, where an in-body
//     test.skip() or test.fixme() shows up as skipped.
//   - node:test: the events of a run, written by node-test-reporter.mjs. The ID
//     is in the test's own name, e.g. test('COL-01 label on bg >= 4.5', ...).
//     Skipped and todo tests do not count; suites and hooks are not tests.
//   - Lint rules map to IDs in catalog/lint-map.json.
// A Playwright test tagged @visual is a screenshot test: it covers the visual
// side of the IDs it is tagged with.

import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { hasLabel } from './catalog.mjs';

export const CATALOG_ID = /^[A-Z]{3}-\d{2}$/;
export const VISUAL_TAG = 'visual';
const ID_IN_NAME = /(?<![\w-])([A-Z]{3}-\d{2})\b/g;

// Liberties are not standards, so a tag such as @LIB-04 is not a test reference.
const isReference = (id) => CATALOG_ID.test(id) && !id.startsWith('LIB-');

/** True when no test in a Playwright JSON report has results: it came from --list. */
export function isListing(report) {
  let results = false;
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) if (test.results?.length) results = true;
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return !results;
}

/**
 * Test records from a Playwright JSON report, one per test, merged across projects:
 * { source, name, ids, visual, ran }. `root` makes file paths relative.
 */
export function playwrightTests(report, { root } = {}) {
  if (report.errors?.length) {
    throw new Error(`the Playwright report has errors:\n${report.errors.map((error) => `  ${error.message ?? error}`).join('\n')}`);
  }
  const listing = isListing(report);
  const records = new Map();
  // Spec files are relative to the config's rootDir (its testDir).
  const rootDir = report.config?.rootDir ?? '';
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      const absolute = isAbsolute(spec.file) ? spec.file : join(rootDir, spec.file);
      const file = root ? relative(root, absolute).split(sep).join('/') : spec.file;
      const name = [file, ...titles, spec.title].join(' › ');
      const key = `${name}:${spec.line}:${spec.column}`;
      const tags = (spec.tags ?? []).map((tag) => tag.replace(/^@/, ''));
      const record = records.get(key) ?? {
        source: 'playwright',
        name,
        ids: [...new Set(tags.filter(isReference))],
        visual: tags.includes(VISUAL_TAG),
        ran: false,
      };
      for (const test of spec.tests ?? []) {
        const ran = test.results?.length
          ? test.results.some((result) => result.status !== 'skipped')
          : listing && test.expectedStatus !== 'skipped';
        record.ran ||= ran;
      }
      records.set(key, record);
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return [...records.values()];
}

/**
 * Test records from node-test-reporter.mjs output (JSON lines). `families` limits
 * IDs in names to real family prefixes, so tokens such as "ISO-99" are not references.
 */
export function nodeTests(jsonLines, families, { root } = {}) {
  const records = [];
  for (const line of jsonLines.split('\n')) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    const file = event.file && root ? relative(root, event.file).split(sep).join('/') : event.file;
    const ids = [...event.name.matchAll(ID_IN_NAME)].map(([, id]) => id).filter((id) => families.has(id.slice(0, 3)) && isReference(id));
    records.push({
      source: 'node',
      name: file ? `${file} › ${event.name}` : event.name,
      ids: [...new Set(ids)],
      visual: false,
      ran: !event.skip && !event.todo,
    });
  }
  return records;
}

/** Problems with the enforcement policy (catalog/enforced.json); empty means valid. */
export function validatePolicy(standardsDoc, policy) {
  if (!Array.isArray(policy?.enforced)) return ['enforced.json: expected an "enforced" array of catalog IDs'];
  const known = new Map(standardsDoc.standards.map((standard) => [standard.id, standard]));
  const errors = [];
  const seen = new Set();
  for (const id of policy.enforced) {
    if (seen.has(id)) errors.push(`enforced.json: ${id} is listed twice`);
    seen.add(id);
    const standard = known.get(id);
    if (!standard) errors.push(`enforced.json: ${id} is not in the catalog`);
    else if (!hasLabel(standard, 'automated') && !hasLabel(standard, 'visual')) {
      errors.push(`enforced.json: ${id} is a principle; only automated or visual standards can be enforced`);
    }
  }
  return errors;
}

/**
 * Computes coverage from test records (playwrightTests, nodeTests), the lint map
 * ({ "COL-06": ["stylelint: color-no-hex"] } or null), and the enforced IDs.
 */
export function computeCoverage(standardsDoc, { tests = [], lintMap = null, enforced = [] } = {}) {
  const known = new Map(standardsDoc.standards.map((standard) => [standard.id, standard]));
  const tested = new Map();
  const screenshots = new Map();
  const notRun = new Map();
  const unknown = new Map();
  const note = (map, id, where) => {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(where);
  };

  for (const test of tests) {
    for (const id of test.ids) {
      if (!known.has(id)) note(unknown, id, test.name);
      else if (!test.ran) note(notRun, id, test.name);
      else {
        note(tested, id, test.name);
        if (test.visual) note(screenshots, id, test.name);
      }
    }
  }
  for (const [id, rules] of Object.entries(lintMap ?? {})) {
    if (!Array.isArray(rules) || !rules.length) continue;
    note(known.has(id) ? tested : unknown, id, 'catalog/lint-map.json');
  }

  const split = (label, covering) => {
    const ids = standardsDoc.standards.filter((standard) => hasLabel(standard, label)).map((standard) => standard.id);
    return { total: ids.length, covered: ids.filter((id) => covering.has(id)), missing: ids.filter((id) => !covering.has(id)) };
  };

  const failing = [];
  for (const id of enforced) {
    const standard = known.get(id);
    if (!standard) continue;
    const needs = [];
    if (hasLabel(standard, 'automated') && !tested.has(id)) needs.push('a test that runs');
    if (hasLabel(standard, 'visual') && !screenshots.has(id)) needs.push('a @visual screenshot test that runs');
    if (needs.length) failing.push({ id, needs });
  }

  const sorted = (map) => Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)));
  return {
    automated: split('automated', tested),
    visual: split('visual', screenshots),
    enforced: { ids: [...enforced], failing },
    unknown: sorted(unknown),
    notRun: sorted(new Map([...notRun].filter(([id]) => !tested.has(id)))),
    references: sorted(tested),
    tests: { total: tests.length, ran: tests.filter((test) => test.ran).length },
  };
}

function byFamily(ids) {
  const families = new Map();
  for (const id of ids) {
    const family = id.slice(0, 3);
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(id);
  }
  return [...families].map(([family, list]) => `  ${family}: ${list.join(', ')}`);
}

/** Formats a coverage result as the plain-text summary the CLI prints. */
export function formatCoverage(result, { enforce, sources = [] }) {
  const { automated, visual, enforced } = result;
  const lines = [
    `catalog:check (${enforce ? 'enforcing' : 'report-only'}): ${automated.covered.length}/${automated.total} automated standards have tests; ` +
      `${visual.covered.length}/${visual.total} visual standards have screenshot tests.`,
    `Tests: ${result.tests.ran} of ${result.tests.total} ran (skipped, fixme, and todo tests do not count).`,
    ...sources.map((source) => `  ${source}`),
  ];
  lines.push('');
  if (enforced.failing.length) {
    lines.push(`Enforced standards without coverage (${enforced.failing.length} of ${enforced.ids.length} in catalog/enforced.json):`);
    for (const { id, needs } of enforced.failing) lines.push(`  ${id}: needs ${needs.join(' and ')}`);
  } else {
    lines.push(`Enforced standards: all ${enforced.ids.length} in catalog/enforced.json are covered.`);
  }
  const unknown = Object.entries(result.unknown);
  if (unknown.length) {
    lines.push('', `Unknown catalog IDs referenced (${unknown.length}):`);
    for (const [id, where] of unknown) lines.push(`  ${id}: ${[...new Set(where)].join(', ')}`);
  }
  const notRun = Object.entries(result.notRun);
  if (notRun.length) {
    lines.push('', `Referenced only by tests that did not run (${notRun.length}):`);
    for (const [id, where] of notRun) lines.push(`  ${id}: ${[...new Set(where)].slice(0, 3).join(', ')}`);
  }
  if (automated.missing.length) {
    lines.push('', `Automated standards without tests (${automated.missing.length}; reported, not enforced until listed in catalog/enforced.json):`);
    lines.push(...byFamily(automated.missing));
  }
  if (visual.missing.length) {
    lines.push('', `Visual standards without screenshot tests (${visual.missing.length}; reported, not enforced until listed):`);
    lines.push(...byFamily(visual.missing));
  }
  if (!enforce) {
    lines.push('', 'Report-only mode: exit 0. Pass --enforce (with --playwright-report) to fail on the problems above.');
  }
  return lines.join('\n');
}

/** True when an enforcing run should fail: an enforced ID lost its coverage, or a test names an unknown ID. */
export const coverageFails = (result) => result.enforced.failing.length > 0 || Object.keys(result.unknown).length > 0;

/** The machine-readable summary CI keeps as catalog-coverage.json: tests per ID and the gaps. */
export function coverageJson(result, { enforce }) {
  return {
    mode: enforce ? 'enforcing' : 'report-only',
    automated: { total: result.automated.total, covered: result.automated.covered.length, missing: result.automated.missing },
    visual: { total: result.visual.total, covered: result.visual.covered.length, missing: result.visual.missing },
    enforced: result.enforced,
    unknown: result.unknown,
    testsPerId: Object.fromEntries(Object.entries(result.references).map(([id, where]) => [id, where.length])),
  };
}

/** Reads a JSON file with a clear error. Returns null for a missing optional file. */
export async function readJson(path, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw new Error(`cannot read ${path}: ${error.message}`, { cause: error });
  }
}
