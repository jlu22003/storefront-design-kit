// Live-site design panel: what the bookmarklet runs on any page you visit.
//
// It reads the page's CSS custom properties on :root and offers sliders and
// color pickers for them, plus page overrides that work on any site: body text
// size, line height, spacing of common containers, corner radius, and text,
// background, and accent colors. Every change lives in one stylesheet the panel
// adds to the page (document.adoptedStyleSheets) and in data attributes on the
// containers it measured. "Remove" takes all of it away; reloading the page
// does too. Nothing is sent anywhere: the panel makes no network requests and
// never touches storage or cookies itself (an inline panel saves only through
// the `store` it is given, and presets only through the `presets` store it is
// given; see below).
//
// Two parts, like panel.js:
// - createLiveDesign({ doc }) holds the settings ({ scales, colors, overrides,
//   factor }) and applies them to one document, which can be a same-origin
//   iframe's. It has no UI.
// - mountLivePanel(panelCss, options) adds the panel UI for a design: the
//   floating Design button (the bookmarklet; the dev client on local copies
//   under /lab/, closed), or with { inline: true, container } an always-open
//   panel in `container` that styles another document (variant boards). Only
//   an inline panel given a `store` saves its settings; the bookmarklet never
//   gets one.
//
// Presets (presets.js) layer onto the settings and move the sliders to show
// the result. Without a `presets` store (the bookmarklet), your own presets
// last for the tab only; Export and Import keep them as a file.
//
// Built into a bookmarklet by bookmarklet.js. The bundler inlines util.js and
// presets.js and strips import/export lines, so keep every import relative and single-line,
// and avoid multi-line template literals.

import { contrastRatio, el, normalizeHex, round, scaleValue } from './util.js';
import { layerPreset, liveAsPreset, memoryPresets, presetControls, presetSettings } from './presets.js';

const GLOBAL = '__sdkLivePanel';
const BOX_ATTR = 'data-sdk-live-box';
const MAX_BOXES = 400;
const MAX_COLORS = 16;

/** Elements whose padding and gaps the container spacing slider scales. */
export const CONTAINER_SELECTOR = [
  'main',
  'section',
  'header',
  'footer',
  'article',
  'aside',
  'nav',
  '[class*="container"]',
  '[class*="wrapper"]',
  '[class*="section"]',
  '.page-width',
].join(', ');

const BOX_PROPS = ['padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end', 'row-gap', 'column-gap'];

const TEXT_ELEMENTS = 'p, li, dd, dt, blockquote, figcaption, td, th, label';
const BUTTON_CLASSES = ':is([class~="button"], [class~="btn"], [class^="btn-"]):not(:has(button, a, input))';
const RADIUS_ELEMENTS = `button, input, select, textarea, img, video, ${BUTTON_CLASSES}, [class~="card"], [class~="badge"]`;
const ACCENT_ELEMENTS = `button, [type="submit"], [type="button"], ${BUTTON_CLASSES}`;

// --------------------------------------------------------------- pure helpers

const TRIPLET = /^(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})$/;
const RGB = /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/;

/** How a color value is written: "hex", "rgb", "triplet" ("18, 18, 18"), "triplet-space" ("18 18 18"), or null. */
export function colorFormat(value) {
  const text = String(value).trim().toLowerCase();
  if (normalizeHex(text)) return 'hex';
  if (RGB.test(text)) return 'rgb';
  if (TRIPLET.test(text)) return text.includes(',') ? 'triplet' : 'triplet-space';
  return null;
}

const toHex = (channels) => `#${channels.map((c) => Math.max(0, Math.min(255, Math.round(Number(c)))).toString(16).padStart(2, '0')).join('')}`;

/** Converts a hex, opaque rgb(), or "r, g, b" triplet to "#rrggbb"; null for anything else. */
export function colorToHex(value) {
  const text = String(value).trim().toLowerCase();
  const hex = normalizeHex(text);
  if (hex) return hex;
  const rgb = RGB.exec(text);
  if (rgb) {
    const [, r, g, b, alpha, percent] = rgb;
    if (alpha !== undefined && Number(alpha) < (percent ? 100 : 1)) return null;
    return toHex([r, g, b]);
  }
  const triplet = TRIPLET.exec(text);
  return triplet ? toHex(triplet.slice(1, 4)) : null;
}

