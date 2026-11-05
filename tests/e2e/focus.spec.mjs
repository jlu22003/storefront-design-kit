// Keyboard walk (research report §5.2): Tab through each page and check the
// focus order, the focus ring, and that sticky chrome never hides focus.
// The walk and the checks are in scripts/lib/lab/checks.mjs.

import { focusRingResults, focusWalk, tabOrderResults } from '../../scripts/lib/lab/checks.mjs';
import { expect, expectNone, test } from './support/fixtures.mjs';
import { PAGES } from './support/pages.mjs';

for (const { name, path } of PAGES) {
  test.describe(name, () => {
    test(
      'Tab reaches every control in DOM order',
      { tag: ['@ACC-07', '@ACC-10', '@LAY-01', '@WCAG-2.1.1', '@WCAG-2.4.3', '@WCAG-1.3.2'] },
      async ({ open, page }) => {
        await open(path);
        expectNone(tabOrderResults(await focusWalk(page)));
      },
    );

    test(
      'every focused control shows a 2px, 3:1 focus ring that sticky chrome does not hide',
      { tag: ['@ACC-09', '@ACC-11', '@LAY-11', '@WCAG-2.4.7', '@WCAG-2.4.11', '@WCAG-1.4.11'] },
      async ({ open, page }) => {
        await open(path);
        const walk = await focusWalk(page);
        expect(walk.states.length, 'the walk focused at least one control').toBeGreaterThan(0);
        expectNone(focusRingResults(walk));
      },
    );
  });
}
