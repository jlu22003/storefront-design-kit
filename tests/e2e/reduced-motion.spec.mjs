// Reduced motion (research report §5.2), run in the iphone-17-pro-reduced-motion
// project. The pages have no animations of their own yet, so each test adds a
// moving probe animation and checks that the base CSS stops it, then that the
// same probe moves without the preference. The check is in
// scripts/lib/lab/checks.mjs.

import { checkReducedMotion, movingAnimations } from '../../scripts/lib/lab/checks.mjs';
import { expect, expectNone, test } from './support/fixtures.mjs';
import { PAGES } from './support/pages.mjs';

const PROBE_CSS = `
  @keyframes sdk-test-spin { to { transform: rotate(1turn); } }
  @keyframes sdk-test-fade { to { opacity: 0.5; } }
  #sdk-motion-probe { animation: sdk-test-spin 1s linear infinite; inline-size: 1rem; block-size: 1rem; }
  #sdk-fade-probe { animation: sdk-test-fade 1s linear infinite; inline-size: 1rem; block-size: 1rem; }
`;

const moving = (list) => movingAnimations(list).map((animation) => `${animation.name} on ${animation.target}`);

for (const { name, path } of PAGES) {
  test.describe(name, () => {
    test(
      'reduced motion stops keyframe movement and smooth scrolling',
      { tag: ['@MOT-02', '@LST-06', '@WCAG-2.3.3'] },
      async ({ open, page }) => {
        await open(path);
        expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'the project emulates reduced motion').toBe(true);

        await page.addStyleTag({ content: PROBE_CSS });
        await page.evaluate(() => {
          for (const id of ['sdk-motion-probe', 'sdk-fade-probe']) {
            const probe = document.createElement('div');
            probe.id = id;
            document.body.append(probe);
          }
          return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        });
        await page.locator('a[href], button, input, [tabindex="0"]').first().focus();
        expectNone(await checkReducedMotion(page));

        // Control: without the preference the same probe moves, so the check above can fail.
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => {
          for (const id of ['sdk-motion-probe', 'sdk-fade-probe']) {
            const probe = document.getElementById(id);
            probe.replaceWith(probe.cloneNode());
          }
          return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        });
        const animations = await page.evaluate(() => sdkProbe.animations());
        const runs = (id) => animations.some((animation) => animation.playState === 'running' && animation.target?.includes(id));
        expect(runs('sdk-fade-probe'), 'the fade probe runs without reduced motion').toBe(true);
        expect(moving(animations), 'without reduced motion only the spin probe counts as moving').toEqual([expect.stringContaining('sdk-motion-probe')]);
      },
    );
  });
}
