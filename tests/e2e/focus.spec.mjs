// Keyboard walk (research report §5.2): Tab through each page and check the
// focus order, the focus ring, and that sticky chrome never hides focus.

import { expect, problems, test } from './support/fixtures.mjs';
import { PAGES } from './support/pages.mjs';

// The kit's focus ring: --sdk-focus-width, and 3:1 against what sits behind it (WCAG 1.4.11).
const MIN_OUTLINE_PX = 2;
const MIN_OUTLINE_CONTRAST = 3;

/** Waits until a focus-driven scroll (smooth by default, MOT-02) has stopped moving. */
function settleScroll(page) {
  return page.evaluate(
    () =>
      new Promise((done) => {
        let last = '';
        let still = 0;
        const deadline = performance.now() + 2000;
        const tick = () => {
          const now = [scrollX, scrollY, ...[...document.querySelectorAll('.sdk-clip')].map((el) => el.scrollLeft)].join();
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 3 || performance.now() > deadline) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Presses Tab until focus leaves the page's own controls; returns each focus state. */
async function walk(page, expected) {
  await page.evaluate(() => document.activeElement?.blur?.());
  const states = [];
  for (let step = 0; step <= expected + 1; step++) {
    await page.keyboard.press('Tab');
    await settleScroll(page);
    const state = await page.evaluate(() => sdkProbe.focusState());
    // The design panel's toggle comes last in the DOM; reaching it, or wrapping to the browser, ends the walk.
    if (state.inPanel || (state.key === null && step >= expected)) break;
    states.push(state);
  }
  return states;
}

for (const { name, path } of PAGES) {
  test.describe(name, () => {
    test(
      'Tab reaches every control in DOM order',
      { tag: ['@ACC-07', '@ACC-10', '@LAY-01', '@WCAG-2.1.1', '@WCAG-2.4.3', '@WCAG-1.3.2'] },
      async ({ open, page }) => {
        await open(path);
        const { order, positiveTabindex, autofocus, reordered } = await page.evaluate(() => sdkProbe.tabbables());
        expect.soft(positiveTabindex, problems(['ACC-10', 'LAY-01'], 'tabindex above 0:', positiveTabindex)).toEqual([]);
        expect.soft(autofocus, problems(['ACC-10'], 'autofocus outside a search page:', autofocus)).toEqual([]);
        expect.soft(reordered, problems(['LAY-01'], 'controls moved by CSS order or *-reverse:', reordered)).toEqual([]);

        const states = await walk(page, order.length);
        const reached = states.map((state) => (state.key === null ? `(unexpected) ${state.desc}` : order[Number(state.key)]));
        expect(reached, problems(['ACC-07', 'ACC-10'], 'Tab order differs from the DOM order of the controls:', [])).toEqual(order);
      },
    );

    test(
      'every focused control shows a 2px, 3:1 focus ring that sticky chrome does not hide',
      { tag: ['@ACC-09', '@ACC-11', '@LAY-11', '@WCAG-2.4.7', '@WCAG-2.4.11', '@WCAG-1.4.11'] },
      async ({ open, page }) => {
        await open(path);
        const { order } = await page.evaluate(() => sdkProbe.tabbables());
        const states = await walk(page, order.length);
        expect(states.length, 'the walk focused at least one control').toBeGreaterThan(0);

        const ring = [];
        const hidden = [];
        for (const state of states) {
          if (!state.focusVisible) ring.push(`${state.desc}: does not match :focus-visible after Tab`);
          else if (state.outlineStyle === 'none' || state.outlineWidth < MIN_OUTLINE_PX) {
            ring.push(`${state.desc}: outline ${state.outlineStyle} ${state.outlineWidth}px`);
          } else if (state.outlineContrast !== null && state.outlineContrast < MIN_OUTLINE_CONTRAST) {
            ring.push(`${state.desc}: outline contrast ${state.outlineContrast}:1`);
          }
          if (!state.unobscured) hidden.push(`${state.desc}: covered or off screen when focused`);
        }
        expect.soft(ring, problems(['ACC-09'], 'focus ring problems:', ring)).toEqual([]);
        expect.soft(hidden, problems(['ACC-11', 'LAY-11'], 'focus hidden:', hidden)).toEqual([]);
      },
    );
  });
}
