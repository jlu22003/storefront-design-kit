// Layout checks on the base CSS, primitives, and playground pages
// (research report §5.2): reflow, target size, text spacing, rendered text.
// The checks are in scripts/lib/lab/checks.mjs.

import { checkReflow, checkRenderedText, checkTargets, checkTextSpacing } from '../../scripts/lib/lab/checks.mjs';
import { expectNone, test } from './support/fixtures.mjs';
import { PAGES, REFLOW_VIEWPORT } from './support/pages.mjs';

for (const { name, path } of PAGES) {
  test.describe(name, () => {
    test('has no horizontal scroll at the project viewport', { tag: ['@LAY-05', '@WCAG-1.4.10'] }, async ({ open, page }) => {
      await open(path);
      expectNone(await checkReflow(page));
    });

    test('reflows at 320px with no horizontal scroll', { tag: ['@LAY-06', '@WCAG-1.4.10'] }, async ({ open, page }) => {
      await page.setViewportSize(REFLOW_VIEWPORT);
      await open(path);
      expectNone(await checkReflow(page, { at320: true }));
    });

    test('controls have a hit region of at least 44×44px', { tag: ['@ACC-01', '@BTN-01', '@WCAG-2.5.8', '@WCAG-2.5.5'] }, async ({ open, page }) => {
      await open(path);
      expectNone(await checkTargets(page));
    });

    test('text-spacing overrides clip no text and add no horizontal scroll', { tag: ['@TYP-08', '@WCAG-1.4.12'] }, async ({ open, page }) => {
      await open(path);
      expectNone(await checkTextSpacing(page));
    });

    test('rendered text is at least 11px, never lighter than regular, in at most 2 families', { tag: ['@TYP-01', '@TYP-04', '@TYP-06'] }, async ({ open, page }) => {
      await open(path);
      expectNone(await checkRenderedText(page));
    });
  });
}
