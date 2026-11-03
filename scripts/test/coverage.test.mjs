import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { promisify } from 'node:util';
import {
  computeCoverage, coverageFails, extractIds, findTestFiles, formatCoverage, readCoverageInputs,
} from '../lib/coverage.mjs';
import { fixtureCatalog } from './fixture.mjs';

const run = promisify(execFile);
const CLI = join(import.meta.dirname, '..', 'catalog-check.mjs');
const FAMILIES = new Set(['LAY', 'COL']);

describe('extractIds', () => {
  test('reads Playwright tags', () => {
    const source = "test('reflow 320', { tag: ['@LAY-06', '@WCAG-1.4.10'] }, async () => {});";
    assert.deepEqual(extractIds(source, FAMILIES), ['LAY-06']);
  });

  test('reads IDs in test, it and describe titles', () => {
    const source = [
      "test('COL-01 label on bg >= 4.5', () => {});",
      'it("checks LAY-02 and LAY-03", () => {});',
      'describe(`LAY-04 group`, () => {});',
      "test.describe('nested COL-02', () => {});",
    ].join('\n');
    assert.deepEqual(extractIds(source, FAMILIES).sort(), ['COL-01', 'COL-02', 'LAY-02', 'LAY-03', 'LAY-04']);
  });

  test('ignores skipped, fixme and todo tests, including their tags and nested tests', () => {
    const source = [
      'describe.skip(`LAY-04 group`, () => {',
      "  test('LAY-05 inside a skipped group', { tag: ['@LAY-06'] }, () => {});",
      '});',
      "test.describe.skip('COL-02 group', () => {});",
      "test.fixme('LAY-07 reflow', { tag: '@LAY-08' }, async () => { expect(f(')')).ok(); });",
      "it.todo('COL-03 later');",
      "xit('COL-04 disabled', () => {});",
      "test('COL-01 runs', () => {});",
    ].join('\n');
    assert.deepEqual(extractIds(source, FAMILIES), ['COL-01']);
  });

  test('reads regex literals and template interpolations as literals, not code', () => {
    const quoteInRegex = "await expect(page.getByText(/it's/)).toBeVisible();\n// test('LAY-06 reflow', () => {});";
    assert.deepEqual(extractIds(quoteInRegex, FAMILIES), []);

    const openParenInSkipped = 'test.fixme("x", async () => { await expect(t).toHaveText(/\\(/); });\ntest("COL-01 runs", () => {});';
    assert.deepEqual(extractIds(openParenInSkipped, FAMILIES), ['COL-01']);

    const closeParenInSkipped = 'test.fixme("x", async () => { expect(t).toHaveText(/\\)/); test("LAY-02 inner", () => {}); });';
    assert.deepEqual(extractIds(closeParenInSkipped, FAMILIES), []);

    const nestedTemplate = "const u = `${`/*`}`;\ntest('LAY-03 after', () => { const r = a / b; const s = '//x'; });\nconst v = `${ { a: '`' }.a }`;\n// test('COL-02 gone', () => {});";
    assert.deepEqual(extractIds(nestedTemplate, FAMILIES), ['LAY-03']);
  });

  test('ignores tags and test calls inside comments but not comment-like text in strings', () => {
    const source = [
      "// test('x', { tag: ['@LAY-06'] }, () => {});",
      "/* test('LAY-07 reflow', () => {}); */",
      '/**',
      " * { tag: ['@COL-02'] }",
      ' */',
      "test('COL-01 at http://example.com', { tag: '@LAY-01' }, () => {});",
    ].join('\n');
    assert.deepEqual(extractIds(source, FAMILIES).sort(), ['COL-01', 'LAY-01']);
  });

  test('ignores untagged IDs outside titles and unrelated tokens in titles', () => {
    const source = "// see LAY-09\nconst x = 'COL-05';\ntest('ISO-99 and XLAY-01 are not ours', () => {});";
    assert.deepEqual(extractIds(source, FAMILIES), []);
  });

  test('ignores liberty references', () => {
    assert.deepEqual(extractIds("test('LIB-04 large text', { tag: ['@LIB-04'] }, () => {});", new Set(['LIB'])), []);
  });

  test('keeps tags with unknown families so typos surface', () => {
    assert.deepEqual(extractIds("test('x', { tag: '@LYA-01' }, () => {});", FAMILIES), ['LYA-01']);
  });
});

