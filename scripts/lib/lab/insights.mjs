// Turns check results (checks.mjs) into prioritized, plain-language insights:
// what the site lab's Insights tab and `npm run audit` show.
//
// Each insight is one catalog standard at one priority tier, with the
// findings (one per check) behind it, merged across the viewports audited:
//
//   { tier, id, ids, title, why, fix, rule, links, count, aboveFold,
//     findings: [{ check, sentence, count, viewports, items }] }
//
// The tier comes from the threshold that failed (TIERS). The wording is in
// catalog/insights.json, keyed by catalog ID; axe rules that map to no catalog
// ID are grouped as "other" (id null) with axe's own description.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { standardSources } from '../catalog-links.mjs';
import { CHECKS } from './checks.mjs';

const CATALOG = join(import.meta.dirname, '..', '..', '..', 'catalog');

/** The priority tiers, most urgent first. `info` readings are listed after them and never fail an audit. */
export const TIERS = [
  { id: 'blocker', number: 1, label: 'Blocks people', description: 'WCAG level A failures, and axe issues rated critical or serious.' },
  { id: 'aa', number: 2, label: 'WCAG AA', description: 'WCAG level AA failures.' },
  {
    id: 'polish',
    number: 3,
    label: 'Kit polish',
    description: "The kit's HIG-derived thresholds that are stricter than WCAG (44px targets, 11px text, 2 font families, a 2px focus ring), and axe best practices.",
  },
];
export const INFO = { id: 'info', label: 'For information', description: 'Readings that are reported but never fail an audit.' };
const TIER_ORDER = [...TIERS.map((tier) => tier.id), INFO.id];

/** Exit thresholds for `--fail-on`: the tiers each one fails on. */
export const FAIL_ON = { blocker: ['blocker'], aa: ['blocker', 'aa'], none: [] };

/** The wording (catalog/insights.json) and the catalog standards by ID. */
export function loadInsightData(dir = CATALOG) {
  const wording = JSON.parse(readFileSync(join(dir, 'insights.json'), 'utf8'));
  const standards = new Map(JSON.parse(readFileSync(join(dir, 'standards.json'), 'utf8')).standards.map((standard) => [standard.id, standard]));
  return { wording, standards };
}

/** The tier of a check result: from axe's impact and WCAG tags, or from the level CHECKS gives the check. */
export function tierOf(result) {
  if (result.axe) {
    if (result.axe.impact === 'critical' || result.axe.impact === 'serious' || result.axe.level === 'A') return 'blocker';
    return result.axe.level === 'AA' ? 'aa' : 'polish';
  }
  const level = CHECKS[result.check]?.level;
  if (!level) throw new Error(`unknown check "${result.check}"`);
  return { A: 'blocker', AA: 'aa', kit: 'polish', info: 'info' }[level];
}

const plural = (n, one, other) => (n === 1 ? one : other).replaceAll('{n}', String(n));

/** The sentence for a finding of `count` problems, from the wording of its first catalog ID, or from axe's rule help. */
export function findingSentence(result, count, wording) {
  if (result.axe) return `${result.axe.help} (${plural(count, '{n} element', '{n} elements')})`;
  const forms = wording.standards[result.ids[0]]?.findings?.[result.check];
  if (!forms) throw new Error(`catalog/insights.json has no finding sentence for ${result.check} under ${result.ids[0]}`);
  return plural(count, forms.one, forms.other);
}

/**
 * Builds the insights from one run per viewport: `runs` is
 * [{ viewport: "desktop", height: 720, results }]. Insights come sorted: by
 * tier, then by how many elements fail, then those with an element above the
 * fold (inside the first screen) first.
 */
export function buildInsights(runs, { wording, standards } = loadInsightData()) {
  const groups = new Map();
  for (const { viewport, height, results } of runs) {
    for (const result of results) {
      if (!result.items.length) continue;
      const tier = tierOf(result);
      const id = result.ids[0] ?? null;
      const key = `${tier}|${id ?? ''}`;
      let group = groups.get(key);
      if (!group) {
        group = { tier, id, ids: new Set(), findings: new Map() };
        groups.set(key, group);
      }
      for (const other of result.ids) group.ids.add(other);
      let finding = group.findings.get(result.check);
      if (!finding) {
        finding = { result, viewports: {}, items: [], aboveFold: false };
        group.findings.set(result.check, finding);
      }
      finding.viewports[viewport] = (finding.viewports[viewport] ?? 0) + result.items.length;
      for (const item of result.items) {
        finding.items.push({ viewport, ...item });
        if (item.rect && item.rect.y < height) finding.aboveFold = true;
      }
    }
  }

  const insights = [...groups.values()].map(({ tier, id, ids, findings }) => {
    const text = id ? wording.standards[id] : wording.other;
    if (!text) throw new Error(`catalog/insights.json has no entry for ${id}`);
    const standard = id ? standards.get(id) : null;
    const allIds = [...ids];
    const list = [...findings.values()].map(({ result, viewports, items, aboveFold }) => {
      const count = Math.max(...Object.values(viewports));
      const finding = { check: result.check, sentence: findingSentence(result, count, wording), count, viewports, aboveFold, items };
      if (result.axe) finding.axe = result.axe;
      return finding;
    });
    list.sort((a, b) => b.count - a.count || Number(b.aboveFold) - Number(a.aboveFold) || a.check.localeCompare(b.check));
    return {
      tier,
      id,
      ids: allIds,
      title: text.title,
      why: text.why,
      fix: text.fix,
      rule: standard?.rule ?? null,
      links: allIds.flatMap((other) => {
        const source = standards.get(other);
        return source ? standardSources(source).map((link) => ({ id: other, ...link })) : [];
      }),
      count: list.reduce((sum, finding) => sum + finding.count, 0),
      aboveFold: list.some((finding) => finding.aboveFold),
      findings: list,
    };
  });
  insights.sort(
    (a, b) =>
      TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
      b.count - a.count ||
      Number(b.aboveFold) - Number(a.aboveFold) ||
      // axe findings with no catalog ID come last in their tier.
      Number(a.id === null) - Number(b.id === null) ||
      (a.id ?? '').localeCompare(b.id ?? ''),
  );
  return insights;
}

/** How many insights each tier has: { blocker, aa, polish, info }. */
export function summarize(insights) {
  return Object.fromEntries(TIER_ORDER.map((tier) => [tier, insights.filter((insight) => insight.tier === tier).length]));
}

/** True when `failOn` ("blocker", "aa", or "none") should fail the audit for these insights. */
export function fails(insights, failOn) {
  const tiers = Object.hasOwn(FAIL_ON, failOn) ? FAIL_ON[failOn] : null;
  if (!tiers) throw new Error(`--fail-on must be one of: ${Object.keys(FAIL_ON).join(', ')}`);
  return insights.some((insight) => tiers.includes(insight.tier));
}
