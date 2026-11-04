#!/usr/bin/env node
// Catalog coverage gate (research report §5.4). See scripts/lib/coverage.mjs.
//
//   node scripts/catalog-check.mjs                 report-only: print gaps, exit 0
//   node scripts/catalog-check.mjs --enforce --playwright-report reports/playwright.json
//                                                  exit 1 if an ID in catalog/enforced.json
//                                                  has no test that ran, or a test names
//                                                  an unknown ID
//
//   --playwright-report <file>  JSON report of a Playwright run (the config writes
//                               reports/playwright.json). Without it the gate lists
//                               the suite with `playwright test --list`, which cannot
//                               see an in-body test.skip(), so --enforce requires it.
//   --node-report <file>        node-test-reporter.mjs output. Without it the gate
//                               runs the node tests in tests/ itself.
//   --json <file>               also write the coverage summary as JSON (CI artifact).
//
// An invalid catalog or enforcement policy fails in both modes.

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { loadCatalog, validateCatalog } from './lib/catalog.mjs';
import {
  computeCoverage, coverageFails, coverageJson, formatCoverage, isListing, nodeTests, playwrightTests, readJson, validatePolicy,
} from './lib/coverage.mjs';
import { CATALOG_DIR } from './lib/docs.mjs';

const ROOT = join(import.meta.dirname, '..');
const NODE_TESTS = 'tests/**/*.test.mjs';
const REPORTER = join(import.meta.dirname, 'lib', 'node-test-reporter.mjs');
// Set on the runs this script starts, so a test that calls the CLI cannot start them again.
const CHILD_ENV = 'SDK_CATALOG_CHECK_CHILD';
const run = promisify(execFile);

function refuseNested(what) {
  if (process.env[CHILD_ENV]) throw new Error(`catalog:check was started by its own ${what} run; pass --playwright-report and --node-report instead`);
}

async function listPlaywright() {
  refuseNested('test');
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const env = { ...process.env, [CHILD_ENV]: '1' };
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  let stdout;
  try {
    ({ stdout } = await run(process.execPath, [cli, 'test', '--list', '--reporter=json'], { cwd: ROOT, env, maxBuffer: 256 * 1024 * 1024 }));
  } catch (error) {
    // A load error still prints a JSON report with the error in it.
    stdout = error.stdout;
    if (!stdout) throw new Error(`playwright test --list failed: ${error.message}`, { cause: error });
  }
  return JSON.parse(stdout);
}

async function runNodeTests() {
  refuseNested('test');
  const dir = await mkdtemp(join(tmpdir(), 'sdk-catalog-check-'));
  const out = join(dir, 'node-tests.jsonl');
  // A node:test parent would otherwise take over the child's reporting.
  const env = { ...process.env, [CHILD_ENV]: '1' };
  delete env.NODE_TEST_CONTEXT;
  try {
    await run(process.execPath, ['--test', `--test-reporter=${REPORTER}`, `--test-reporter-destination=${out}`, NODE_TESTS], {
      cwd: ROOT,
      env,
      maxBuffer: 64 * 1024 * 1024,
    }).catch((error) => {
      // Failing tests still ran; `npm test` reports the failures themselves.
      if (error.code !== 1) throw error;
    });
    return await readFile(out, 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      enforce: { type: 'boolean', default: false },
      'playwright-report': { type: 'string' },
      'node-report': { type: 'string' },
      json: { type: 'string' },
    },
  });
  const catalog = await loadCatalog(CATALOG_DIR);
  const policy = await readJson(join(CATALOG_DIR, 'enforced.json'));
  const errors = [...validateCatalog(catalog), ...validatePolicy(catalog.standards, policy)];
  if (errors.length) {
    console.error(`catalog is invalid (${errors.length} problems):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  if (values.enforce && !values['playwright-report']) {
    console.error('--enforce needs --playwright-report <run report>: a listing cannot see an in-body test.skip() or test.fixme().');
    console.error('Run `npm run test:e2e` (it writes reports/playwright.json) and pass that file.');
    process.exitCode = 1;
    return;
  }

  const families = new Set(catalog.standards.families.map((family) => family.id));
  const sources = [];

  const report = values['playwright-report'] ? await readJson(resolve(values['playwright-report'])) : await listPlaywright();
  const listing = isListing(report);
  const pwTests = playwrightTests(report, { root: ROOT });
  sources.push(
    values['playwright-report'] && !listing
      ? `Playwright: run report ${values['playwright-report']} (${pwTests.length} tests)`
      : `Playwright: ${values['playwright-report'] ?? '`playwright test --list`'} is a listing (${pwTests.length} tests); in-body skips are not visible`,
  );

  const nodeLines = values['node-report'] ? await readFile(resolve(values['node-report']), 'utf8') : await runNodeTests();
  const nodeRecords = nodeTests(nodeLines, families, { root: ROOT });
  sources.push(`node:test: ${values['node-report'] ?? `ran ${NODE_TESTS}`} (${nodeRecords.length} tests)`);

  const lintMap = await readJson(join(CATALOG_DIR, 'lint-map.json'), { optional: true });
  sources.push(`lint map: catalog/lint-map.json (${Object.keys(lintMap ?? {}).length} IDs)`);

  if (values.enforce && listing) {
    console.error(`--enforce needs a run report, but ${values['playwright-report']} is a listing (no test results).`);
    process.exitCode = 1;
    return;
  }

  const result = computeCoverage(catalog.standards, { tests: [...pwTests, ...nodeRecords], lintMap, enforced: policy.enforced });
  console.log(formatCoverage(result, { enforce: values.enforce, sources }));
  if (values.json) {
    await mkdir(dirname(resolve(values.json)), { recursive: true });
    await writeFile(resolve(values.json), `${JSON.stringify(coverageJson(result, { enforce: values.enforce }), null, 2)}\n`);
  }
  if (values.enforce && coverageFails(result)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
