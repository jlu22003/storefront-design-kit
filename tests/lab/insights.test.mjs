// Site lab insights (scripts/lib/lab/insights.mjs): the wording in
// catalog/insights.json, tiers, grouping and sorting, the --fail-on exit rule,
// and the keyboard results of the check engine (scripts/lib/lab/checks.mjs).
// The browser side is covered by tests/e2e/lab-audit.spec.mjs.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AXE_RULE_IDS, CHECKS, axeLevel, emittableIds, focusRingResults, tabOrderResults } from '../../scripts/lib/lab/checks.mjs';
import { FAIL_ON, TIERS, buildInsights, fails, findingSentence, loadInsightData, summarize, tierOf } from '../../scripts/lib/lab/insights.mjs';

const { wording, standards } = loadInsightData();

const item = (selector, y = 0) => ({ selector, detail: `${selector} detail`, rect: { x: 0, y, width: 10, height: 10 } });
const result = (check, items) => ({ check, ids: [...CHECKS[check].ids], items });
const axe = (rule, impact, tags, items) => ({
  check: `axe:${rule}`,
  ids: [...(AXE_RULE_IDS[rule] ?? [])],
  items,
  axe: { rule, impact, level: axeLevel(tags), help: `${rule} help`, helpUrl: `https://dequeuniversity.com/rules/axe/${rule}` },
});

describe('catalog/insights.json', () => {
  test('every catalog ID the engine can report has a title, why, and fix', () => {
    const ids = emittableIds();
    assert.ok(ids.length > 20, `expected the engine to report many IDs, got ${ids.length}`);
    for (const id of ids) {
      const entry = wording.standards[id];
      assert.ok(entry, `catalog/insights.json has no entry for ${id}`);
      for (const field of ['title', 'why', 'fix']) assert.ok(typeof entry[field] === 'string' && entry[field].trim(), `${id} has no ${field}`);
    }
    for (const field of ['title', 'why', 'fix']) assert.ok(wording.other[field]?.trim(), `"other" has no ${field}`);
  });

  test('every check has singular and plural finding sentences under its first catalog ID', () => {
    for (const [check, { ids }] of Object.entries(CHECKS)) {
      const forms = wording.standards[ids[0]]?.findings?.[check];
      assert.ok(forms, `catalog/insights.json has no findings.${check} under ${ids[0]}`);
      for (const form of ['one', 'other']) assert.match(forms[form] ?? '', /\{n\}/, `${ids[0]} findings.${check}.${form} needs {n}`);
    }
  });

  test('every entry is a catalog standard, and every finding sentence belongs to a check', () => {
    for (const [id, entry] of Object.entries(wording.standards)) {
      assert.ok(standards.has(id), `${id} in insights.json is not in catalog/standards.json`);
      for (const check of Object.keys(entry.findings ?? {})) {
        assert.equal(CHECKS[check]?.ids[0], id, `findings.${check} under ${id}: no check by that name lists ${id} first`);
      }
    }
  });
});

describe('tiers', () => {
  test('axe impact critical or serious, or a level A rule, blocks people', () => {
    assert.equal(tierOf(axe('color-contrast', 'serious', ['wcag2aa'], [item('p')])), 'blocker');
    assert.equal(tierOf(axe('image-alt', 'critical', ['wcag2a'], [item('img')])), 'blocker');
    assert.equal(tierOf(axe('heading-order', 'moderate', ['wcag2a'], [item('h3')])), 'blocker');
    assert.equal(tierOf(axe('autocomplete-valid', 'moderate', ['wcag21aa'], [item('input')])), 'aa');
    assert.equal(tierOf(axe('region', 'moderate', ['best-practice'], [item('div')])), 'polish');
  });

  test('custom checks take the tier of the threshold they apply', () => {
    assert.equal(tierOf(result('positive-tabindex', [])), 'blocker');
    assert.equal(tierOf(result('target-size-minimum', [])), 'aa');
    assert.equal(tierOf(result('target-size', [])), 'polish');
    assert.equal(tierOf(result('contrast-more', [])), 'info');
    assert.throws(() => tierOf({ check: 'nope', ids: [], items: [] }), /unknown check/);
  });

  test('axeLevel reads the WCAG level from the rule tags', () => {
    assert.equal(axeLevel(['cat.color', 'wcag2aa', 'wcag143']), 'AA');
    assert.equal(axeLevel(['wcag2a', 'wcag111']), 'A');
    assert.equal(axeLevel(['wcag22aa']), 'AA');
    assert.equal(axeLevel(['best-practice']), null);
  });
});

