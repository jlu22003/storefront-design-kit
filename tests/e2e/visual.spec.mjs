// Visual baselines for the primitives demo and the starters in each PR-smoke
// viewport, light and dark. tests/e2e/README.md explains how baselines are
// pinned and updated.

import { join } from 'node:path';
import { expect, test } from './support/fixtures.mjs';
import { PAGES, PINNED_RENDERER, UNPINNED_REASON } from './support/pages.mjs';

const SCREENSHOT_CSS = join(import.meta.dirname, 'support', 'screenshot.css');

for (const { name, path } of PAGES.filter((page) => page.visual)) {
  test(
    `${name} matches the baseline`,
    // Screenshots per viewport show grid alignment (LAY-02) and adaptation (LAY-04);
    // the dark projects show the designed dark palette (DRK-02) and dimmed media (DRK-04).
    { tag: ['@visual', '@LAY-02', '@LAY-04', '@DRK-02', '@DRK-04'] },
    async ({ open, page }) => {
      test.skip(!PINNED_RENDERER, UNPINNED_REASON);
      await open(path);
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, stylePath: SCREENSHOT_CSS });
    },
  );
}
