// 200% text (research report §5.2), run in the iphone-17-pro-text-200 project:
// text-only zoom (the root font size doubles, as with a 32px browser default)
// and the page-zoom equivalent (a 640px window at 200% is 320 CSS px).

import { join } from 'node:path';
import { expect, problems, test } from './support/fixtures.mjs';
import { PAGES, PINNED_RENDERER, REFLOW_VIEWPORT, UNPINNED_REASON } from './support/pages.mjs';

const SCREENSHOT_CSS = join(import.meta.dirname, 'support', 'screenshot.css');

async function textProblems(page, { allowWide = false } = {}) {
  const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => sdkProbe.reflow());
  const wide = scrollWidth > clientWidth && !allowWide;
  const overflow = wide ? [`page is ${scrollWidth}px wide in a ${clientWidth}px viewport`, ...offenders] : [];
  return [...overflow, ...(await page.evaluate(() => sdkProbe.clippedText()))];
}

for (const { name, path, visual, wideAt200 } of PAGES) {
  test.describe(name, () => {
    test(
      '200% text clips no text and adds no horizontal scroll',
      { tag: ['@LAY-07', '@TYP-03', '@WCAG-1.4.4', '@WCAG-1.4.10'] },
      async ({ open, page, textZoom }, testInfo) => {
        expect(textZoom, 'the project doubles the text size').toBe(2);
        await open(path);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
        if (wideAt200) testInfo.annotations.push({ type: 'wide at 200%', description: wideAt200 });
        const found = await textProblems(page, { allowWide: Boolean(wideAt200) });
        expect(found, problems(['LAY-07', 'TYP-03'], 'at 200% text:', found)).toEqual([]);
      },
    );

    test.describe('page zoom', () => {
      test.use({ textZoom: 1 });

      test('200% page zoom (320px viewport) clips no text', { tag: ['@TYP-03', '@WCAG-1.4.4'] }, async ({ open, page }) => {
        await page.setViewportSize(REFLOW_VIEWPORT);
        await open(path);
        const found = await textProblems(page);
        expect(found, problems(['TYP-03'], 'at 200% page zoom:', found)).toEqual([]);
      });
    });

    if (visual) {
      test('200% text matches the baseline', { tag: ['@visual', '@LAY-07', '@TYP-10'] }, async ({ open, page }) => {
        test.skip(!PINNED_RENDERER, UNPINNED_REASON);
        await open(path);
        await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, stylePath: SCREENSHOT_CSS });
      });
    }
  });
}
