// The visual baselines are only as stable as their renderer: CI must run the
// Playwright image whose tag matches the installed @playwright/test.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLAYWRIGHT_IMAGE, PLAYWRIGHT_VERSION } from '../lib/playwright-image.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

test('package.json pins @playwright/test to an exact version', async () => {
  const { devDependencies } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(devDependencies['@playwright/test'], PLAYWRIGHT_VERSION);
  assert.match(devDependencies['@axe-core/playwright'], /^\d+\.\d+\.\d+$/);
});

test('the CI e2e job runs in the pinned Playwright image', async () => {
  const workflow = await readFile(join(ROOT, '.github', 'workflows', 'catalog.yml'), 'utf8');
  const images = [...workflow.matchAll(/image:\s*(\S+)/g)].map(([, image]) => image);
  assert.deepEqual(images, [PLAYWRIGHT_IMAGE]);
});
