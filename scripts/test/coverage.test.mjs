import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { promisify } from 'node:util';
import {
  computeCoverage, coverageFails, coverageJson, formatCoverage, isListing, nodeTests, playwrightTests, validatePolicy,
} from '../lib/coverage.mjs';
import { fixtureCatalog } from './fixture.mjs';

const run = promisify(execFile);
const ROOT = join(import.meta.dirname, '..', '..');
const CLI = join(ROOT, 'scripts', 'catalog-check.mjs');
const PLAYWRIGHT = createRequire(import.meta.url).resolve('@playwright/test/cli');
const PW_CONFIG = join(import.meta.dirname, 'fixtures', 'playwright', 'playwright.config.mjs');
const NODE_FIXTURE = join(import.meta.dirname, 'fixtures', 'node', 'sample.fixture.mjs');
const REPORTER = join(ROOT, 'scripts', 'lib', 'node-test-reporter.mjs');
const FAMILIES = new Set(['LAY', 'COL']);

// Real runner output for the fixture suites: a Playwright listing, a Playwright run, and a node:test run.
let dir;
let listing;
let runReport;
let nodeLines;

async function playwright(args) {
  const env = { ...process.env };
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  try {
    const { stdout } = await run(process.execPath, [PLAYWRIGHT, 'test', '--config', PW_CONFIG, '--reporter=json', ...args], { cwd: ROOT, env, maxBuffer: 1 << 26 });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sdk-coverage-'));
  [listing, runReport] = await Promise.all([playwright(['--list']), playwright([])]);
  const out = join(dir, 'node.jsonl');
  // Without this, the nested run reports to this test runner instead of writing the file.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  await run(process.execPath, ['--test', `--test-reporter=${REPORTER}`, `--test-reporter-destination=${out}`, NODE_FIXTURE], { cwd: ROOT, env });
  nodeLines = await readFile(out, 'utf8');
});
after(() => rm(dir, { recursive: true, force: true }));

const ran = (records) => records.filter((record) => record.ran).flatMap((record) => record.ids).sort();
const byName = (records, suffix) => records.find((record) => record.name.endsWith(suffix));

describe('playwrightTests', () => {
  test('tells a listing from a run report', () => {
    assert.equal(isListing(listing), true);
    assert.equal(isListing(runReport), false);
  });

  test('a listing counts tests that are not statically skipped, by their catalog tags', () => {
    const records = playwrightTests(listing, { root: ROOT });
    assert.equal(records.length, 10, 'one record per test, merged across projects');
    // Static skip, fixme, and describe.skip are visible in a listing; in-body skips are not.
    assert.deepEqual(ran(records), ['COL-01', 'COL-02', 'LAY-01', 'LAY-01', 'LAY-01', 'LAY-01', 'LAY-01', 'LAY-01', 'LAY-04', 'LAY-05', 'LAY-06', 'LAY-07', 'LYA-01']);
    assert.equal(byName(records, 'static skip').ran, false);
    assert.equal(byName(records, 'static fixme').ran, false);
    assert.equal(byName(records, 'inner').ran, false);
  });

  test('a run report drops in-body test.skip() and test.fixme(), and counts a test any project ran', () => {
    const records = playwrightTests(runReport, { root: ROOT });
    assert.deepEqual(ran(records), ['COL-01', 'COL-02', 'LAY-01', 'LAY-01', 'LAY-01', 'LAY-01', 'LAY-05', 'LAY-06', 'LYA-01']);
    assert.equal(byName(records, 'in-body skip').ran, false);
    assert.equal(byName(records, 'in-body fixme').ran, false);
    assert.equal(byName(records, 'skipped in project one').ran, true);
  });

  test('hook titles and string literals are not references; tags are catalog-shaped IDs only', () => {
    const all = playwrightTests(runReport, { root: ROOT }).flatMap((record) => record.ids);
    for (const id of ['LAY-09', 'LAY-08', 'LIB-04', 'WCAG-1.4.3']) assert.ok(!all.includes(id), `${id} is not a reference`);
    assert.ok(all.includes('LYA-01'), 'an unknown, catalog-shaped tag is kept so the gate can report it');
  });

  test('names tests by file and titles, and marks @visual tests', () => {
    const screenshot = byName(playwrightTests(runReport, { root: ROOT }), 'screenshot');
    assert.equal(screenshot.name, 'scripts/test/fixtures/playwright/sample.spec.mjs › screenshot');
    assert.equal(screenshot.visual, true);
    assert.equal(byName(playwrightTests(runReport), 'runs').visual, false);
  });

  test('rejects a report with load errors', () => {
    assert.throws(() => playwrightTests({ suites: [], errors: [{ message: 'SyntaxError' }] }), /SyntaxError/);
  });
});

