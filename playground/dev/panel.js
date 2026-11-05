// Design panel: live sliders and color pickers for the kit's --sdk-* tokens.
//
// Every change sets the matching custom property on <html>, so the page
// updates at once. Changes survive live reloads (they are kept in this
// browser's localStorage) until you press Reset. Color picks are kept per
// appearance (light or dark) and apply only in that appearance. "Copy CSS"
// copies only the tokens you changed, ready to paste into a sketch stylesheet
// or to carry back into tokens/*.tokens.json.
//
// Three ways to use it:
// - mountDesignPanel() adds the floating Design button to the page (dev client).
// - mountDesignPanel({ root, container, storageKey, inline: true }) puts an
//   always-open panel in `container` that styles another document's <html>,
//   such as a same-origin iframe (variant boards).
// - followDesign({ root }) applies saved settings without any UI and follows
//   changes made in other windows (format frames).

import { contrastRatio, el, normalizeHex, scaleValue } from './util.js';

export { contrastRatio, normalizeHex, scaleValue } from './util.js';

export const STORAGE_KEY = 'sdk-playground-design';

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

const CHANGEABLE = [...SPACE, ...FONT_SIZES, ...RADII, ...COLORS.map((c) => c.name)];

// ---------------------------------------------------------------- helpers

/** Loads and saves one settings object in localStorage under `key`; never throws. */
export function storageFor(key) {
  return {
    load() {
      try {
        return JSON.parse(localStorage.getItem(key)) ?? {};
      } catch {
        return {};
      }
    },
    save(state) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage can be unavailable (private windows); the panel still works for this page view.
      }
    },
  };
}

const declarations = (values, indent) =>
  Object.keys(values)
    .sort()
    .map((name) => `${indent}${name}: ${values[name]};`);

/**
 * Builds the CSS for the changed tokens: scaled tokens in one :root block, and
 * each appearance's color picks under the selectors that appearance uses in
 * sdk-tokens.css.
 */
export function changedCss(scaled, colors = {}) {
  const light = colors.light ?? {};
  const dark = colors.dark ?? {};
  if (![scaled, light, dark].some((values) => Object.keys(values).length)) {
    return '/* No changes yet: move a slider or pick a color. */';
  }
  const blocks = ['/* Design panel values. Paste into a sketch stylesheet, or copy the numbers into tokens/*.tokens.json. */'];
  if (Object.keys(scaled).length) blocks.push([':root {', ...declarations(scaled, '  '), '}'].join('\n'));
  if (Object.keys(light).length) {
    blocks.push(['/* Colors picked in the light appearance. */', ':root {', ...declarations(light, '  '), '}'].join('\n'));
  }
  if (Object.keys(dark).length) {
    blocks.push(
      [
        '/* Colors picked in the dark appearance. */',
        '@media (prefers-color-scheme: dark) {',
        '  :root:not([data-theme="light"]) {',
        ...declarations(dark, '    '),
        '  }',
        '}',
        ':root[data-theme="dark"] {',
        ...declarations(dark, '  '),
        '}',
      ].join('\n'),
    );
  }
  return blocks.join('\n\n');
}

// ------------------------------------------------------------------ state

/**
 * The panel's settings and how they apply to one document. `root` is the
 * <html> element to style; setRoot() points it at a new document (an iframe
 * that reloaded). Settings are saved under `storageKey`.
 */
export function createDesign({ root, storageKey = STORAGE_KEY, onSchemeChange = () => {} }) {
  const store = storageFor(storageKey);
  const fresh = () => ({ open: false, appearance: 'system', scales: {}, colors: {} });
  const state = { ...fresh(), ...store.load() };
  let base = {};
  let query = null;

  const view = () => root.ownerDocument.defaultView;
  const computed = () => view().getComputedStyle(root);

  function onQueryChange() {
    refresh();
    onSchemeChange();
  }

  function watchScheme() {
    query?.removeEventListener('change', onQueryChange);
    query = view().matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', onQueryChange);
  }

  // The appearance the page is showing: light or dark.
  function scheme() {
    if (state.appearance !== 'system') return state.appearance;
    return query.matches ? 'dark' : 'light';
  }

  function picks() {
    const key = scheme();
    state.colors[key] ??= {};
    return state.colors[key];
  }

  // Reads the page's token values without the panel's overrides.
  function readBase() {
    const saved = root.style.cssText;
    root.style.cssText = '';
    const style = computed();
    const read = (name) => style.getPropertyValue(name).trim();
    base = {};
    for (const name of [...CHANGEABLE, ...PANEL_PINNED]) base[name] = read(name);
    for (const [fg, bg] of CONTRAST_PAIRS) {
      base[fg] = read(fg);
      base[bg] = read(bg);
    }
    root.style.cssText = saved;
  }

  function scaled() {
    const out = {};
    for (const scale of SCALES) {
      const factor = state.scales[scale.key] ?? 1;
      if (factor === 1) continue;
      for (const name of scale.tokens) if (base[name]) out[name] = scaleValue(base[name], factor);
    }
    return out;
  }

  function applyAppearance() {
    if (state.appearance === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.appearance);
  }

  function applyValues() {
    for (const name of CHANGEABLE) root.style.removeProperty(name);
    for (const [name, value] of Object.entries({ ...scaled(), ...picks() })) root.style.setProperty(name, value);
  }

  function refresh() {
    applyAppearance();
    readBase();
    applyValues();
  }

  watchScheme();

  return {
    state,
    get root() {
      return root;
    },
    base: (name) => base[name],
    scheme,
    picks,
    readBase,
    applyAppearance,
    applyValues,
    refresh,
    save: () => store.save(state),
    // The live value, so aliases (link and focus follow accent in light mode) stay accurate.
    currentColor: (name) => picks()[name] ?? normalizeHex(computed().getPropertyValue(name)),
    css: () => changedCss(scaled(), state.colors),
    setRoot(next) {
      root = next;
      watchScheme();
      refresh();
    },
    // Re-reads the saved settings (another window changed them).
    load() {
      Object.assign(state, fresh(), { open: state.open }, store.load());
    },
    reset() {
      Object.assign(state, fresh(), { open: state.open });
      refresh();
    },
  };
}

