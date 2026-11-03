#!/usr/bin/env node
// Builds the design tokens from tokens/*.tokens.json (research report §4.1).
//
//   node scripts/build-tokens.mjs           write dist/sdk-tokens.css, dist/tokens.json
//                                           and theme/assets/sdk-tokens.css
//   node scripts/build-tokens.mjs --check   exit 1 if the tokens are invalid or the
//                                           committed theme/assets/sdk-tokens.css is stale
//
// Node built-ins only.

import { parseArgs } from 'node:util';
import { buildTokens } from './lib/build.mjs';

async function main() {
  const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
  const { errors, stale, written } = await buildTokens({ check: values.check });
  if (errors.length) {
    console.error(`tokens are invalid (${errors.length} problems):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else if (stale.length) {
    console.error(`stale generated tokens: ${stale.join(', ')}`);
    console.error('run `npm run tokens` and commit the result.');
    process.exitCode = 1;
  } else if (values.check) {
    console.log('generated tokens are up to date.');
  } else {
    console.log(`wrote ${written.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
