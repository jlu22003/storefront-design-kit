// Appearance checks (research report §5.2, §5.3): dark mode follows the OS and
// the data-theme override, increased contrast swaps the token set, and nothing
// animates for long without a way to stop it.

import { expect, problems, test } from './support/fixtures.mjs';
import { PAGES } from './support/pages.mjs';

const MAX_ANIMATION_MS = 5000;

const looksDark = ({ background, text }) => background < 0.2 && text > 0.5;
const looksLight = ({ background, text }) => background > 0.6 && text < 0.2;

for (const { name, path } of PAGES) {
  test.describe(name, () => {
    test('follows the OS appearance and the data-theme override', { tag: ['@DRK-01'] }, async ({ open, page }, testInfo) => {
      await open(path);
      const scheme = testInfo.project.use.colorScheme;
      const system = await page.evaluate(() => sdkProbe.appearance());
      expect(system.colorScheme, 'sdk-tokens.css declares color-scheme: light dark').toBe('light dark');
      expect(scheme === 'dark' ? looksDark(system) : looksLight(system), `page renders ${scheme}: ${JSON.stringify(system)}`).toBe(true);

      const other = scheme === 'dark' ? 'light' : 'dark';
      await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), other);
      const forced = await page.evaluate(() => sdkProbe.appearance());
      expect(other === 'dark' ? looksDark(forced) : looksLight(forced), `data-theme="${other}" renders ${other}: ${JSON.stringify(forced)}`).toBe(true);
    });

    test(
      'prefers-contrast: more switches to the increased-contrast tokens and keeps text contrast',
      { tag: ['@ACC-18', '@DRK-03', '@COL-01', '@WCAG-1.4.3'] },
      async ({ open, page, axe }) => {
        await open(path);
        const before = await page.evaluate(() => sdkProbe.appearance());
        await page.emulateMedia({ contrast: 'more' });
        expect(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches), 'contrast emulation applies').toBe(true);
        const after = await page.evaluate(() => sdkProbe.appearance());
        expect(after.label, 'the label color changes to its increased-contrast value').not.toBe(before.label);
        const violations = (await axe()).filter((violation) => violation.startsWith('color-contrast'));
        expect(violations, violations.join('\n')).toEqual([]);
      },
    );

    test('no animation loops forever or runs longer than 5 seconds', { tag: ['@MOT-07', '@WCAG-2.2.2'] }, async ({ open, page }) => {
      await open(path);
      const long = (await page.evaluate(() => sdkProbe.animations()))
        .filter((animation) => !animation.inPanel && !(animation.activeDuration <= MAX_ANIMATION_MS))
        .map((animation) => `${animation.name} on ${animation.target}: ${animation.activeDuration}ms`);
      expect(long, problems(['MOT-07'], 'long or endless animations:', long)).toEqual([]);
    });
  });
}
