// Live-site design panel: what the bookmarklet runs on any page you visit.
//
// It reads the page's CSS custom properties on :root and offers sliders and
// color pickers for them, plus page overrides that work on any site: body text
// size, line height, spacing of common containers, corner radius, and text,
// background, and accent colors. Every change lives in one stylesheet the panel
// adds to the page (document.adoptedStyleSheets) and in data attributes on the
// containers it measured. "Remove" takes all of it away; reloading the page
// does too. Nothing is stored and nothing is sent anywhere: the panel makes no
// network requests and never touches storage or cookies.
//
// Built into a bookmarklet by bookmarklet.js. The bundler inlines util.js and
// strips import/export lines, so keep every import relative and single-line,
// and avoid multi-line template literals.

import { contrastRatio, el, normalizeHex, round, scaleValue } from './util.js';

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
const RADIUS_ELEMENTS =
  'button, input, select, textarea, img, video, [class*="button"], [class*="btn"], [class*="card"], [class*="badge"]';
const ACCENT_ELEMENTS = 'button, [type="submit"], [type="button"], [class*="button"], [class*="btn"]';

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
 * px values from getComputedStyle; boxes sharing a selector keep the first.
 */
export function boxRules(boxes, factor, { important = false } = {}) {
  if (factor === 1) return [];
  const seen = new Set();
  const rules = [];
  for (const box of boxes) {
    if (seen.has(box.selector)) continue;
    seen.add(box.selector);
    const declarations = Object.entries(box.values)
      .filter(([, value]) => Number.parseFloat(value) > 0)
      .map(([prop, value]) => `${prop}: ${scaleValue(value, factor)}${bang(important)};`);
    if (declarations.length) rules.push(`${box.selector} { ${declarations.join(' ')} }`);
  }
  return rules;
}

/** A :root block for changed variables, or '' when there are none. */
export function variableBlock(vars, { important = false } = {}) {
  const names = Object.keys(vars).sort();
  if (!names.length) return '';
  return [':root {', ...names.map((name) => `  ${name}: ${vars[name]}${bang(important)};`), '}'].join('\n');
}

/** The text "Copy CSS" copies: changed variables, overrides, and scaled containers. */
export function liveCss({ vars = {}, overrides = {}, boxes = [], factor = 1, site = 'this site' }) {
  const parts = [];
  const block = variableBlock(vars);
  if (block) parts.push(`/* CSS variables, as set on :root. */\n${block}`);
  const rules = overrideRules(overrides);
  if (rules.length) parts.push(`/* Page overrides. Add !important to any rule the theme's own CSS outranks. */\n${rules.join('\n')}`);
  const scaled = boxRules(boxes, factor);
  if (scaled.length) {
    parts.push(`/* Container spacing at ${Math.round(factor * 100)}%, measured on this page. */\n${scaled.join('\n')}`);
  }
  if (!parts.length) return '/* No changes yet: move a slider or pick a color. */';
  return [`/* Design panel values for ${site}. Paste at the end of the site's stylesheet. */`, ...parts].join('\n\n');
}

// -------------------------------------------------------------------- page