/** Writes "#rrggbb" back in the format the site used for that variable. */
export function formatColor(hex, format) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  if (format === 'triplet') return `${r}, ${g}, ${b}`;
  if (format === 'triplet-space') return `${r} ${g} ${b}`;
  if (format === 'rgb') return `rgb(${r}, ${g}, ${b})`;
  return hex;
}

/** Scales a variable: lengths in the value, or a bare number when the name says it is a scale. */
export function scaleVariable(name, value, factor) {
  const text = String(value).trim();
  if (/^-?\d*\.?\d+$/.test(text)) return /scale/i.test(name) ? String(round(Number(text) * factor)) : text;
  return scaleValue(text, factor);
}

/**
 * Sorts a :root custom property into what the panel can change: a color, or a
 * spacing, type, or radius value it can scale. Returns null for the rest.
 */
export function classifyVariable(name, value) {
  const n = name.toLowerCase();
  const format = colorFormat(value);
  if (format && (!format.startsWith('triplet') || /color|rgb|bg|background|foreground|accent|text|border/.test(n))) {
    return { kind: 'color', format };
  }
  const scalable = scaleVariable(n, value, 2) !== String(value).trim();
  if (!scalable) return null;
  if (/radius|rounded|corner/.test(n)) return { kind: 'radius' };
  if (/font-size|text-size|font-scale|type-scale|font-body-scale|font-heading-scale|heading-size|body-size|^--fs-|^--text-(?:\d*x[sl]|sm|md|base|lg)\b/.test(n)) {
    return { kind: 'type' };
  }
  if (/space|spacing|gap|gutter|padding|margin/.test(n)) return { kind: 'space' };
  return null;
}

/** A readable selector for an element: #id, or tag plus up to two classes. */
export function selectorFor({ tag, id, classes = [] }, escape = (s) => s.replace(/[^\w-]/g, (c) => `\\${c}`)) {
  if (id) return `#${escape(id)}`;
  return [tag.toLowerCase(), ...classes.slice(0, 2).map((c) => `.${escape(c)}`)].join('');
}

const bang = (important) => (important ? ' !important' : '');

/** Rules for the page overrides that are set: fontSize and radius in px, lineHeight unitless, colors as hex. */
export function overrideRules(overrides, { important = false } = {}) {
  const o = overrides;
  const imp = bang(important);
  const rules = [];
  const text = `body, body :where(${TEXT_ELEMENTS})`;
  if (o.fontSize !== undefined) rules.push(`body, body :where(p, li, dd, blockquote) { font-size: ${o.fontSize}px${imp}; }`);
  if (o.lineHeight !== undefined) rules.push(`${text} { line-height: ${o.lineHeight}${imp}; }`);
  if (o.text !== undefined) rules.push(`${text}, body :where(h1, h2, h3, h4, h5, h6) { color: ${o.text}${imp}; }`);
  if (o.background !== undefined) rules.push(`html, body { background-color: ${o.background}${imp}; }`);
  if (o.radius !== undefined) rules.push(`body :where(${RADIUS_ELEMENTS}) { border-radius: ${o.radius}px${imp}; }`);
  if (o.accent !== undefined) {
    rules.push(`:root { accent-color: ${o.accent}${imp}; }`);
    rules.push(`body :where(${ACCENT_ELEMENTS}) { background-color: ${o.accent}${imp}; border-color: ${o.accent}${imp}; }`);
  }
  if (o.onAccent !== undefined) rules.push(`body :where(${ACCENT_ELEMENTS}) { color: ${o.onAccent}${imp}; }`);
  return rules;
}

/**
 * Rules that scale measured containers. Each box is { selector, values } with
 * px values from getComputedStyle. Returns { rules, skipped }: a selector whose
 * boxes would get different values gets no rule and is listed in skipped.
 */
