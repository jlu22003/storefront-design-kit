// The standards check engine: the logic behind the Playwright specs in
// tests/e2e/, as functions that return data instead of asserting. The specs
// wrap these and assert that nothing was found; the site lab and
// `npm run audit` (scripts/lib/lab/audit.mjs) run them on a local copy of a
// page and turn what they find into insights (insights.mjs).
//
// Every check takes a Playwright page that has probe.js as an init script
// (PROBE_PATH) and resolves to a list of results:
//
//   { check, ids, items: [{ selector, detail, rect }] }
//
// `check` names the check (a key of CHECKS, or `axe:<rule>`), `ids` are the
// catalog standards it tests, and `items` are the problems found: empty means
// it passed. axe results also carry `axe: { rule, impact, level, help, helpUrl }`.
// Some checks change the page (text spacing adds a stylesheet, the focus walk
// moves focus), so run those last or on a fresh page.

import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

/** probe.js, the in-page measurements: add it with page.addInitScript({ path: PROBE_PATH }). */
export const PROBE_PATH = join(import.meta.dirname, 'probe.js');

/** The playground's injected design panels; checks skip them. */
export const PANEL_SELECTOR = '[data-sdk-design-panel], [data-sdk-live-panel]';

/** The floor viewport for reflow (LAY-06): 320 CSS px, as on iPhone SE or a 1280px window at 400%. */
export const REFLOW_VIEWPORT = { width: 320, height: 568 };

