// The visual baselines are only as stable as their renderer: CI must run the
// Playwright image whose tag matches the installed @playwright/test.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLAYWRIGHT_VERSION } from '../lib/playwright-image.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

test('package.json pins @playwright/test to an exact version', async () => {
  const { devDependencies } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(devDependencies['@playwright/test'], PLAYWRIGHT_VERSION);
  assert.match(devDependencies['@axe-core/playwright'], /^\d+\.\d+\.\d+$/);
});
