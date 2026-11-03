// Design panel: live sliders and color pickers for the kit's --sdk-* tokens.
//
// Every change sets the matching custom property on <html>, so the page
// updates at once. Changes survive live reloads (they are kept in this
// browser's localStorage) until you press Reset. "Copy CSS" copies only the
// tokens you changed, ready to paste into a sketch stylesheet or to carry
// back into tokens/*.tokens.json.

const STORAGE_KEY = 'sdk-playground-design';

const SPACE = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96].map((n) => `--sdk-space-${n}`);
const FONT_SIZES = [
  'display-1',
  'display-2',
  'large-title',
  'title-1',
  'title-2',
  'title-3',
  'headline',
  'body',
  'callout',
  'subhead',
  'footnote',
  'caption-1',
  'caption-2',
].map((name) => `--sdk-font-size-${name}`);
const RADII = [4, 8, 12, 16, 24].map((n) => `--sdk-radius-${n}`);

const SCALES = [
  { key: 'space', label: 'Spacing', tokens: SPACE, min: 0.5, max: 2, step: 0.05, hint: 'Scales every --sdk-space-* step' },
  { key: 'type', label: 'Type scale', tokens: FONT_SIZES, min: 0.75, max: 1.5, step: 0.025, hint: 'Scales every --sdk-font-size-* style' },
  { key: 'radius', label: 'Corner radius', tokens: RADII, min: 0, max: 2.5, step: 0.05, hint: 'Scales --sdk-radius-4 to -24' },
];

const COLORS = [
  ['bg', 'Background'],
  ['bg-secondary', 'Background, secondary'],
  ['bg-elevated', 'Background, elevated'],
  ['label', 'Text'],
  ['label-secondary', 'Text, secondary'],
  ['separator-opaque', 'Control border'],
  ['accent', 'Accent'],
  ['on-accent', 'Text on accent'],
  ['link', 'Link'],
  ['sale', 'Sale'],
].map(([role, label]) => ({ name: `--sdk-color-${role}`, label }));

const CONTRAST_PAIRS = [
  ['--sdk-color-label', '--sdk-color-bg', 'Text on background', 4.5],
  ['--sdk-color-label-secondary', '--sdk-color-bg', 'Secondary text on background', 4.5],
  ['--sdk-color-link', '--sdk-color-bg', 'Link on background', 4.5],
  ['--sdk-color-on-accent', '--sdk-color-accent', 'Text on accent', 4.5],
  ['--sdk-color-separator-opaque', '--sdk-color-bg', 'Control border on background', 3],
];

// Tokens the panel itself uses, pinned to their original values so the panel
// stays readable whatever you do to the page.
const PANEL_PINNED = [
  '--sdk-space-4',
  '--sdk-space-8',
  '--sdk-space-12',
  '--sdk-space-16',
  '--sdk-font-size-footnote',
  '--sdk-font-size-subhead',
  '--sdk-font-size-headline',
  '--sdk-radius-8',
  '--sdk-radius-12',
  '--sdk-radius-16',
  '--sdk-radius-full',
  '--sdk-color-bg-elevated',
  '--sdk-color-bg-secondary',
  '--sdk-color-label',
  '--sdk-color-label-secondary',
  '--sdk-color-separator',
  '--sdk-color-separator-opaque',
  '--sdk-color-accent',
  '--sdk-color-on-accent',
  '--sdk-color-focus',
  '--sdk-color-success',
  '--sdk-color-danger',
];

// ---------------------------------------------------------------- helpers

const storage = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
      return {};
    }
  },
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private windows); the panel still works for this page view.
    }
  },
};

const round = (n) => Math.round(n * 10000) / 10000;

/** Multiplies every length in a token value: "1rem" → "1.25rem", clamp(…) included. */
export function scaleValue(value, factor) {
  return value.replace(/(-?\d*\.?\d+)(rem|px|em|vw|vh|svh|ch)\b/g, (_, n, unit) => `${round(Number(n) * factor)}${unit}`);
}

/** Returns "#rrggbb" for a #rgb or #rrggbb value, or null for anything else. */
export function normalizeHex(value) {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio between two #rrggbb colors. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Builds the CSS block for the changed tokens. */
export function changedCss(changes, appearance) {
  const names = Object.keys(changes).sort();
  if (!names.length) return '/* No changes yet: move a slider or pick a color. */';
  const note = appearance === 'system' ? '' : ` (picked in ${appearance} appearance)`;
  return [
    `/* Design panel values${note}. Paste into a sketch stylesheet, or copy the numbers into tokens/*.tokens.json. */`,
    ':root {',
    ...names.map((name) => `  ${name}: ${changes[name]};`),
    '}',
  ].join('\n');
}

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'text') node.textContent = value;
    else if (value !== false && value !== undefined) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children);
  return node;
}

