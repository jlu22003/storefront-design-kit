#!/usr/bin/env node
// Renders catalog/STANDARDS.md and catalog/LIBERTIES.md from the catalog JSON.
//
//   node scripts/catalog-docs.mjs           write the generated files
//   node scripts/catalog-docs.mjs --check   exit 1 if they are missing or stale

import { parseArgs } from 'node:util';
import { catalogDocs } from './lib/docs.mjs';

async function main() {
  const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
  const { errors, stale, written } = await catalogDocs({ check: values.check });
  if (errors.length) {
    console.error(`catalog is invalid (${errors.length} problems):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else if (stale.length) {
    console.error(`stale generated docs: ${stale.map((name) => `catalog/${name}`).join(', ')}`);
    console.error('run `npm run catalog:docs` and commit the result.');
    process.exitCode = 1;
  } else if (values.check) {
    console.log('catalog docs are up to date.');
  } else {
    console.log(`wrote ${written.map((name) => `catalog/${name}`).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