describe('nodeTests', () => {
  test('counts tests that ran, by IDs in their own names', () => {
    const records = nodeTests(nodeLines, FAMILIES, { root: ROOT });
    assert.deepEqual(ran(records), ['COL-01', 'COL-02', 'LAY-01', 'LAY-77']);
  });

  test('skipped and todo tests, including in-body t.skip() and t.todo(), do not count', () => {
    const records = nodeTests(nodeLines, FAMILIES, { root: ROOT });
    for (const id of ['COL-04', 'COL-05', 'COL-06', 'COL-07']) {
      assert.equal(records.find((record) => record.ids.includes(id)).ran, false, id);
    }
  });

  test('suite names, hooks, and tests in skipped suites are not references', () => {
    const all = nodeTests(nodeLines, FAMILIES).flatMap((record) => record.ids);
    for (const id of ['COL-03', 'LAY-02', 'LAY-03']) assert.ok(!all.includes(id), id);
  });

  test('ignores tokens outside the catalog families', () => {
    assert.ok(!nodeTests(nodeLines, FAMILIES).flatMap((record) => record.ids).includes('ISO-99'));
  });
});

describe('validatePolicy', () => {
  const { standards } = fixtureCatalog();

  test('accepts automated and visual IDs', () => {
    assert.deepEqual(validatePolicy(standards, { enforced: ['LAY-01', 'LAY-02'] }), []);
  });

  test('rejects unknown, duplicate, and principle-only IDs and a missing list', () => {
    standards.standards[1].enforcement = ['principle'];
    assert.deepEqual(validatePolicy(standards, { enforced: ['LAY-01', 'LAY-01', 'COL-77', 'LAY-02'] }), [
      'enforced.json: LAY-01 is listed twice',
      'enforced.json: COL-77 is not in the catalog',
      'enforced.json: LAY-02 is a principle; only automated or visual standards can be enforced',
    ]);
    assert.match(validatePolicy(standards, {})[0], /expected an "enforced" array/);
  });
});

describe('computeCoverage', () => {
  const { standards } = fixtureCatalog();
  const record = (ids, extra = {}) => ({ source: 'playwright', name: `t ${ids.join(' ')}`, ids, visual: false, ran: true, ...extra });

  test('splits automated and visual standards into covered and missing', () => {
    const result = computeCoverage(standards, { tests: [record(['LAY-01']), record(['LAY-02'], { visual: true })] });
    assert.deepEqual(result.automated, { total: 2, covered: ['LAY-01'], missing: ['COL-01'] });
    assert.deepEqual(result.visual, { total: 1, covered: ['LAY-02'], missing: [] });
  });

  test('a test that did not run covers nothing and is reported', () => {
    const result = computeCoverage(standards, { tests: [record(['LAY-01'], { ran: false })], enforced: ['LAY-01'] });
    assert.deepEqual(result.automated.covered, []);
    assert.deepEqual(result.notRun, { 'LAY-01': ['t LAY-01'] });
    assert.deepEqual(result.enforced.failing, [
      {
        id: 'LAY-01',
        needs: ['a test that runs'],
        links: ['HIG https://developer.apple.com/design/human-interface-guidelines/layout', 'WCAG 1.3.2 https://www.w3.org/TR/WCAG22/#meaningful-sequence'],
      },
    ]);
    assert.ok(coverageFails(result));
  });

  test('a visual standard needs a @visual test; a plain test does not cover it', () => {
    const result = computeCoverage(standards, { tests: [record(['LAY-02'])], enforced: ['LAY-02'] });
    assert.deepEqual(result.enforced.failing, [
      { id: 'LAY-02', needs: ['a @visual screenshot test that runs'], links: ['HIG https://developer.apple.com/design/human-interface-guidelines/layout'] },
    ]);
  });

  test('counts lint-map entries with at least one rule', () => {
    const result = computeCoverage(standards, { lintMap: { 'LAY-01': ['stylelint: x'], 'COL-01': [] } });
    assert.deepEqual(result.automated.covered, ['LAY-01']);
  });

  test('reports unknown IDs from tests and the lint map, and fails on them', () => {
    const result = computeCoverage(standards, { tests: [record(['LAY-77'])], lintMap: { 'COL-99': ['rule'] } });
    assert.deepEqual(result.unknown, { 'COL-99': ['catalog/lint-map.json'], 'LAY-77': ['t LAY-77'] });
    assert.ok(coverageFails(result));
  });

  test('unenforced gaps are reported but do not fail', () => {
    const result = computeCoverage(standards, { tests: [record(['LAY-01'])], enforced: ['LAY-01'] });
    assert.deepEqual(result.automated.missing, ['COL-01']);
    assert.equal(coverageFails(result), false);
  });
});