// ------------------------------------------------------------------ panel

export function mountDesignPanel() {
  if (document.querySelector('[data-sdk-design-panel]')) return;
  const root = document.documentElement;
  const state = { open: false, appearance: 'system', direction: null, scales: {}, colors: {}, ...storage.load() };
  const pageDirection = root.getAttribute('dir');
  let base = {};

  const host = el('div', { 'data-sdk-design-panel': true });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(el('link', { rel: 'stylesheet', href: '/playground/dev/panel.css' }));

  // Reads the page's token values without the panel's overrides.
  function readBase() {
    const saved = root.style.cssText;
    root.style.cssText = '';
    const computed = getComputedStyle(root);
    const read = (name) => computed.getPropertyValue(name).trim();
    base = {};
    for (const name of [...SPACE, ...FONT_SIZES, ...RADII, ...COLORS.map((c) => c.name), ...PANEL_PINNED]) base[name] = read(name);
    for (const [fg, bg] of CONTRAST_PAIRS) {
      base[fg] = read(fg);
      base[bg] = read(bg);
    }
    root.style.cssText = saved;
    for (const name of PANEL_PINNED) host.style.setProperty(name, base[name]);
  }

  function changes() {
    const out = {};
    for (const scale of SCALES) {
      const factor = state.scales[scale.key] ?? 1;
      if (factor === 1) continue;
      for (const name of scale.tokens) if (base[name]) out[name] = scaleValue(base[name], factor);
    }
    for (const [name, value] of Object.entries(state.colors)) {
      if (normalizeHex(base[name] ?? '') !== value) out[name] = value;
    }
    return out;
  }

  function applyAppearance() {
    if (state.appearance === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.appearance);
  }

  function apply() {
    for (const name of [...SPACE, ...FONT_SIZES, ...RADII, ...COLORS.map((c) => c.name)]) root.style.removeProperty(name);
    const current = changes();
    for (const [name, value] of Object.entries(current)) root.style.setProperty(name, value);
    output.textContent = changedCss(current, state.appearance);
    syncColorInputs();
    updateContrast();
    storage.save(state);
  }

  // The live value, so aliases (link and focus follow accent in light mode) stay accurate.
  function currentColor(name) {
    return state.colors[name] ?? normalizeHex(getComputedStyle(root).getPropertyValue(name));
  }

  // ---- toggle
  const toggle = el('button', {
    type: 'button',
    class: 'toggle',
    'aria-expanded': 'false',
    'aria-controls': 'sdk-design-panel',
    text: 'Design',
  });

  // ---- panel body
  const panel = el('section', { id: 'sdk-design-panel', class: 'panel', 'aria-labelledby': 'sdk-design-title', hidden: true });
  const header = el('div', { class: 'header' }, [
    el('h2', { id: 'sdk-design-title', text: 'Design panel' }),
    el('button', { type: 'button', class: 'close', 'aria-label': 'Close design panel', text: '×' }),
  ]);

  const appearance = el('select', { id: 'sdk-dp-appearance' }, [
    el('option', { value: 'system', text: 'System' }),
    el('option', { value: 'light', text: 'Light' }),
    el('option', { value: 'dark', text: 'Dark' }),
  ]);
  appearance.value = state.appearance;
  const direction = el('select', { id: 'sdk-dp-direction' }, [
    el('option', { value: '', text: 'As the page sets it' }),
    el('option', { value: 'ltr', text: 'Left to right' }),
    el('option', { value: 'rtl', text: 'Right to left' }),
  ]);
  direction.value = state.direction ?? '';
  const appearanceRow = el('div', { class: 'pair' }, [
    el('div', { class: 'field' }, [el('label', { for: 'sdk-dp-appearance', text: 'Appearance' }), appearance]),
    el('div', { class: 'field' }, [el('label', { for: 'sdk-dp-direction', text: 'Direction' }), direction]),
  ]);

  function applyDirection() {
    const value = state.direction || pageDirection;
    if (value) root.setAttribute('dir', value);
    else root.removeAttribute('dir');
  }
  direction.addEventListener('change', () => {
    state.direction = direction.value || null;
    applyDirection();
    storage.save(state);
  });

  const scaleFields = SCALES.map((scale) => {
    const id = `sdk-dp-${scale.key}`;
    const input = el('input', {
      id,
      type: 'range',
      min: scale.min,
      max: scale.max,
      step: scale.step,
      value: state.scales[scale.key] ?? 1,
      'aria-describedby': `${id}-hint`,
    });
    const value = el('output', { for: id });
    const show = () => {
      value.textContent = `${Math.round(Number(input.value) * 100)}%`;
    };
    show();
    input.addEventListener('input', () => {
      state.scales[scale.key] = Number(input.value);
      show();
      apply();
    });
    return {
      input,
      show,
      node: el('div', { class: 'field' }, [
        el('div', { class: 'label-row' }, [el('label', { for: id, text: scale.label }), value]),
        input,
        el('p', { id: `${id}-hint`, class: 'hint', text: scale.hint }),
      ]),
    };
  });

  const colorFields = COLORS.map((color) => {
    const id = `sdk-dp-${color.name.slice(2)}`;
    const input = el('input', { id, type: 'color' });
    input.addEventListener('input', () => {
      state.colors[color.name] = input.value;
      apply();
    });
    return { color, input, node: el('div', { class: 'swatch' }, [input, el('label', { for: id, text: color.label })]) };
  });

  const contrastList = el('ul', { class: 'contrast', role: 'list' });
  function updateContrast() {
    contrastList.replaceChildren(
      ...CONTRAST_PAIRS.map(([fg, bg, label, minimum]) => {
        const a = currentColor(fg);
        const b = currentColor(bg);
        if (!a || !b) return el('li', { text: `${label}: n/a` });
        const ratio = contrastRatio(a, b);
        const pass = ratio >= minimum;
        return el('li', { 'data-pass': String(pass) }, [
          el('span', { text: label }),
          el('span', { class: 'ratio', text: `${ratio.toFixed(2)}:1 ${pass ? 'pass' : `fail, needs ${minimum}:1`}` }),
        ]);
      }),
    );
  }

  const output = el('pre', { class: 'output', tabindex: '0', 'aria-label': 'Changed tokens as CSS' });
  const status = el('p', { class: 'status', role: 'status' });
  const copy = el('button', { type: 'button', class: 'primary', text: 'Copy CSS' });
  const reset = el('button', { type: 'button', text: 'Reset' });

  panel.append(
    header,
    appearanceRow,
    el('fieldset', {}, [el('legend', { text: 'Scale' }), ...scaleFields.map((f) => f.node)]),
    el('fieldset', {}, [el('legend', { text: 'Colors' }), el('div', { class: 'swatches' }, colorFields.map((f) => f.node))]),
    el('fieldset', {}, [el('legend', { text: 'Contrast (WCAG)' }), contrastList]),
    el('fieldset', {}, [el('legend', { text: 'Changed values' }), output, el('div', { class: 'actions' }, [copy, reset]), status]),
  );
  shadow.append(toggle, panel);

  function syncColorInputs() {
    for (const field of colorFields) {
      const value = currentColor(field.color.name);
      field.input.disabled = !value;
      if (value) field.input.value = value;
    }
  }

  function setOpen(open, { focus = true } = {}) {
    state.open = open;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    storage.save(state);
    if (focus) (open ? appearance : toggle).focus();
  }

  toggle.addEventListener('click', () => setOpen(!state.open));
  header.querySelector('.close').addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  });

  appearance.addEventListener('change', () => {
    state.appearance = appearance.value;
    applyAppearance();
    readBase();
    syncColorInputs();
    apply();
  });

  copy.addEventListener('click', async () => {
    const text = output.textContent;
    try {
      await navigator.clipboard.writeText(text);
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
    state.scales = {};
    state.colors = {};
    state.appearance = 'system';
    appearance.value = 'system';
    state.direction = null;
    direction.value = '';
    applyAppearance();
    applyDirection();
    readBase();
    for (const field of scaleFields) {
      field.input.value = 1;
      field.show();
    }
    syncColorInputs();
    apply();
    status.textContent = 'Reset to the token values.';
  });

  // Follow OS appearance changes while on System.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readBase();
    syncColorInputs();
    apply();
  });

  document.body.append(host);
  applyAppearance();
  applyDirection();
  readBase();
  syncColorInputs();
  apply();
  setOpen(Boolean(state.open), { focus: false });
}
