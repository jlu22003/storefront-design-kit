// Shared Playwright fixtures for the standards checks. The check logic lives
// in scripts/lib/lab/checks.mjs, which returns what it finds; the specs run
// those checks on the kit pages and assert that nothing was found.
//
// - Requests to other origins are blocked, so runs are hermetic and pages render
//   the fallback font stack (no Google Fonts download; see tests/e2e/README.md).
// - probe.js is added to every page as `sdkProbe` (in-page measurements).
// - `textZoom` (a project option) doubles the root font size for the 200% project.
// - `open(path)` loads a page and waits until it is ready to measure.
// - `expectNone(results)` asserts that each check result found nothing, and
//   names the catalog standard with its HIG and WCAG links when one did.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { standardLinks } from '../../../scripts/lib/catalog-links.mjs';
import { CHECKS, PROBE_PATH } from '../../../scripts/lib/lab/checks.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
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

/** The failure message for one check result: axe's rule and nodes, or the check's label and its items. */
export function describeResult(result) {
  if (result.axe) {
    const { rule, impact, help, helpUrl } = result.axe;
    return [
      `${rule} [${impact}] ${help}${result.ids.length ? `: ${result.ids.map(catalogRef).join(', ')}` : ''}`,
      `    ${helpUrl}`,
      ...result.items.slice(0, 5).map((item) => `      ${item.selector}: ${item.detail}`),
    ].join('\n');
  }
  return problems(result.ids, `${CHECKS[result.check].label}:`, result.items.map((item) => item.detail));
}

/**
 * Asserts that every result found nothing (soft, so one test reports every
 * failing check). `heading` prefixes each message, such as the page path.
 */
export function expectNone(results, heading = '') {
  for (const result of results) {
    expect.soft(result.items, `${heading}${describeResult(result)}`).toEqual([]);
  }
}

export const test = base.extend({
  textZoom: [1, { option: true }],

  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    await page.route((url) => url.origin !== origin, (route) => route.abort('blockedbyclient'));
    await page.addInitScript({ path: PROBE_PATH });
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
});

export { expect };
