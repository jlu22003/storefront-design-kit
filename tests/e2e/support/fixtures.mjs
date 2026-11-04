// Shared Playwright fixtures for the standards checks.
//
// - Requests to other origins are blocked, so runs are hermetic and pages render
//   the fallback font stack (no Google Fonts download; see tests/e2e/README.md).
// - probe.js is added to every page as `sdkProbe` (in-page measurements).
// - `textZoom` (a project option) doubles the root font size for the 200% project.
// - `open(path)` loads a page and waits until it is ready to measure.
// - `axe` runs axe-core and reports violations with their catalog IDs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from '@playwright/test';
import { standardLinks } from '../../../scripts/lib/catalog-links.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const PROBE = join(import.meta.dirname, 'probe.js');
const STANDARDS = new Map(
  JSON.parse(readFileSync(join(ROOT, 'catalog', 'standards.json'), 'utf8')).standards.map((standard) => [standard.id, standard]),
);

/** "ACC-01 (HIG accessibility; WCAG 2.5.8)": a catalog ID with its sources, for failure messages. */
export function catalogRef(id) {
  const standard = STANDARDS.get(id);
  if (!standard) return id;
  const sources = standardLinks(standard);
  return sources.length ? `${id} (${sources.join('; ')})` : id;
}

/** Formats a list of problems under a catalog-tagged heading, or returns '' when there are none. */
export function problems(ids, heading, list) {
  if (!list.length) return '';
  return [`${heading}`, ...ids.map((id) => `  ${catalogRef(id)}`), ...list.map((item) => `  - ${item}`)].join('\n');
}

// axe rules and the catalog standards they enforce (research report §5.1).
export const AXE_RULE_IDS = {
  'color-contrast': ['COL-01', 'DRK-03'],
  'target-size': ['ACC-01'],
  'button-name': ['ACC-03'],
  'link-name': ['ACC-03'],
  label: ['ACC-03', 'FRM-01'],
  'label-content-name-mismatch': ['ACC-03'],
  'image-alt': ['ACC-04'],
  'svg-img-alt': ['ACC-04'],
  'role-img-alt': ['ACC-04'],
  'page-has-heading-one': ['ACC-05'],
  'heading-order': ['ACC-05'],
  'landmark-one-main': ['ACC-05'],
  region: ['ACC-05'],
  'html-has-lang': ['ACC-16'],
  'html-lang-valid': ['ACC-16'],
  'valid-lang': ['ACC-16'],
  bypass: ['NAV-13'],
  'skip-link': ['NAV-13'],
  'th-has-data-cells': ['LST-05'],
  'scope-attr-valid': ['LST-05'],
  'aria-dialog-name': ['MOD-05'],
  'autocomplete-valid': ['FRM-02'],
  marquee: ['MOT-07'],
  blink: ['MOT-07'],
};

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

export const test = base.extend({
  textZoom: [1, { option: true }],

  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    await page.route((url) => url.origin !== origin, (route) => route.abort('blockedbyclient'));
    await page.addInitScript({ path: PROBE });
    await use(page);
  },

  open: async ({ page, textZoom }, use) => {
    await use(async (path) => {
      await page.goto(path, { waitUntil: 'load' });
      if (textZoom !== 1) await page.addStyleTag({ content: `html { font-size: ${textZoom * 100}% !important; }` });
      await page.locator('[data-sdk-design-panel]').waitFor({ state: 'attached' });
      await page.evaluate(() => document.fonts.ready.then(() => new Promise(requestAnimationFrame)));
    });
  },

  axe: async ({ page }, use) => {
    await use(async () => {
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('[data-sdk-design-panel]').analyze();
      return results.violations.map((violation) => {
        const ids = AXE_RULE_IDS[violation.id] ?? [];
        const nodes = violation.nodes.slice(0, 5).map((node) => `      ${node.target.join(' ')}: ${node.failureSummary?.split('\n').slice(1).join(' ').trim()}`);
        return [
          `${violation.id} [${violation.impact}] ${violation.help}${ids.length ? `: ${ids.map(catalogRef).join(', ')}` : ''}`,
          `    ${violation.helpUrl}`,
          ...nodes,
        ].join('\n');
      });
    });
  },
});

export { expect };
