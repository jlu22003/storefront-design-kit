// Reduced motion (research report §5.2), run in the iphone-17-pro-reduced-motion
// project. The pages have no animations of their own yet, so each test adds a
// moving probe animation and checks that the base CSS stops it.

import { expect, problems, test } from './support/fixtures.mjs';
import { PAGES } from './support/pages.mjs';

const PROBE_CSS = `
  @keyframes sdk-test-spin { to { transform: rotate(1turn); } }
  #sdk-motion-probe { animation: sdk-test-spin 1s linear infinite; inline-size: 1rem; block-size: 1rem; }
`;

const moving = (list) =>
  list.filter((animation) => !animation.inPanel && animation.moves && animation.playState === 'running').map((animation) => `${animation.name} on ${animation.target}`);

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
          const probe = document.createElement('div');
          probe.id = 'sdk-motion-probe';
          document.body.append(probe);
          return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        });
        const running = moving(await page.evaluate(() => sdkProbe.animations()));
        expect(running, problems(['MOT-02', 'LST-06'], 'moving animations under reduced motion:', running)).toEqual([]);

        await page.locator('a[href], button, input, [tabindex="0"]').first().focus();
        const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
        expect(scrollBehavior, 'smooth scrolling is off under reduced motion (MOT-02)').toBe('auto');

        // Control: without the preference the same probe moves, so the check above can fail.
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => {
          const probe = document.getElementById('sdk-motion-probe');
          probe.replaceWith(probe.cloneNode());
          return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        });
        expect(moving(await page.evaluate(() => sdkProbe.animations())), 'the probe animates without reduced motion').not.toEqual([]);
      },
    );
  });
}
