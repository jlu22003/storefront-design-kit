#!/usr/bin/env node
// Catalog coverage gate (research report §5.4).
//
//   node scripts/catalog-check.mjs              report-only: print gaps, exit 0
//   node scripts/catalog-check.mjs --enforce    exit 1 if an automated standard has no
//                                               test or an unknown ID is referenced
//   --tests <dir>   test directory to scan, relative to the repo root (repeatable;
//                   default: tests)
//
// An invalid catalog fails in both modes.

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadCatalog, validateCatalog } from './lib/catalog.mjs';
import { computeCoverage, coverageFails, formatCoverage, readCoverageInputs } from './lib/coverage.mjs';
import { CATALOG_DIR } from './lib/docs.mjs';

const ROOT = join(import.meta.dirname, '..');

async function main() {
  const { values } = parseArgs({
    options: {
      enforce: { type: 'boolean', default: false },
      tests: { type: 'string', multiple: true, default: ['tests'] },
    },
  });
  const catalog = await loadCatalog(CATALOG_DIR);
  const errors = validateCatalog(catalog);
  if (errors.length) {
    console.error(`catalog is invalid (${errors.length} problems):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  const { testSources, lintMap } = await readCoverageInputs({
    root: ROOT,
    testDirs: values.tests,
    lintMapPath: join(CATALOG_DIR, 'lint-map.json'),
  });
  const result = computeCoverage(catalog.standards, testSources, lintMap);
  console.log(formatCoverage(result, { enforce: values.enforce, testFiles: Object.keys(testSources).length }));
  if (values.enforce && coverageFails(result)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