/**
 * Applies the saved settings to `root` with no UI, and follows changes saved
 * by a panel in another window or frame of this origin (the storage event).
 */
export function followDesign({ root = document.documentElement, storageKey = STORAGE_KEY } = {}) {
  const design = createDesign({ root, storageKey });
  design.refresh();
  root.ownerDocument.defaultView.addEventListener('storage', (event) => {
    if (event.key !== storageKey) return;
    design.load();
    design.refresh();
  });
  return design;
}

// ------------------------------------------------------------------ panel

/**
 * Mounts the panel UI. With no options it is the floating Design button for
 * this page. Returns { design, host, css(), setRoot(root) }, or undefined when
 * a floating panel is already on the page.
 */
export function mountDesignPanel({
  root = document.documentElement,
  container = document.body,
  storageKey = STORAGE_KEY,
  inline = false,
  title = 'Design panel',
  idPrefix = 'sdk-dp',
} = {}) {
  if (!inline && document.querySelector('[data-sdk-design-panel]:not([data-inline])')) return undefined;
  const design = createDesign({ root, storageKey, onSchemeChange: () => sync() });
  const { state } = design;

  const host = el('div', { 'data-sdk-design-panel': true, 'data-inline': inline });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(el('link', { rel: 'stylesheet', href: '/playground/dev/panel.css' }));

  // Keep the floating panel readable whatever the sliders do to its own page.
  function pin() {
    if (host.ownerDocument !== design.root.ownerDocument) return;
    for (const name of PANEL_PINNED) host.style.setProperty(name, design.base(name));
  }

  function apply() {
    design.applyValues();
    output.textContent = design.css();
    syncColorInputs();
    updateContrast();
    design.save();
  }

  function sync() {
    pin();
    apply();
  }

  // ---- toggle
  const toggle = el('button', {
    type: 'button',
    class: 'toggle',
    'aria-expanded': 'false',
    'aria-controls': `${idPrefix}-panel`,
    text: 'Design',
  });

  // ---- panel body
  const panel = el('section', { id: `${idPrefix}-panel`, class: 'panel', 'aria-labelledby': `${idPrefix}-title`, hidden: !inline });
  const header = el('div', { class: 'header' }, [
    el('h2', { id: `${idPrefix}-title`, text: title }),
    ...(inline ? [] : [el('button', { type: 'button', class: 'close', 'aria-label': `Close ${title.toLowerCase()}`, text: '×' })]),
  ]);

  const appearance = el('select', { id: `${idPrefix}-appearance` }, [
    el('option', { value: 'system', text: 'System' }),
    el('option', { value: 'light', text: 'Light' }),
    el('option', { value: 'dark', text: 'Dark' }),
  ]);
  appearance.value = state.appearance;
  const appearanceRow = el('div', { class: 'field' }, [el('label', { for: `${idPrefix}-appearance`, text: 'Appearance' }), appearance]);

  const scaleFields = SCALES.map((scale) => {
    const id = `${idPrefix}-${scale.key}`;
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
    const id = `${idPrefix}-${color.name.slice(2)}`;
    const input = el('input', { id, type: 'color' });
    input.addEventListener('input', () => {
      if (normalizeHex(design.base(color.name) ?? '') === input.value) delete design.picks()[color.name];
      else design.picks()[color.name] = input.value;
      apply();
    });
    return { color, input, node: el('div', { class: 'swatch' }, [input, el('label', { for: id, text: color.label })]) };
  });

  const contrastList = el('ul', { class: 'contrast', role: 'list' });
  function updateContrast() {
    contrastList.replaceChildren(
      ...CONTRAST_PAIRS.map(([fg, bg, label, minimum]) => {
        const a = design.currentColor(fg);
        const b = design.currentColor(bg);
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
  shadow.append(...(inline ? [] : [toggle]), panel);

  function syncColorInputs() {
    for (const field of colorFields) {
      const value = design.currentColor(field.color.name);
      field.input.disabled = !value;
      if (value) field.input.value = value;
    }
  }

  function syncControls() {
    appearance.value = state.appearance;
    for (const [i, scale] of SCALES.entries()) {
      scaleFields[i].input.value = state.scales[scale.key] ?? 1;
      scaleFields[i].show();
    }
  }

  function setOpen(open, { focus = true } = {}) {
    state.open = open;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    design.save();
    if (focus) (open ? appearance : toggle).focus();
  }

  if (!inline) {
    toggle.addEventListener('click', () => setOpen(!state.open));
    header.querySelector('.close').addEventListener('click', () => setOpen(false));
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    });
  }

  appearance.addEventListener('change', () => {
    state.appearance = appearance.value;
    design.refresh();
    sync();
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
    design.reset();
    syncControls();
    sync();
    status.textContent = 'Reset to the token values.';
  });

  container.append(host);
  design.refresh();
  sync();
  if (!inline) setOpen(Boolean(state.open), { focus: false });

  return {
    design,
    host,
    css: () => design.css(),
    setRoot(next) {
      design.setRoot(next);
      sync();
    },
  };
}
