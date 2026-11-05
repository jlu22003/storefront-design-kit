// axe-core on every page in every project (research report §5.1, §5.3).
// Each axe rule maps to catalog IDs (AXE_RULE_IDS in scripts/lib/lab/checks.mjs),
// so a failure names the standard it breaks.

import { checkAutocomplete, checkAxe } from '../../scripts/lib/lab/checks.mjs';
import { expectNone, test } from './support/fixtures.mjs';
import { PAGES } from './support/pages.mjs';

for (const { name, path } of PAGES) {
  test.describe(name, () => {
    test(
      'axe finds no WCAG 2.2 AA or best-practice violations',
      {
        tag: [
          '@ACC-01', '@ACC-03', '@ACC-04', '@ACC-05', '@ACC-16', '@COL-01', '@DRK-03', '@FRM-01', '@FRM-02', '@MOT-07', '@NAV-13',
          '@WCAG-1.1.1', '@WCAG-1.3.1', '@WCAG-1.4.3', '@WCAG-2.4.1', '@WCAG-2.5.8', '@WCAG-3.1.1', '@WCAG-3.3.2', '@WCAG-4.1.2',
        ],
      },
      async ({ open, page }) => {
        await open(path);
        expectNone(await checkAxe(page), `axe violations on ${path}:\n`);
      },
    );

    test('email, phone, and URL fields carry an autocomplete token', { tag: ['@FRM-02', '@WCAG-1.3.5'] }, async ({ open, page }) => {
      await open(path);
      expectNone(await checkAutocomplete(page));
    });
  });
}