export function boxRules(boxes, factor, { important = false } = {}) {
  const groups = new Map();
  if (factor !== 1) {
    for (const box of boxes) {
      const declarations = Object.entries(box.values)
        .filter(([, value]) => Number.parseFloat(value) > 0)
        .map(([prop, value]) => `${prop}: ${scaleValue(value, factor)}${bang(important)};`)
        .join(' ');
      if (declarations) groups.set(box.selector, [...(groups.get(box.selector) ?? []), declarations]);
    }
  }
  const rules = [];
  const skipped = [];
  for (const [selector, list] of groups) {
    if (list.every((declarations) => declarations === list[0])) rules.push(`${selector} { ${list[0]} }`);
    else skipped.push(selector);
  }
  return { rules, skipped };
}

/** A :root block for changed variables, or '' when there are none. */
export function variableBlock(vars, { important = false } = {}) {
  const names = Object.keys(vars).sort();
  if (!names.length) return '';
  return [':root {', ...names.map((name) => `  ${name}: ${vars[name]}${bang(important)};`), '}'].join('\n');
}

/** The text "Copy CSS" copies: changed variables, overrides, and containers scaled as measured at a viewport width in px. */
export function liveCss({ vars = {}, overrides = {}, boxes = [], factor = 1, viewport = 0, site = 'this site' }) {
  const parts = [];
  const block = variableBlock(vars);
  if (block) parts.push(`/* CSS variables, as set on :root. */\n${block}`);
  const rules = overrideRules(overrides);
  if (rules.length) parts.push(`/* Page overrides. Add !important to any rule the theme's own CSS outranks. */\n${rules.join('\n')}`);
  const { rules: scaled, skipped } = boxRules(boxes, factor);
  if (scaled.length || skipped.length) {
    const notes = [
      `Container spacing at ${Math.round(factor * 100)}%: fixed px measured at a ${viewport}px-wide viewport, so they apply at every width.`,
      'Each rule also applies to any element it matches that was not measured.',
      ...(skipped.length ? [`Left out because matching containers differ: ${skipped.join(', ')}.`] : []),
    ];
    parts.push([`/* ${notes.join(' ')} */`, ...scaled].join('\n'));
  }
  if (!parts.length) return '/* No changes yet: move a slider or pick a color. */';
  return [`/* Design panel values for ${site}. Paste at the end of the site's stylesheet. */`, ...parts].join('\n\n');
}

// ------------------------------------------------------------------ settings

/** Every slider's range. Saved settings are clamped to these when they load. */
export const LIVE_RANGES = {
  space: { min: 0.5, max: 2, step: 0.05 },
  type: { min: 0.5, max: 1.5, step: 0.05 },
  radius: { min: 0, max: 2, step: 0.05 },
  factor: { min: 0.5, max: 2, step: 0.05 },
  fontSize: { min: 12, max: 24, step: 0.5 },
  lineHeight: { min: 1, max: 2.2, step: 0.05 },
  cornerRadius: { min: 0, max: 32, step: 1 },
};

const OVERRIDE_NUMBERS = { fontSize: 'fontSize', lineHeight: 'lineHeight', radius: 'cornerRadius' };
const OVERRIDE_COLORS = ['text', 'background', 'accent', 'onAccent'];

/** Settings with nothing changed: the page as loaded. */
export const freshLiveState = () => ({ scales: { space: 1, type: 1, radius: 1 }, colors: {}, overrides: {}, factor: 1 });

const clampTo = (value, { min, max }) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/**
 * Turns saved (or otherwise untrusted) settings into valid ones: numbers
 * clamped to LIVE_RANGES, colors as "#rrggbb", variable names starting with
 * "--", and anything else dropped.
 */
