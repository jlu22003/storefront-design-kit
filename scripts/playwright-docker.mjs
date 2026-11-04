#!/usr/bin/env node
// Runs the Playwright suite inside the pinned image (scripts/lib/playwright-image.mjs),
// the same environment CI uses, so screenshots match the committed baselines.
//
//   npm run test:e2e:docker                                  run every project
//   npm run test:e2e:docker -- --update-snapshots            rewrite baselines
//   npm run test:e2e:docker -- --project desktop-chrome-light visual
//
// Arguments after `--` go to `playwright test`. Needs Docker. The repository
// is mounted at /work and its node_modules is used as is (all JavaScript).

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PLAYWRIGHT_IMAGE } from './lib/playwright-image.mjs';

const ROOT = resolve(import.meta.dirname, '..');

const args = [
  'run', '--rm', '--init', '--ipc=host',
  '--volume', `${ROOT}:/work`,
  '--workdir', '/work',
  '--env', 'SDK_PINNED_RENDERER=1',
  '--env', 'HOME=/tmp',
  '--env', 'CI',
];
// Write results and baselines as the calling user, not root (Linux hosts).
if (process.getuid) args.push('--user', `${process.getuid()}:${process.getgid()}`);
args.push(PLAYWRIGHT_IMAGE, 'npx', 'playwright', 'test', ...process.argv.slice(2));

console.log(`Running Playwright in ${PLAYWRIGHT_IMAGE}`);
const result = spawnSync('docker', args, { stdio: 'inherit' });
if (result.error) {
  console.error(`could not run docker: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