describe('formatCoverage and coverageJson', () => {
  const { standards } = fixtureCatalog();
  const result = computeCoverage(standards, {
    tests: [{ source: 'node', name: 'a', ids: ['LAY-55', 'LAY-01'], visual: false, ran: true }],
    enforced: ['COL-01'],
  });

  test('report-only output lists enforced failures, unknown IDs, and gaps, and says it exits 0', () => {
    const text = formatCoverage(result, { enforce: false, sources: ['node:test: x'] });
    assert.match(text, /^catalog:check \(report-only\): 1\/2 automated standards have tests; 0\/1 visual standards have screenshot tests\./);
    assert.match(text, /\n  node:test: x\n/);
    assert.match(
      text,
      /Enforced standards without coverage \(1 of 1 in catalog\/enforced\.json\):\n  COL-01: needs a test that runs\n    WCAG 1\.4\.3 https:\/\/www\.w3\.org\/TR\/WCAG22\/#contrast-minimum\n/,
    );
    assert.match(text, /Unknown catalog IDs referenced \(1\):\n  LAY-55: a/);
    assert.match(text, /Automated standards without tests \(1; reported, not enforced/);
    assert.match(text, /Report-only mode: exit 0/);
  });

  test('enforcing output omits the report-only footer', () => {
    assert.doesNotMatch(formatCoverage(result, { enforce: true }), /Report-only/);
  });

  test('the JSON summary counts tests per ID', () => {
    const json = coverageJson(result, { enforce: true });
    assert.equal(json.mode, 'enforcing');
    assert.deepEqual(json.testsPerId, { 'LAY-01': 1 });
    assert.deepEqual(json.unknown, { 'LAY-55': ['a'] });
  });
});

describe('the CLI', () => {
  const write = async (name, content) => {
    const path = join(dir, name);
    await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
    return path;
  };
  const cli = (args, env = {}) => run(process.execPath, [CLI, ...args], { cwd: ROOT, env: { ...process.env, ...env } });

  test('is report-only by default and enforcing with --enforce', async () => {
    const report = await write('run.json', runReport);
    const nodeReport = await write('node.jsonl', nodeLines);
    const json = join(dir, 'out', 'coverage.json');
    const { stdout } = await cli(['--playwright-report', report, '--node-report', nodeReport, '--json', json]);
    assert.match(stdout, /^catalog:check \(report-only\): \d+\/118 automated standards/);
    assert.match(stdout, /Playwright: run report .* \(10 tests\)/);
    assert.match(stdout, /Unknown catalog IDs referenced \(2\):\n {2}LAY-77: .*\n {2}LYA-01: /);
    assert.equal(JSON.parse(await readFile(json, 'utf8')).mode, 'report-only');

    await assert.rejects(cli(['--enforce', '--playwright-report', report, '--node-report', nodeReport]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /\(enforcing\)/);
      assert.match(error.stdout, /Enforced standards without coverage/);
      return true;
    });
  });

  test('--enforce refuses to run without a run report', async () => {
    const nodeReport = await write('node2.jsonl', nodeLines);
    await assert.rejects(cli(['--enforce', '--node-report', nodeReport]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /--enforce needs --playwright-report/);
      return true;
    });
    const listed = await write('list.json', listing);
    await assert.rejects(cli(['--enforce', '--playwright-report', listed, '--node-report', nodeReport]), (error) => {
      assert.match(error.stderr, /is a listing/);
      return true;
    });
  });

  test('does not start runners from inside one of its own runs', async () => {
    await assert.rejects(cli([], { SDK_CATALOG_CHECK_CHILD: '1' }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /started by its own test run/);
      return true;
    });
  });
});