export function normalizeLiveState(raw) {
  const state = freshLiveState();
  const input = raw && typeof raw === 'object' ? raw : {};
  for (const kind of Object.keys(state.scales)) {
    const value = clampTo(input.scales?.[kind], LIVE_RANGES[kind]);
    if (value !== null) state.scales[kind] = value;
  }
  const factor = clampTo(input.factor, LIVE_RANGES.factor);
  if (factor !== null) state.factor = factor;
  for (const [name, value] of Object.entries(input.colors ?? {})) {
    const hex = typeof value === 'string' ? normalizeHex(value) : null;
    if (/^--[\w-]+$/.test(name) && hex) state.colors[name] = hex;
  }
  const overrides = input.overrides ?? {};
  for (const [key, range] of Object.entries(OVERRIDE_NUMBERS)) {
    if (overrides[key] === undefined) continue;
    const value = clampTo(overrides[key], LIVE_RANGES[range]);
    if (value !== null) state.overrides[key] = value;
  }
  for (const key of OVERRIDE_COLORS) {
    const hex = typeof overrides[key] === 'string' ? normalizeHex(overrides[key]) : null;
    if (hex) state.overrides[key] = hex;
  }
  return state;
}

// -------------------------------------------------------------------- page

// The window a document belongs to. The bookmarklet's tests run without one.
const viewOf = (doc) => doc.defaultView ?? window;

// A stylesheet added to a document or shadow root that can be taken away again.
// A constructed sheet must come from the target's own window to be adopted.
function addSheet(target) {
  const owner = target.ownerDocument ?? target;
  const view = owner.defaultView ?? window;
  if ('adoptedStyleSheets' in target && typeof view.CSSStyleSheet === 'function') {
    try {
      const sheet = new view.CSSStyleSheet();
      target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
      return {
        set: (css) => sheet.replaceSync(css),
        remove: () => {
          target.adoptedStyleSheets = target.adoptedStyleSheets.filter((s) => s !== sheet);
        },
      };
    } catch {
      // Fall through to a <style> element.
    }
  }
  const style = owner.createElement('style');
  (target.head ?? target).append(style);
  return { set: (css) => (style.textContent = css), remove: () => style.remove() };
}

const painted = (color) => colorToHex(color) !== null;

function pageBase(doc) {
  const { getComputedStyle: computed } = viewOf(doc);
  const body = doc.body ?? doc.documentElement;
  const bodyStyle = computed(body);
  const fontSize = Number.parseFloat(bodyStyle.fontSize) || 16;
  const lineHeight = Number.parseFloat(bodyStyle.lineHeight);
  const background = [body, doc.documentElement].map((node) => computed(node).backgroundColor).find(painted) ?? 'rgb(255, 255, 255)';
  const button = [...doc.querySelectorAll(`:where(${ACCENT_ELEMENTS})`)].find((node) => painted(computed(node).backgroundColor));
  const link = doc.querySelector('a[href]');
  const buttonStyle = button ? computed(button) : null;
  return {
    fontSize: round(fontSize),
    lineHeight: Number.isFinite(lineHeight) ? round(lineHeight / fontSize) : 1.2,
    text: colorToHex(bodyStyle.color) ?? '#000000',
    background: colorToHex(background) ?? '#ffffff',
    accent: colorToHex(buttonStyle?.backgroundColor ?? (link ? computed(link).color : '')) ?? '#0a5fd1',
    onAccent: colorToHex(buttonStyle?.color ?? '') ?? '#ffffff',
    radius: Math.round(Number.parseFloat(buttonStyle?.borderStartStartRadius ?? '') || 0),
  };
}

// Converts any color the browser understands (hsl, names, …) to hex, without touching the page.
function browserHex(doc, value) {
  const direct = colorToHex(value);
  if (direct) return direct;
  if (/^currentcolor$/i.test(value) || !viewOf(doc).CSS.supports('color', value)) return null;
  const context = doc.createElement('canvas').getContext('2d');
  if (!context) return null;
  context.fillStyle = '#010203';
  context.fillStyle = value;
  return context.fillStyle === '#010203' ? null : colorToHex(context.fillStyle);
}