// A stylesheet added to a document or shadow root that can be taken away again.
function addSheet(target) {
  if ('adoptedStyleSheets' in target && typeof CSSStyleSheet === 'function') {
    try {
      const sheet = new CSSStyleSheet();
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
  const style = document.createElement('style');
  (target.head ?? target).append(style);
  return { set: (css) => (style.textContent = css), remove: () => style.remove() };
}

const painted = (color) => colorToHex(color) !== null;

function pageBase(doc) {
  const body = doc.body ?? doc.documentElement;
  const bodyStyle = getComputedStyle(body);
  const fontSize = Number.parseFloat(bodyStyle.fontSize) || 16;
  const lineHeight = Number.parseFloat(bodyStyle.lineHeight);
  const background =
    [body, doc.documentElement].map((node) => getComputedStyle(node).backgroundColor).find(painted) ?? 'rgb(255, 255, 255)';
  const button = [...doc.querySelectorAll(ACCENT_ELEMENTS)].find((node) => painted(getComputedStyle(node).backgroundColor));
  const link = doc.querySelector('a[href]');
  const buttonStyle = button ? getComputedStyle(button) : null;
  return {
    fontSize: round(fontSize),
    lineHeight: Number.isFinite(lineHeight) ? round(lineHeight / fontSize) : 1.2,
    text: colorToHex(bodyStyle.color) ?? '#000000',
    background: colorToHex(background) ?? '#ffffff',
    accent: colorToHex(buttonStyle?.backgroundColor ?? (link ? getComputedStyle(link).color : '')) ?? '#0a5fd1',
    onAccent: colorToHex(buttonStyle?.color ?? '') ?? '#ffffff',
    radius: Math.round(Number.parseFloat(buttonStyle?.borderStartStartRadius ?? '') || 0),
  };
}

// Converts any color the browser understands (hsl, names, …) to hex, without touching the page.
function browserHex(value) {
  const direct = colorToHex(value);
  if (direct) return direct;
  if (/^currentcolor$/i.test(value) || !CSS.supports('color', value)) return null;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return null;
  context.fillStyle = '#010203';
  context.fillStyle = value;
  return context.fillStyle === '#010203' ? null : colorToHex(context.fillStyle);
}

function detectVariables(doc) {
  const root = doc.documentElement;
  const style = getComputedStyle(root);
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
    if (!kind && !value.includes('var(') && browserHex(value)) kind = { kind: 'color', format: 'hex' };
    if (!kind) continue;
    if (kind.kind === 'color') {
      const hex = browserHex(value);
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
  const boxes = [];
  for (const node of doc.querySelectorAll(CONTAINER_SELECTOR)) {
    if (boxes.length >= MAX_BOXES) break;
    const style = getComputedStyle(node);
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
      selector: selectorFor({ tag: node.localName, id: node.id, classes: [...node.classList] }, CSS.escape),
      values,
    });
  }
  return boxes;
}

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

function createLivePanel(panelCss) {
  const doc = document;
  const found = detectVariables(doc);
  const base = pageBase(doc);
  const state = { scales: { space: 1, type: 1, radius: 1 }, colors: {}, overrides: {}, factor: 1 };
  let boxes = null;
  const pageSheet = addSheet(doc);

  const host = el('div', { 'data-sdk-live-panel': true });
  const shadow = host.attachShadow({ mode: 'open' });
  addSheet(shadow).set(panelCss);

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

  const output = el('pre', { class: 'output', tabindex: '0', 'aria-label': 'Changed values as CSS' });
  const status = el('p', { class: 'status', role: 'status' });
  const contrastList = el('ul', { class: 'contrast', role: 'list' });

  // Read back from the page, so variable changes count too.
  function updateContrast() {
    const live = pageBase(doc);
    const pairs = [
      ['Text on background', live.text, live.background],
      ['Text on accent', live.onAccent, live.accent],
    ];
    contrastList.replaceChildren(
      ...pairs.map(([label, fg, bg]) => {
        const ratio = contrastRatio(fg, bg);
        const pass = ratio >= 4.5;
        return el('li', { 'data-pass': String(pass) }, [
          el('span', { text: label }),
          el('span', { class: 'ratio', text: `${ratio.toFixed(2)}:1 ${pass ? 'pass' : 'fail, needs 4.5:1'}` }),
        ]);
      }),
    );
  }

  function apply() {
    const vars = changedVars();
    if (state.factor !== 1 && !boxes) boxes = measureBoxes(doc);
    const scaledBoxes = (boxes ?? []).map((box) => ({ selector: box.attr, values: box.values }));
    const css = [variableBlock(vars, { important: true }), ...overrideRules(state.overrides, { important: true }), ...boxRules(scaledBoxes, state.factor, { important: true })];
    pageSheet.set(css.filter(Boolean).join('\n'));
    output.textContent = liveCss({ vars, overrides: state.overrides, boxes: boxes ?? [], factor: state.factor, site: location.hostname || 'this page' });
    updateContrast();
  }

  // ---- controls
  const close = el('button', { type: 'button', class: 'close', 'aria-label': 'Close design panel', text: '×' });
  const toggle = el('button', { type: 'button', class: 'toggle', 'aria-expanded': 'true', 'aria-controls': 'sdk-live-panel', text: 'Design' });
  const panel = el('section', { id: 'sdk-live-panel', class: 'panel', 'aria-labelledby': 'sdk-live-title' });

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
      return slider({
        id: `sdk-live-scale-${kind}`,
        label,
        min: kind === 'radius' ? 0 : 0.5,
        max: kind === 'type' ? 1.5 : 2,
        step: 0.05,
        value: 1,
        show: percent,
        hint: `Scales ${names.length} variable${names.length === 1 ? '' : 's'}: ${listed}`,
        onInput: (value) => {
          state.scales[kind] = value;
          apply();
        },
      });
    });
  const colorSwatches = found.color.map(({ name, hex }) =>
    swatch(`sdk-live-var${name}`, name.slice(2), hex, (value) => {
      if (value === hex) delete state.colors[name];
      else state.colors[name] = value;
      apply();
    }),
  );

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
    apply();
  };
  const overrideSliders = [
    slider({ id: 'sdk-live-font-size', label: 'Body text size', min: 12, max: 24, step: 0.5, value: base.fontSize, show: (n) => `${n}px`, onInput: setOverride('fontSize') }),
    slider({ id: 'sdk-live-line-height', label: 'Line height', min: 1, max: 2.2, step: 0.05, value: base.lineHeight, show: (n) => n.toFixed(2), onInput: setOverride('lineHeight') }),
    slider({
      id: 'sdk-live-containers',
      label: 'Container spacing',
      min: 0.5,
      max: 2,
      step: 0.05,
      value: 1,
      show: percent,
      hint: 'Scales padding and gaps of sections, headers, footers, and containers',
      onInput: (value) => {
        state.factor = value;
        apply();
      },
    }),
    slider({ id: 'sdk-live-corner', label: 'Corner radius', min: 0, max: 32, step: 1, value: base.radius, show: (n) => `${n}px`, hint: 'Buttons, fields, images, and cards', onInput: setOverride('radius') }),
  ];
  const overrideSwatches = [
    ['text', 'Text'],
    ['background', 'Background'],
    ['accent', 'Accent (buttons)'],
    ['onAccent', 'Text on accent'],
  ].map(([key, label]) => swatch(`sdk-live-${key}`, label, base[key], setOverride(key)));

  const copy = el('button', { type: 'button', class: 'primary', text: 'Copy CSS' });
  const reset = el('button', { type: 'button', text: 'Reset' });
  const remove = el('button', { type: 'button', text: 'Remove' });

  panel.append(
    el('div', { class: 'header' }, [el('h2', { id: 'sdk-live-title', text: 'Design panel' }), close]),
    el('p', { class: 'hint', text: 'Changes stay in this tab: nothing is saved or sent. Remove or reload the page to undo them.' }),
    variablesSet,
    el('fieldset', {}, [
      el('legend', { text: 'Page overrides' }),
      ...overrideSliders.map((s) => s.node),
      el('div', { class: 'swatches' }, overrideSwatches.map((s) => s.node)),
    ]),
    el('fieldset', {}, [el('legend', { text: 'Contrast (WCAG)' }), contrastList]),
    el('fieldset', {}, [el('legend', { text: 'Changed values' }), output, el('div', { class: 'actions' }, [copy, reset, remove]), status]),
  );
  shadow.append(toggle, panel);

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    (open ? (panel.querySelector('input') ?? close) : toggle).focus();
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  // Keep the site's keyboard shortcuts from firing while you use the panel.
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (event) => event.stopPropagation());
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

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

  reset.addEventListener('click', () => {
    state.scales = { space: 1, type: 1, radius: 1 };
    state.colors = {};
    state.overrides = {};
    state.factor = 1;
    for (const s of scaleSliders) s.input.value = 1;
    overrideSliders[0].input.value = base.fontSize;
    overrideSliders[1].input.value = base.lineHeight;
    overrideSliders[2].input.value = 1;
    overrideSliders[3].input.value = base.radius;
    for (const s of [...scaleSliders, ...overrideSliders]) s.update();
    for (const [i, { hex }] of found.color.entries()) colorSwatches[i].input.value = hex;
    for (const [i, key] of ['text', 'background', 'accent', 'onAccent'].entries()) overrideSwatches[i].input.value = base[key];
    apply();
    status.textContent = 'Reset to the page as loaded.';
  });

  function destroy() {
    pageSheet.remove();
    for (const box of boxes ?? []) box.node.removeAttribute(BOX_ATTR);
    host.remove();
    delete window[GLOBAL];
  }
  remove.addEventListener('click', destroy);

  (doc.body ?? doc.documentElement).append(host);
  apply();
  setOpen(true);
  return { toggle: () => setOpen(panel.hidden), remove: destroy };
}

/** The bookmarklet's entry point: opens the panel, or toggles it when it is already on the page. */
export function toggleLivePanel(panelCss) {
  if (window[GLOBAL]) {
    window[GLOBAL].toggle();
    return;
  }
  window[GLOBAL] = createLivePanel(panelCss);
}
