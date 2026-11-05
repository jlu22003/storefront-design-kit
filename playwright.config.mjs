// Playwright config: the PR-smoke tier of the standards test suite
// (research report §5.3). tests/e2e/README.md explains the projects, the
// catalog tags, and how visual baselines are pinned.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.SDK_E2E_PORT ?? 4410);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

// Every PR runs these viewports in light and dark.
const VIEWPORTS = [
  { name: 'iphone-17-pro', device: 'iPhone 17 Pro' }, // WebKit, 402×681
  { name: 'ipad-mini', device: 'iPad Mini' }, // WebKit, 768×1024
  { name: 'desktop-chrome', device: 'Desktop Chrome' }, // Chromium, 1280×720
];
const SCHEMES = ['light', 'dark'];

// Spec files each kind of project runs. axe runs in every project.
const VIEWPORT_SPECS = /(a11y|layout|focus|appearance|visual)\.spec\.mjs$/;
const TEXT_ZOOM_SPECS = /(a11y|text-zoom)\.spec\.mjs$/;
const REDUCED_MOTION_SPECS = /(a11y|reduced-motion)\.spec\.mjs$/;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /\.spec\.mjs$/,
  outputDir: 'test-results',
  // Baselines are rendered in the pinned Playwright image only (see tests/e2e/README.md),
  // so the file name carries the project but not the host platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: [
    [CI ? 'github' : 'list'],
    ['html', { open: 'never' }],
    // catalog:check --playwright-report reads this run report (scripts/lib/coverage.mjs).
    ['json', { outputFile: 'reports/playwright.json' }],
  ],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // Same image, same pixels; this absorbs only antialiasing noise between CPUs.
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...VIEWPORTS.flatMap(({ name, device }) =>
      SCHEMES.map((colorScheme) => ({
        name: `${name}-${colorScheme}`,
        testMatch: VIEWPORT_SPECS,
        use: { ...devices[device], colorScheme },
      })),
    ),
    {
      // 200% text (TYP-03, LAY-07): the root font size doubles, as a 32px browser default would.
      name: 'iphone-17-pro-text-200',
      testMatch: TEXT_ZOOM_SPECS,
      use: { ...devices['iPhone 17 Pro'], colorScheme: 'light', textZoom: 2 },
    },
    {
      name: 'iphone-17-pro-reduced-motion',
      testMatch: REDUCED_MOTION_SPECS,
      use: { ...devices['iPhone 17 Pro'], colorScheme: 'light', reducedMotion: 'reduce' },
    },
    {
      // Site lab: copies a localhost fixture site (`npm run lab:copy`) and opens the copy on the playground
      // server, and audits fixture pages (`npm run audit`).
      name: 'lab',
      testMatch: /(lab-[\w-]+|presets)\.spec\.mjs$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // The playground's own dev server serves the kit CSS and the pages under test.
    command: `node playground/server.mjs --port ${PORT} --no-open`,
    url: `${BASE_URL}/playground/`,
    reuseExistingServer: !CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 30_000,
  },
});