/** WCAG 1.4.12 text-spacing overrides, applied with !important as a user stylesheet would be. */
export const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-block-end: 2em !important; }
`;

const MAX_ANIMATION_MS = 5000;
const TARGET_FLOOR_PX = 24;
const TARGET_DEFAULT_PX = 44;
// The kit's focus ring: --sdk-focus-width, and 3:1 against what sits behind it (WCAG 1.4.11).
const MIN_OUTLINE_PX = 2;
const MIN_OUTLINE_CONTRAST = 3;

/**
 * The checks this engine runs (axe rules aside), with the catalog IDs each one
 * tests and the level of the threshold it applies: "A" or "AA" for a WCAG
 * failure, "kit" for a kit threshold stricter than WCAG, "info" for a reading
 * that is reported but never fails. `label` names the problem in test failures;
 * the plain-language insight wording is in catalog/insights.json.
 */
export const CHECKS = {
  autocomplete: { ids: ['FRM-02'], level: 'AA', label: 'fields without autocomplete' },
  reflow: { ids: ['LAY-05'], level: 'AA', label: 'horizontal overflow' },
  'reflow-320': { ids: ['LAY-06'], level: 'AA', label: 'horizontal overflow at 320px' },
  'target-size-minimum': { ids: ['ACC-01', 'BTN-01'], level: 'AA', label: 'controls under 24×24px' },
  'target-size': { ids: ['ACC-01', 'BTN-01'], level: 'kit', label: 'controls under 44×44px' },
  'text-spacing': { ids: ['TYP-08'], level: 'AA', label: 'with WCAG text spacing' },
  'text-size': { ids: ['TYP-01'], level: 'kit', label: 'text under 11px' },
  'text-weight': { ids: ['TYP-04'], level: 'kit', label: 'text lighter than 400' },
  'font-families': { ids: ['TYP-06'], level: 'kit', label: 'more than 2 font families' },
  'stray-mono': { ids: ['TYP-06'], level: 'kit', label: 'monospace outside code, SKUs, and numbers' },
  'text-zoom': { ids: ['LAY-07', 'TYP-03'], level: 'AA', label: 'at 200% text' },
  'page-zoom': { ids: ['TYP-03'], level: 'AA', label: 'at 200% page zoom' },
  'positive-tabindex': { ids: ['ACC-10', 'LAY-01'], level: 'A', label: 'tabindex above 0' },
  autofocus: { ids: ['ACC-10'], level: 'A', label: 'autofocus outside a search page' },
  reordered: { ids: ['LAY-01'], level: 'A', label: 'controls moved by CSS order or *-reverse' },
  'tab-order': { ids: ['ACC-07', 'ACC-10'], level: 'A', label: 'Tab order differs from the DOM order of the controls' },
  'focus-visible': { ids: ['ACC-09'], level: 'AA', label: 'no focus outline' },
  'focus-ring': { ids: ['ACC-09'], level: 'kit', label: 'focus ring under 2px or 3:1' },
  'focus-obscured': { ids: ['ACC-11', 'LAY-11'], level: 'AA', label: 'focus hidden' },
  'long-animation': { ids: ['MOT-07'], level: 'A', label: 'long or endless animations' },
  'reduced-motion': { ids: ['MOT-02', 'LST-06'], level: 'kit', label: 'motion under reduced motion' },
  'contrast-more': { ids: ['ACC-18'], level: 'info', label: 'contrast failures with increased contrast on' },
};

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

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Every catalog ID a check or a mapped axe rule can report. */
export function emittableIds() {
  return [...new Set([...Object.values(CHECKS), ...Object.values(AXE_RULE_IDS).map((ids) => ({ ids }))].flatMap(({ ids }) => ids))].sort();
}

/** A result for one of CHECKS. */
const result = (check, items) => ({ check, ids: [...CHECKS[check].ids], items });

/** A page-wide problem: no element to point at. */
const pageItem = (detail) => ({ selector: 'html', detail, rect: null });

// ------------------------------------------------------------------ axe

/** The WCAG level an axe rule's tags claim: "A", "AA", or null for best practices. */
export function axeLevel(tags) {
  if (tags.some((tag) => /^wcag2\d?a$/.test(tag))) return 'A';
  if (tags.some((tag) => /^wcag2\d?aa$/.test(tag))) return 'AA';
  return null;
}

const axeSelector = (target) => target.map((part) => (Array.isArray(part) ? part.join(' >>> ') : part)).join(' ');

/**
 * Runs axe-core: one result per rule with violations, check `axe:<rule>`, its
 * catalog IDs from AXE_RULE_IDS (none for an unmapped rule). `rules` limits
 * the run to those rules; otherwise every WCAG 2.2 A/AA and best-practice rule runs.
 */
export async function checkAxe(page, { rules, exclude = PANEL_SELECTOR } = {}) {
  let builder = new AxeBuilder({ page });
  builder = rules ? builder.withRules(rules) : builder.withTags(AXE_TAGS);
  const { violations } = await builder.exclude(exclude).analyze();
  const selectors = violations.flatMap((violation) => violation.nodes.map((node) => axeSelector(node.target)));
  const rects = await page.evaluate((list) => {
    const rectOf = (selector) => {
      if (selector.includes('>>>')) return null;
      try {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { x: Math.round(rect.left + scrollX), y: Math.round(rect.top + scrollY), width: Math.round(rect.width), height: Math.round(rect.height) } : null;
      } catch {
        return null;
      }
    };
    return list.map(rectOf);
  }, selectors);
  let next = 0;
  return violations.map((violation) => ({
    check: `axe:${violation.id}`,
    ids: [...(AXE_RULE_IDS[violation.id] ?? [])],
    items: violation.nodes.map((node) => ({
      selector: axeSelector(node.target),
      detail: node.failureSummary?.split('\n').slice(1).join(' ').trim() ?? '',
      rect: rects[next++],
    })),
    axe: { rule: violation.id, impact: violation.impact ?? null, level: axeLevel(violation.tags), help: violation.help, helpUrl: violation.helpUrl },
  }));
}

// ------------------------------------------------------------- the checks

/** FRM-02: email, phone, and URL fields carry an autocomplete token. */
export async function checkAutocomplete(page) {
  return [result('autocomplete', await page.evaluate(() => sdkProbe.fieldsWithoutAutocomplete()))];
}

function overflow({ scrollWidth, clientWidth, offenders }) {
  return scrollWidth > clientWidth ? [pageItem(`page is ${scrollWidth}px wide in a ${clientWidth}px viewport`), ...offenders] : [];
}

/**
 * No horizontal scroll at the current viewport (LAY-05), or, with `at320`,
 * at the 320px floor (LAY-06; the caller sets REFLOW_VIEWPORT and reloads).
 */
export async function checkReflow(page, { at320 = false } = {}) {
  return [result(at320 ? 'reflow-320' : 'reflow', overflow(await page.evaluate(() => sdkProbe.reflow())))];
}

/**
 * ACC-01, BTN-01: hit regions under 24×24px (the WCAG 2.5.8 floor) and, as a
 * separate result, those from 24px up to the kit's 44×44px default.
 */
export async function checkTargets(page) {
  const floor = await page.evaluate((min) => sdkProbe.undersizedTargets(min), TARGET_FLOOR_PX);
  const below = new Set(floor.map((item) => item.selector));
  const small = (await page.evaluate((min) => sdkProbe.undersizedTargets(min), TARGET_DEFAULT_PX)).filter((item) => !below.has(item.selector));
  return [result('target-size-minimum', floor), result('target-size', small)];
}

/** TYP-08: with WCAG text spacing applied (this adds a stylesheet to the page), no text clips and nothing scrolls sideways. */
export async function checkTextSpacing(page) {
  await page.addStyleTag({ content: TEXT_SPACING_CSS });
  const found = [...overflow(await page.evaluate(() => sdkProbe.reflow())), ...(await page.evaluate(() => sdkProbe.clippedText()))];
  return [result('text-spacing', found)];
}

/** TYP-01, TYP-04, TYP-06: text under 11px, lighter than 400, in more than 2 families, or monospace outside code. */
export async function checkRenderedText(page) {
  const { tooSmall, tooLight, families, strayMono } = await page.evaluate(() => sdkProbe.renderedText());
  return [
    result('text-size', tooSmall),
    result('text-weight', tooLight),
    result('font-families', families.length > 2 ? families : []),
    result('stray-mono', strayMono),
  ];
}

async function textProblems(page, { allowWide = false } = {}) {
  const reflow = await page.evaluate(() => sdkProbe.reflow());
  return [...(allowWide ? [] : overflow(reflow)), ...(await page.evaluate(() => sdkProbe.clippedText()))];
}

/**
 * LAY-07, TYP-03: at 200% text (the caller doubles the root font size) no text
 * clips and nothing scrolls sideways. `allowWide` skips the sideways check.
 */
export async function checkTextZoom(page, { allowWide = false } = {}) {
  return [result('text-zoom', await textProblems(page, { allowWide }))];
}

/** TYP-03: at 200% page zoom (the caller sets the 320px REFLOW_VIEWPORT) no text clips and nothing scrolls sideways. */
export async function checkPageZoom(page) {
  return [result('page-zoom', await textProblems(page))];
}

/** MOT-07: no animation loops forever or runs longer than 5 seconds. */
export async function checkAnimations(page) {
  const long = (await page.evaluate(() => sdkProbe.animations()))
    .filter((animation) => !animation.inPanel && !(animation.activeDuration <= MAX_ANIMATION_MS))
    .map((animation) => ({ selector: animation.selector, detail: `${animation.name} on ${animation.target}: ${animation.activeDuration}ms`, rect: animation.rect }));
  return [result('long-animation', long)];
}

/** Animations whose keyframes move things and that are running. */
export const movingAnimations = (list) => list.filter((animation) => !animation.inPanel && animation.moves && animation.playState === 'running');

/**
 * MOT-02, LST-06: under reduced motion (the caller emulates it) no keyframe
 * animation moves anything and smooth scrolling is off.
 */
export async function checkReducedMotion(page) {
  const items = movingAnimations(await page.evaluate(() => sdkProbe.animations())).map((animation) => ({
    selector: animation.selector,
    detail: `${animation.name} on ${animation.target}`,
    rect: animation.rect,
  }));
  const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  if (scrollBehavior !== 'auto') items.push(pageItem(`scroll-behavior is ${scrollBehavior}; smooth scrolling should be off under reduced motion`));
  return [result('reduced-motion', items)];
}

/** ACC-18 (information only): text contrast failures with `prefers-contrast: more` on. Leaves the emulation on. */
export async function checkIncreasedContrast(page) {
  await page.emulateMedia({ contrast: 'more' });
  const found = await checkAxe(page, { rules: ['color-contrast'] });
  return [result('contrast-more', found.flatMap((violation) => violation.items))];
}

// --------------------------------------------------------------- keyboard

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

/**
 * Presses Tab through the page from the top until focus leaves its controls
 * (a design panel, or back to the browser) and records each focus state.
 * `limit` caps the stops walked, for pages with hundreds of controls.
 * Resolves to { tabbables, states, limited }.
 */
export async function focusWalk(page, { limit = Infinity } = {}) {
  const tabbables = await page.evaluate(() => sdkProbe.tabbables());
  const expected = Math.min(tabbables.order.length, limit);
  await page.evaluate(() => document.activeElement?.blur?.());
  const states = [];
  for (let step = 0; step <= expected + 1 && states.length < limit; step++) {
    await page.keyboard.press('Tab');
    await settleScroll(page);
    const state = await page.evaluate(() => sdkProbe.focusState());
    // A design panel's toggle comes last in the DOM; reaching it, or wrapping to the browser, ends the walk.
    if (state.inPanel || (state.key === null && step >= expected)) break;
    states.push(state);
  }
  return { tabbables, states, limited: tabbables.order.length > expected };
}

/** ACC-07, ACC-10, LAY-01: what breaks DOM order, and where Tab went instead of the next control. */
export function tabOrderResults({ tabbables, states, limited }) {
  const { order, selectors, positiveTabindex, autofocus, reordered } = tabbables;
  const reached = states.map((state) => (state.key === null ? `(unexpected) ${state.desc}` : order[Number(state.key)]));
  const stops = limited ? reached.length : Math.max(reached.length, order.length);
  const differences = [];
  for (let i = 0; i < stops; i++) {
    if (reached[i] === order[i]) continue;
    const state = states[i];
    differences.push({
      selector: state?.selector ?? selectors[i] ?? 'html',
      detail: `stop ${i + 1}: reached ${reached[i] ?? '(nothing)'}, expected ${order[i] ?? '(nothing)'}`,
      rect: state?.rect ?? null,
    });
  }
  return [result('positive-tabindex', positiveTabindex), result('autofocus', autofocus), result('reordered', reordered), result('tab-order', differences)];
}

/** ACC-09, ACC-11, LAY-11: each focused control shows a 2px, 3:1 ring and is not hidden by sticky chrome. */
export function focusRingResults({ states }) {
  const visible = [];
  const ring = [];
  const hidden = [];
  for (const state of states) {
    const at = (detail) => ({ selector: state.selector, detail: `${state.desc}: ${detail}`, rect: state.rect });
    if (!state.focusVisible) visible.push(at('does not match :focus-visible after Tab'));
    else if (state.outlineStyle === 'none' || state.outlineWidth === 0) visible.push(at(`outline ${state.outlineStyle} ${state.outlineWidth}px`));
    else if (state.outlineWidth < MIN_OUTLINE_PX) ring.push(at(`outline ${state.outlineStyle} ${state.outlineWidth}px`));
    else if (state.outlineContrast !== null && state.outlineContrast < MIN_OUTLINE_CONTRAST) ring.push(at(`outline contrast ${state.outlineContrast}:1`));
    if (!state.unobscured) hidden.push(at('covered or off screen when focused'));
  }
  return [result('focus-visible', visible), result('focus-ring', ring), result('focus-obscured', hidden)];
}

/** The keyboard checks from one Tab walk: tab order, then focus ring and obscured focus. */
export async function checkKeyboard(page, options) {
  const walk = await focusWalk(page, options);
  return [...tabOrderResults(walk), ...focusRingResults(walk)];
}

// ------------------------------------------------------------ a whole page

/** Loads `url` and waits until fonts are ready and a frame has painted. `textZoom` 2 doubles the root font size. */
export async function openForChecks(page, url, { textZoom = 1 } = {}) {
  await page.goto(url, { waitUntil: 'load' });
  if (textZoom !== 1) await page.addStyleTag({ content: `html { font-size: ${textZoom * 100}% !important; }` });
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(requestAnimationFrame)));
}

/** The passes runChecks makes, each on a freshly loaded page, and the checks each runs. */
export const PASSES = [
  { name: 'page', checks: ['axe', 'autocomplete', 'reflow', 'target-size', 'text', 'animations', 'keyboard'] },
  { name: 'text-spacing', checks: ['text-spacing'] },
  { name: '320px', viewport: REFLOW_VIEWPORT, checks: ['reflow-320', 'page-zoom'] },
  { name: '200% text', textZoom: 2, checks: ['text-zoom'] },
  { name: 'reduced motion', media: { reducedMotion: 'reduce' }, checks: ['reduced-motion'] },
  { name: 'increased contrast', checks: ['contrast-more'] },
];

const RUNNERS = {
  axe: (page) => checkAxe(page),
  autocomplete: checkAutocomplete,
  reflow: (page) => checkReflow(page),
  'target-size': checkTargets,
  text: checkRenderedText,
  animations: checkAnimations,
  keyboard: (page, { keyboardLimit }) => checkKeyboard(page, { limit: keyboardLimit }),
  'text-spacing': checkTextSpacing,
  'reflow-320': (page) => checkReflow(page, { at320: true }),
  'page-zoom': checkPageZoom,
  'text-zoom': (page) => checkTextZoom(page),
  'reduced-motion': checkReducedMotion,
  'contrast-more': checkIncreasedContrast,
};

/**
 * Runs every check on one page in `context` (a Playwright browser context
 * whose pages may reach only the page's own origin): a pass per PASSES entry,
 * each on a fresh tab. Resolves to the results of every check, in PASSES order.
 * `keyboardLimit` caps the Tab walk (default 200 stops).
 */
export async function runChecks(context, url, { keyboardLimit = 200 } = {}) {
  await context.addInitScript({ path: PROBE_PATH });
  const results = [];
  for (const pass of PASSES) {
    const page = await context.newPage();
    try {
      if (pass.viewport) await page.setViewportSize(pass.viewport);
      if (pass.media) await page.emulateMedia(pass.media);
      await openForChecks(page, url, { textZoom: pass.textZoom });
      for (const check of pass.checks) results.push(...(await RUNNERS[check](page, { keyboardLimit })));
    } finally {
      await page.close();
    }
  }
  return results;
}