describe('computeCoverage', () => {
  const { standards } = fixtureCatalog();

  test('splits automated standards into covered and missing', () => {
    const result = computeCoverage(standards, { 'tests/a.spec.ts': "test('a', { tag: '@LAY-01' }, () => {});" });
    assert.equal(result.automated, 2);
    assert.deepEqual(result.covered, ['LAY-01']);
    assert.deepEqual(result.missing, ['COL-01']);
    assert.deepEqual(result.references, { 'LAY-01': ['tests/a.spec.ts'] });
    assert.ok(coverageFails(result));
  });

  test('counts lint-map entries with at least one rule', () => {
    const result = computeCoverage(standards, {}, { 'LAY-01': ['stylelint: x'], 'COL-01': [] });
    assert.deepEqual(result.covered, ['LAY-01']);
    assert.deepEqual(result.missing, ['COL-01']);
  });

  test('reports unknown IDs from tests and the lint map', () => {
    const result = computeCoverage(
      standards,
      { 'tests/a.spec.ts': "test('LAY-01 and LAY-77', { tag: ['@COL-01'] }, () => {});" },
      { 'COL-99': ['rule'] },
    );
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.unknown, { 'COL-99': ['catalog/lint-map.json'], 'LAY-77': ['tests/a.spec.ts'] });
    assert.ok(coverageFails(result));
  });

  test('passes when every automated standard is covered and nothing is unknown', () => {
    const result = computeCoverage(standards, { 't.test.mjs': "test('LAY-01 COL-01', () => {});" });
    assert.equal(coverageFails(result), false);
  });
});

describe('formatCoverage', () => {
  const result = computeCoverage(fixtureCatalog().standards, { 'a.spec.ts': "test('x', { tag: '@LAY-55' }, () => {});" });

  test('report-only output lists gaps by family and says it exits 0', () => {
    const text = formatCoverage(result, { enforce: false, testFiles: 1 });
    assert.match(text, /^catalog:check \(report-only\): 0\/2 automated standards have tests \(1 test files scanned\)\./);
    assert.match(text, /  LAY: LAY-01\n  COL: COL-01/);
    assert.match(text, /Unknown catalog IDs referenced \(1\):\n  LAY-55: a\.spec\.ts/);
    assert.match(text, /Report-only mode: exit 0/);
  });

  test('enforcing output omits the report-only footer', () => {
    assert.doesNotMatch(formatCoverage(result, { enforce: true, testFiles: 1 }), /Report-only/);
  });
});

describe('scanning the file system', () => {
  let root;
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'sdk-coverage-'));
    await mkdir(join(root, 'tests', 'e2e'), { recursive: true });
    await mkdir(join(root, 'tests', 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(root, 'tests', '__screenshots__'), { recursive: true });
    await mkdir(join(root, 'catalog'));
    await writeFile(join(root, 'tests', 'e2e', 'reflow.spec.ts'), "test('r', { tag: ['@LAY-06'] }, () => {});");
    await writeFile(join(root, 'tests', 'tokens.test.mjs'), "test('COL-01 label', () => {});");
    await writeFile(join(root, 'tests', 'helpers.mjs'), "test('LAY-01 not a test file', () => {});");
    await writeFile(join(root, 'tests', 'node_modules', 'pkg', 'x.test.js'), "test('LAY-02', () => {});");
    await writeFile(join(root, 'tests', '__screenshots__', 'y.spec.ts'), "test('LAY-03', () => {});");
    await writeFile(join(root, 'catalog', 'lint-map.json'), '{ "LAY-13": ["stylelint: property-disallowed-list"] }');
  });
  after(() => rm(root, { recursive: true, force: true }));

  test('findTestFiles finds spec and test files, skipping dependencies and screenshots', async () => {
    assert.deepEqual(await findTestFiles(join(root, 'tests')), ['e2e/reflow.spec.ts', 'tokens.test.mjs']);
  });

  test('findTestFiles treats a missing directory as empty', async () => {
    assert.deepEqual(await findTestFiles(join(root, 'nope')), []);
  });

  test('readCoverageInputs reads tests and the lint map', async () => {
    const inputs = await readCoverageInputs({ root, testDirs: ['tests'], lintMapPath: join(root, 'catalog', 'lint-map.json') });
    assert.deepEqual(Object.keys(inputs.testSources), ['tests/e2e/reflow.spec.ts', 'tests/tokens.test.mjs']);
    assert.deepEqual(inputs.lintMap, { 'LAY-13': ['stylelint: property-disallowed-list'] });
  });

  test('readCoverageInputs treats a missing lint map as none but rejects a broken one', async () => {
    const missing = await readCoverageInputs({ root, testDirs: [], lintMapPath: join(root, 'absent.json') });
    assert.equal(missing.lintMap, null);
    await writeFile(join(root, 'broken.json'), '{');
    await assert.rejects(readCoverageInputs({ root, testDirs: [], lintMapPath: join(root, 'broken.json') }), /cannot read/);
  });

  test('the CLI is report-only by default and enforcing with --enforce', async () => {
    const tests = join(root, 'tests');
    const report = await run(process.execPath, [CLI, '--tests', tests]);
    assert.match(report.stdout, /catalog:check \(report-only\): 2\/118 automated standards have tests \(2 test files scanned\)/);

    await assert.rejects(run(process.execPath, [CLI, '--enforce', '--tests', tests]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /\(enforcing\)/);
      return true;
    });
  });
});
