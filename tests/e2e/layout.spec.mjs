// Layout checks on the base CSS, primitives, and playground pages
// (research report §5.2): reflow, target size, text spacing, rendered text.

import { expect, problems, test } from './support/fixtures.mjs';
import { PAGES, REFLOW_VIEWPORT } from './support/pages.mjs';

// WCAG 1.4.12 text-spacing overrides, applied with !important as a user stylesheet would be.
const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-block-end: 2em !important; }
`;

function overflow({ scrollWidth, clientWidth, offenders }) {
  return scrollWidth > clientWidth ? [`page is ${scrollWidth}px wide in a ${clientWidth}px viewport`, ...offenders] : [];
}

for (const { name, path } of PAGES) {
  test.describe(name, () => {
    test('has no horizontal scroll at the project viewport', { tag: ['@LAY-05', '@WCAG-1.4.10'] }, async ({ open, page }) => {
      await open(path);
      const found = overflow(await page.evaluate(() => sdkProbe.reflow()));
      expect(found, problems(['LAY-05'], 'horizontal overflow:', found)).toEqual([]);
    });

    test('reflows at 320px with no horizontal scroll', { tag: ['@LAY-06', '@WCAG-1.4.10'] }, async ({ open, page }) => {
      await page.setViewportSize(REFLOW_VIEWPORT);
      await open(path);
      const found = overflow(await page.evaluate(() => sdkProbe.reflow()));
      expect(found, problems(['LAY-06'], 'horizontal overflow at 320px:', found)).toEqual([]);
    });

    test('controls have a hit region of at least 44×44px', { tag: ['@ACC-01', '@BTN-01', '@WCAG-2.5.8', '@WCAG-2.5.5'] }, async ({ open, page }) => {
      await open(path);
      const small = await page.evaluate((min) => sdkProbe.undersizedTargets(min), 44);
      expect(small, problems(['ACC-01', 'BTN-01'], 'controls under 44×44px:', small)).toEqual([]);
    });

    test('text-spacing overrides clip no text and add no horizontal scroll', { tag: ['@TYP-08', '@WCAG-1.4.12'] }, async ({ open, page }) => {
      await open(path);
      await page.addStyleTag({ content: TEXT_SPACING });
      const found = [...overflow(await page.evaluate(() => sdkProbe.reflow())), ...(await page.evaluate(() => sdkProbe.clippedText()))];
      expect(found, problems(['TYP-08'], 'with WCAG text spacing:', found)).toEqual([]);
    });

    test('rendered text is at least 11px, never lighter than regular, in at most 2 families', { tag: ['@TYP-01', '@TYP-04', '@TYP-06'] }, async ({ open, page }) => {
      await open(path);
      const { tooSmall, tooLight, families } = await page.evaluate(() => sdkProbe.renderedText());
      expect.soft(tooSmall, problems(['TYP-01'], 'text under 11px:', tooSmall)).toEqual([]);
      expect.soft(tooLight, problems(['TYP-04'], 'text lighter than 400:', tooLight)).toEqual([]);
      expect(families.length, problems(['TYP-06'], 'more than 2 font families:', families)).toBeLessThanOrEqual(2);
    });
  });
}
