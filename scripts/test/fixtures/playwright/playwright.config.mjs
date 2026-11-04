// Fixture suite for scripts/test/coverage.test.mjs: no browser, two projects.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /\.spec\.mjs$/,
  outputDir: join(tmpdir(), 'sdk-coverage-fixture-results'),
  reporter: [['json']],
  projects: [{ name: 'one' }, { name: 'two' }],
});