describe('buildInsights', () => {
  const runs = [
    {
      viewport: 'desktop',
      height: 720,
      results: [
        result('text-size', [item('#a', 2000), item('#b', 2000)]),
        result('target-size', [item('#small', 100)]),
        result('target-size-minimum', [item('#tiny', 100)]),
        result('reflow', []),
        axe('color-contrast', 'serious', ['wcag2aa'], [item('#faint', 50)]),
        axe('tabindex', 'serious', ['best-practice'], [item('#jump', 10)]),
      ],
    },
    {
      viewport: 'phone',
      height: 839,
      results: [result('text-size', [item('#a', 3000)]), result('reflow', [item('html'), item('#wide')])],
    },
  ];
  const insights = buildInsights(runs, { wording, standards });

  test('groups findings by catalog ID and tier, and skips checks that found nothing', () => {
    assert.deepEqual(
      insights.map((insight) => `${insight.tier} ${insight.id}`),
      ['blocker COL-01', 'blocker null', 'aa LAY-05', 'aa ACC-01', 'polish TYP-01', 'polish ACC-01'],
    );
  });

  test('sorts within a tier by count, then by whether anything is above the fold', () => {
    // LAY-05 (2 on the phone) comes before ACC-01 (1); TYP-01 (2, below the fold) before ACC-01 (1, above it).
    const aa = insights.filter((insight) => insight.tier === 'aa');
    assert.deepEqual(aa.map((insight) => insight.count), [2, 1]);
    const typ = insights.find((insight) => insight.id === 'TYP-01');
    assert.equal(typ.aboveFold, false);
    assert.equal(insights.find((insight) => insight.tier === 'polish' && insight.id === 'ACC-01').aboveFold, true);
  });

  test('merges viewports: the count is the largest, items keep their viewport', () => {
    const [finding] = insights.find((insight) => insight.id === 'TYP-01').findings;
    assert.deepEqual(finding.viewports, { desktop: 2, phone: 1 });
    assert.equal(finding.count, 2);
    assert.equal(finding.sentence, '2 pieces of text are under 11px');
    assert.deepEqual(
      finding.items.map((entry) => `${entry.viewport} ${entry.selector}`),
      ['desktop #a', 'desktop #b', 'phone #a'],
    );
  });

  test('carries wording, the catalog rule, and links for every ID', () => {
    const contrast = insights.find((insight) => insight.id === 'COL-01');
    assert.equal(contrast.title, wording.standards['COL-01'].title);
    assert.equal(contrast.rule, standards.get('COL-01').rule);
    assert.deepEqual(contrast.ids, ['COL-01', 'DRK-03']);
    assert.ok(contrast.links.some((link) => link.id === 'DRK-03' && link.label === 'WCAG 1.4.11'));
    assert.equal(contrast.findings[0].sentence, 'color-contrast help (1 element)');
    const other = insights.find((insight) => insight.id === null);
    assert.equal(other.title, wording.other.title);
    assert.deepEqual(other.links, []);
  });

  test('summarize counts insights per tier, and fails applies --fail-on', () => {
    assert.deepEqual(summarize(insights), { blocker: 2, aa: 2, polish: 2, info: 0 });
    assert.equal(fails(insights, 'none'), false);
    assert.equal(fails(insights, 'blocker'), true);
    const polishOnly = insights.filter((insight) => insight.tier === 'polish');
    assert.equal(fails(polishOnly, 'aa'), false);
    assert.equal(fails([...polishOnly, { tier: 'info' }], 'blocker'), false);
    assert.deepEqual(Object.keys(FAIL_ON), ['blocker', 'aa', 'none']);
    assert.throws(() => fails(insights, 'toString'), /--fail-on must be one of/);
  });

  test('findingSentence uses the singular for one', () => {
    assert.equal(findingSentence(result('target-size', []), 1, wording), "1 control is smaller than the kit's 44×44px");
  });
});

describe('keyboard results', () => {
  const state = (key, desc, extra = {}) => ({
    key,
    inPanel: false,
    desc,
    selector: `#${desc}`,
    rect: null,
    focusVisible: true,
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineContrast: 4,
    unobscured: true,
    ...extra,
  });
  const tabbables = { order: ['a', 'b'], selectors: ['#a', '#b'], positiveTabindex: [], autofocus: [], reordered: [] };

  test('tab order differences point at where focus went', () => {
    const [, , , order] = tabOrderResults({ tabbables, states: [state('1', 'b'), state('0', 'a')], limited: false });
    assert.equal(order.check, 'tab-order');
    assert.deepEqual(
      order.items.map((entry) => `${entry.selector} ${entry.detail}`),
      ['#b stop 1: reached b, expected a', '#a stop 2: reached a, expected b'],
    );
    const [, , , missing] = tabOrderResults({ tabbables, states: [state('0', 'a')], limited: false });
    assert.deepEqual(missing.items.map((entry) => entry.detail), ['stop 2: reached (nothing), expected b']);
    const [, , , capped] = tabOrderResults({ tabbables, states: [state('0', 'a')], limited: true });
    assert.deepEqual(capped.items, []);
  });

  test('no outline is a WCAG failure, a thin or faint one is kit polish', () => {
    const [visible, ring, hidden] = focusRingResults({
      states: [
        state('0', 'none', { outlineStyle: 'none', outlineWidth: 0 }),
        state('1', 'unfocused', { focusVisible: false }),
        state('2', 'thin', { outlineStyle: 'auto', outlineWidth: 1 }),
        state('3', 'faint', { outlineContrast: 1.5 }),
        state('4', 'covered', { unobscured: false }),
        state('5', 'fine'),
      ],
    });
    assert.deepEqual(visible.items.map((entry) => entry.selector), ['#none', '#unfocused']);
    assert.deepEqual(ring.items.map((entry) => entry.selector), ['#thin', '#faint']);
    assert.deepEqual(hidden.items.map((entry) => entry.selector), ['#covered']);
    assert.deepEqual([visible.check, ring.check, hidden.check], ['focus-visible', 'focus-ring', 'focus-obscured']);
  });
});

test('the tiers are blocker, aa, polish, in that order', () => {
  assert.deepEqual(
    TIERS.map((tier) => tier.id),
    ['blocker', 'aa', 'polish'],
  );
});