function detectVariables(doc) {
  const root = doc.documentElement;
  const style = viewOf(doc).getComputedStyle(root);
  const names = new Set();
  for (let i = 0; i < style.length; i += 1) if (style[i].startsWith('--')) names.add(style[i]);
  const scan = (rules) => {
    for (const rule of rules) {
      if (rule.selectorText && /(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)) {
        for (const prop of rule.style) if (prop.startsWith('--')) names.add(prop);
      }
      if (rule.cssRules) scan(rule.cssRules);
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      scan(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets cannot be read; their variables still show if the computed style lists them.
    }
  }
  const found = { color: [], space: [], type: [], radius: [] };
  for (const name of [...names].sort()) {
    const value = style.getPropertyValue(name).trim();
    if (!value || value.length > 200) continue;
    let kind = classifyVariable(name, value);
    if (!kind && !value.includes('var(') && browserHex(doc, value)) kind = { kind: 'color', format: 'hex' };
    if (!kind) continue;
    if (kind.kind === 'color') {
      const hex = browserHex(doc, value);
      if (hex) found.color.push({ name, value, hex, format: kind.format });
    } else {
      found[kind.kind].push({ name, value });
    }
  }
  // Brand and role colors first; cap the list so the panel stays usable.
  const rank = (name) => (/accent|primary|brand|button|link|foreground|background|text|bg/.test(name) ? 0 : 1);
  found.color.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  found.extraColors = Math.max(0, found.color.length - MAX_COLORS);
  found.color = found.color.slice(0, MAX_COLORS);
  return found;
}

function measureBoxes(doc) {
  const view = viewOf(doc);
  const boxes = [];
  for (const node of doc.querySelectorAll(CONTAINER_SELECTOR)) {
    if (boxes.length >= MAX_BOXES) break;
    const style = view.getComputedStyle(node);
    const values = {};
    for (const prop of BOX_PROPS) {
      const value = style.getPropertyValue(prop);
      if (value.endsWith('px') && Number.parseFloat(value) > 0) values[prop] = value;
    }
    if (!Object.keys(values).length) continue;
    const id = String(boxes.length);
    node.setAttribute(BOX_ATTR, id);
    boxes.push({
      node,
      attr: `[${BOX_ATTR}="${id}"]`,
      selector: selectorFor({ tag: node.localName, id: node.id, classes: [...node.classList] }, view.CSS.escape),
      values,
    });
  }
  return boxes;
}

// ------------------------------------------------------------------- state

/**
 * The live panel's settings and how they apply to `doc`, with no UI. `site`
 * names the page in the copied CSS. Returns { doc, found, base, state, apply,
 * css, contrast, current, set, reset, destroy }; current() reads the page's
 * values as they are now, changes included (what presets build on).
 */
export function createLiveDesign({ doc = document, site } = {}) {
  const view = viewOf(doc);
  const found = detectVariables(doc);
  const base = pageBase(doc);
  const state = freshLiveState();
  const label = site ?? ((doc.location ?? view.location)?.hostname || 'this page');
  let boxes = null;
  let measuredWidth = 0;
  const pageSheet = addSheet(doc);

  function changedVars() {
    const vars = {};
    for (const kind of ['space', 'type', 'radius']) {
      const factor = state.scales[kind];
      if (factor === 1) continue;
      for (const { name, value } of found[kind]) vars[name] = scaleVariable(name, value, factor);
    }
    for (const { name, format } of found.color) {
      if (state.colors[name]) vars[name] = formatColor(state.colors[name], format);
    }
    return vars;
  }

  // The text "Copy CSS" copies.
  const css = () =>
    liveCss({ vars: changedVars(), overrides: state.overrides, boxes: boxes ?? [], factor: state.factor, viewport: measuredWidth, site: label });

  function apply() {
    const vars = changedVars();
    if (state.factor !== 1 && !boxes) {
      // Measure the containers as the page styles them, without our changes.
      pageSheet.set('');
      boxes = measureBoxes(doc);
      measuredWidth = view.innerWidth;
    }
    const scaledBoxes = (boxes ?? []).map((box) => ({ selector: box.attr, values: box.values }));
    const rules = [variableBlock(vars, { important: true }), ...overrideRules(state.overrides, { important: true }), ...boxRules(scaledBoxes, state.factor, { important: true }).rules];
    pageSheet.set(rules.filter(Boolean).join('\n'));
  }

  // Read back from the page, so variable changes count too.
  function contrast() {
    const live = pageBase(doc);
    return [
      ['Text on background', live.text, live.background],
      ['Text on accent', live.onAccent, live.accent],
    ].map(([name, fg, bg]) => ({ name, ratio: contrastRatio(fg, bg) }));
  }

  // Replaces every setting (saved settings, and later presets and AI versions).
  function set(next) {
    const clean = normalizeLiveState(next);
    // Drop picks for variables this page does not have, and overrides equal to the page as loaded.
    const known = new Set(found.color.map((c) => c.name));
    for (const name of Object.keys(clean.colors)) if (!known.has(name)) delete clean.colors[name];
    for (const [key, value] of Object.entries(clean.overrides)) if (value === base[key]) delete clean.overrides[key];
    Object.assign(state, clean);
    apply();
  }

  function destroy() {
    try {
      pageSheet.remove();
      for (const box of boxes ?? []) box.node.removeAttribute(BOX_ATTR);
    } catch {
      // The document is gone (its frame navigated away); nothing is left to clean up.
    }
  }

  return { doc, found, base, state, apply, css, contrast, current: () => pageBase(doc), set, reset: () => set({}), destroy };
}

// ------------------------------------------------------------------- panel

function field(id, label, input, valueNode, hint) {
  return el('div', { class: 'field' }, [
    el('div', { class: 'label-row' }, [el('label', { for: id, text: label }), valueNode]),
    input,
    ...(hint ? [el('p', { id: `${id}-hint`, class: 'hint', text: hint })] : []),
  ]);
}

function slider({ id, label, min, max, step, value, show, hint, onInput }) {
  const input = el('input', { id, type: 'range', min, max, step, value, 'aria-describedby': hint ? `${id}-hint` : undefined });
  const output = el('output', { for: id });
  const update = () => {
    output.textContent = show(Number(input.value));
  };
  update();
  input.addEventListener('input', () => {
    update();
    onInput(Number(input.value));
  });
  return { input, update, node: field(id, label, input, output, hint) };
}

function swatch(id, label, value, onInput) {
  const input = el('input', { id, type: 'color', value });
  input.addEventListener('input', () => onInput(input.value));
  return { input, node: el('div', { class: 'swatch' }, [input, el('label', { for: id, text: label })]) };
}

/**
 * Mounts the panel UI for a design (createLiveDesign) on `doc`.
 * - Floating (default): a Design button on `doc` itself, open unless
 *   { open: false }. Remove takes the panel and its changes off the page.
 * - Inline ({ inline: true, container }): an always-open panel appended to
 *   `container`, which may be in another document (a variant board styling
 *   a same-origin iframe).
 * `store` ({ load(), save(state) }) keeps the settings; without one nothing
 * is saved. `presets` (presets.js storagePresets()) keeps your own presets;
 * without one they last for this tab. `onRemove` runs after remove(). Returns { design, host, css(),
 * getState(), setState(next), toggle(), remove() }.
 */
export function mountLivePanel(
  panelCss,
  { doc = document, container, inline = false, open = true, store = null, presets = null, title = 'Design panel', idPrefix = 'sdk-live', site, onRemove } = {},
) {
  const design = createLiveDesign({ doc, site });
  const { found, base, state } = design;
  if (store) design.set(store.load());
  const id = (name) => `${idPrefix}-${name}`;

  const host = el('div', { 'data-sdk-live-panel': true, 'data-inline': inline });
  const shadow = host.attachShadow({ mode: 'open' });
  addSheet(shadow).set(panelCss);

  const output = el('pre', { class: 'output', tabindex: '0', 'aria-label': 'Changed values as CSS' });
  const status = el('p', { class: 'status', role: 'status' });
  const contrastList = el('ul', { class: 'contrast', role: 'list' });

  function updateContrast() {
    contrastList.replaceChildren(
      ...design.contrast().map(({ name, ratio }) => {
        const pass = ratio >= 4.5;
        return el('li', { 'data-pass': String(pass) }, [
          el('span', { text: name }),
          el('span', { class: 'ratio', text: `${ratio.toFixed(2)}:1 ${pass ? 'pass' : 'fail, needs 4.5:1'}` }),
        ]);
      }),
    );
  }

  function changed() {
    design.apply();
    store?.save(state);
    output.textContent = design.css();
    updateContrast();
  }

  // ---- controls
  const close = el('button', { type: 'button', class: 'close', 'aria-label': `Close ${title.toLowerCase()}`, text: '×' });
  const toggle = el('button', { type: 'button', class: 'toggle', 'aria-expanded': 'true', 'aria-controls': id('panel'), text: 'Design' });
  const panel = el('section', { id: id('panel'), class: 'panel', 'aria-labelledby': id('title') });

  const percent = (n) => `${Math.round(n * 100)}%`;
  const scaleSliders = [
    ['space', 'Spacing variables'],
    ['type', 'Type variables'],
    ['radius', 'Radius variables'],
  ]
    .filter(([kind]) => found[kind].length)
    .map(([kind, label]) => {
      const names = found[kind].map((v) => v.name);
      const listed = names.slice(0, 3).join(', ') + (names.length > 3 ? ', …' : '');
      const control = slider({
        id: id(`scale-${kind}`),
        label,
        ...LIVE_RANGES[kind],
        value: state.scales[kind],
        show: percent,
        hint: `Scales ${names.length} variable${names.length === 1 ? '' : 's'}: ${listed}`,
        onInput: (value) => {
          state.scales[kind] = value;
          changed();
        },
      });
      return { ...control, value: () => state.scales[kind] };
    });
  const colorSwatches = found.color.map(({ name, hex }) => {
    const control = swatch(id(`var${name}`), name.slice(2), state.colors[name] ?? hex, (value) => {
      if (value === hex) delete state.colors[name];
      else state.colors[name] = value;
      changed();
    });
    return { ...control, value: () => state.colors[name] ?? hex };
  });

  const variablesSet = el('fieldset', {}, [
    el('legend', { text: 'Site variables' }),
    ...(scaleSliders.length || colorSwatches.length
      ? [
          ...scaleSliders.map((s) => s.node),
          ...(colorSwatches.length ? [el('div', { class: 'swatches' }, colorSwatches.map((s) => s.node))] : []),
          ...(found.extraColors ? [el('p', { class: 'hint', text: `${found.extraColors} more color variables are not shown.` })] : []),
        ]
      : [el('p', { class: 'hint', text: 'No CSS variables found on :root. Use the page overrides below.' })]),
  ]);

  const setOverride = (key) => (value) => {
    if (value === base[key]) delete state.overrides[key];
    else state.overrides[key] = value;
    changed();
  };
  const override = (key) => () => state.overrides[key] ?? base[key];
  const overrideSliders = [
    { ...slider({ id: id('font-size'), label: 'Body text size', ...LIVE_RANGES.fontSize, value: override('fontSize')(), show: (n) => `${n}px`, onInput: setOverride('fontSize') }), value: override('fontSize') },
    { ...slider({ id: id('line-height'), label: 'Line height', ...LIVE_RANGES.lineHeight, value: override('lineHeight')(), show: (n) => n.toFixed(2), onInput: setOverride('lineHeight') }), value: override('lineHeight') },
    {
      ...slider({
        id: id('containers'),
        label: 'Container spacing',
        ...LIVE_RANGES.factor,
        value: state.factor,
        show: percent,
        hint: 'Scales padding and gaps of sections, headers, footers, and containers',
        onInput: (value) => {
          state.factor = value;
          changed();
        },
      }),
      value: () => state.factor,
    },
    {
      ...slider({ id: id('corner'), label: 'Corner radius', ...LIVE_RANGES.cornerRadius, value: override('radius')(), show: (n) => `${n}px`, hint: 'Buttons, fields, images, and cards', onInput: setOverride('radius') }),
      value: override('radius'),
    },
  ];
  const overrideSwatches = [
    ['text', 'Text'],
    ['background', 'Background'],
    ['accent', 'Accent (buttons)'],
    ['onAccent', 'Text on accent'],
  ].map(([key, label]) => ({ ...swatch(id(key), label, override(key)(), setOverride(key)), value: override(key) }));

  // Moves every control to the current settings.
  function syncControls() {
    for (const control of [...scaleSliders, ...overrideSliders, ...colorSwatches, ...overrideSwatches]) {
      control.input.value = control.value();
      control.update?.();
    }
  }

  const copy = el('button', { type: 'button', class: 'primary', text: 'Copy CSS' });
  const reset = el('button', { type: 'button', text: 'Reset' });
  const remove = el('button', { type: 'button', text: 'Remove' });
  // Presets layer onto the current settings; setState moves the sliders to the result.
  const presetUi = presetControls({
    idPrefix: id('presets'),
    store: presets ?? memoryPresets(),
    apply: (preset) => setState(layerPreset(normalizeLiveState(state), presetSettings(preset, design.current()), LIVE_RANGES)),
    current: () => liveAsPreset(normalizeLiveState(state)),
    note: presets ? '' : 'Your presets last for this tab only: Export saves them to a file, Import brings them back.',
  });

  const note = store
    ? 'Saved in this browser. Reset returns to the page as copied.'
    : 'Changes stay in this tab: nothing is saved or sent. Remove or reload the page to undo them.';

  panel.append(
    el('div', { class: 'header' }, [el('h2', { id: id('title'), text: title }), ...(inline ? [] : [close])]),
    el('p', { class: 'hint', text: note }),
    presetUi.node,
    variablesSet,
    el('fieldset', {}, [
      el('legend', { text: 'Page overrides' }),
      ...overrideSliders.map((s) => s.node),
      el('div', { class: 'swatches' }, overrideSwatches.map((s) => s.node)),
    ]),
    el('fieldset', {}, [el('legend', { text: 'Contrast (WCAG)' }), contrastList]),
    el('fieldset', {}, [el('legend', { text: 'Changed values' }), output, el('div', { class: 'actions' }, [copy, reset, ...(inline ? [] : [remove])]), status]),
  );
  shadow.append(...(inline ? [] : [toggle]), panel);

  function setOpen(show, { focus = true } = {}) {
    panel.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    if (focus) (show ? (panel.querySelector('input') ?? close) : toggle).focus();
  }

  // Keep the site's keyboard shortcuts from firing while you use the panel.
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (event) => event.stopPropagation());
  if (!inline) {
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => setOpen(false));
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.textContent);
      status.textContent = 'Copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(output);
      const selection = shadow.getSelection?.() ?? getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Clipboard unavailable: the CSS is selected, press Ctrl+C or Cmd+C.';
    }
  });

  function setState(next) {
    design.set(next);
    syncControls();
    changed();
  }

  reset.addEventListener('click', () => {
    setState({});
    status.textContent = store ? 'Reset to the page as copied.' : 'Reset to the page as loaded.';
  });

  function destroy() {
    design.destroy();
    presetUi.destroy();
    host.remove();
    onRemove?.();
  }
  remove.addEventListener('click', destroy);

  (container ?? doc.body ?? doc.documentElement).append(host);
  changed();
  if (!inline) setOpen(open, { focus: open });
  return {
    design,
    host,
    css: design.css,
    getState: () => normalizeLiveState(state),
    setState,
    toggle: () => setOpen(panel.hidden),
    remove: destroy,
  };
}

/**
 * The bookmarklet's entry point: opens the floating panel, or toggles it when
 * it is already on the page. Local copies (client.js) pass { open: false } to
 * start with only the Design button showing.
 */
export function toggleLivePanel(panelCss, options = {}) {
  if (window[GLOBAL]) {
    window[GLOBAL].toggle();
    return;
  }
  // Remove clears the global too, so the bookmark opens a fresh panel next time.
  window[GLOBAL] = mountLivePanel(panelCss, { ...options, doc: document, inline: false, store: null, onRemove: () => delete window[GLOBAL] });
}
