// Presets: named, partial settings for the design panels.
//
// A preset is { name, settings } where settings is a partial live-panel
// settings object ({ scales, factor, colors, overrides }, see live-panel.js),
// or a function of the page's current values that returns one. Applying a
// preset layers it onto the current settings: scales and factor multiply,
// colors and overrides replace. The panel then moves its sliders to the
// result, so the sliders stay the source of truth and a preset is a shortcut.
//
// Both panels use this file: live-panel.js (local copies, the bookmarklet,
// variant boards) and panel.js (the kit's tokens, via kitLayer()). "Save mine"
// keeps your own presets in a store: localStorage on the playground
// (storagePresets), or memory only for the bookmarklet (memoryPresets), which
// never touches a site's storage. Export and Import move them as JSON.
//
// Bundled into the bookmarklet by bookmarklet.js with util.js and
// live-panel.js in one scope, so keep imports relative and single-line, avoid
// multi-line template literals, and give private names a `preset` prefix.

import { contrastRatio, el, normalizeHex, round } from './util.js';

export const PRESET_STORAGE_KEY = 'sdk-playground-presets';
export const PRESET_FILE_FORMAT = 'sdk-design-presets';
const PRESET_MAX_MINE = 50;
const PRESET_MAX_NAME = 60;
const PRESET_SCALES = ['space', 'type', 'radius'];
const PRESET_NUMBERS = ['fontSize', 'lineHeight', 'radius'];
const PRESET_COLORS = ['text', 'background', 'accent', 'onAccent'];

// ------------------------------------------------------------------ colors

const presetChannels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const presetHex = (channels) => `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** Mixes two #rrggbb colors in sRGB: t = 0 is `from`, 1 is `to`. */
export function mixHex(from, to, t) {
  const a = presetChannels(from);
  const b = presetChannels(to);
  return presetHex(a.map((c, i) => c + (b[i] - c) * t));
}

/**
 * Moves `color` toward black or white, whichever contrasts more with
 * `against`, just far enough to reach `target`:1. Returns it unchanged when it
 * already does, and the extreme itself when even that falls short.
 */
export function toContrast(color, against, target = 7) {
  if (contrastRatio(color, against) >= target) return color;
  const end = contrastRatio('#000000', against) >= contrastRatio('#ffffff', against) ? '#000000' : '#ffffff';
  if (contrastRatio(end, against) < target) return end;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(mixHex(color, end, mid), against) >= target) hi = mid;
    else lo = mid;
  }
  return mixHex(color, end, hi);
}

/** Text and accent (with its text) moved to `target`:1, given the current { text, background, accent, onAccent }. */
export function contrastColors({ text, background, accent, onAccent }, target = 7) {
  let nextAccent = toContrast(accent, onAccent, target);
  let nextOnAccent = onAccent;
  if (contrastRatio(nextAccent, onAccent) < target) {
    // A mid-tone text color can't reach the target on any accent: switch it to black or white.
    nextOnAccent = contrastRatio('#000000', accent) >= contrastRatio('#ffffff', accent) ? '#000000' : '#ffffff';
    nextAccent = toContrast(accent, nextOnAccent, target);
  }
  return { text: toContrast(text, background, target), accent: nextAccent, onAccent: nextOnAccent };
}

// ----------------------------------------------------------------- built-in

const halfStep = (n) => Math.round(n * 2) / 2;

/**
 * The built-in presets. `settings` gets the page's current values
 * { fontSize, lineHeight, radius, text, background, accent, onAccent }
 * (px, unitless, px, and #rrggbb), so a preset can build on them.
 */
export const BUILT_IN_PRESETS = [
  {
    id: 'airy',
    name: 'Airy',
    hint: 'More space and line height',
    settings: { scales: { space: 1.25 }, factor: 1.25, overrides: { lineHeight: 1.7 } },
  },
  {
    id: 'compact',
    name: 'Compact',
    hint: 'Less space and tighter lines',
    settings: { scales: { space: 0.8 }, factor: 0.8, overrides: { lineHeight: 1.35 } },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    hint: 'Bigger reading text with generous lines and space',
    settings: (now) => ({
      scales: { type: 1.1, space: 1.1 },
      factor: 1.1,
      overrides: { fontSize: Math.max(18, now.fontSize), lineHeight: 1.65 },
    }),
  },
  {
    id: 'soft-corners',
    name: 'Soft corners',
    hint: 'Rounder buttons, fields, images, and cards',
    settings: (now) => ({ scales: { radius: 1.5 }, overrides: { radius: Math.max(12, Math.round(now.radius * 1.5)) } }),
  },
  {
    id: 'sharp-corners',
    name: 'Sharp corners',
    hint: 'Square corners everywhere',
    settings: { scales: { radius: 0 }, overrides: { radius: 0 } },
  },
  {
    id: 'larger-text',
    name: 'Larger text',
    hint: 'Text 15% larger',
    settings: (now) => ({ scales: { type: 1.15 }, overrides: { fontSize: halfStep(now.fontSize * 1.15) } }),
  },
  {
    id: 'higher-contrast',
    name: 'Higher contrast',
    hint: 'Text and accent moved to 7:1 (WCAG AAA)',
    settings: (now) => ({ overrides: contrastColors(now, 7) }),
  },
];

// ---------------------------------------------------------------- settings

const presetNumber = (value, min, max) => {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) && n >= min && n <= max ? round(n) : undefined;
};

/**
 * Keeps only valid parts of a partial settings object (an imported or saved
 * preset): scales and factor from 0 to 4, sizes from 0 to 100, colors as
 * "#rrggbb", and variable names starting with "--". Empty parts are left out.
 */
export function normalizePresetSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const scales = {};
  for (const kind of PRESET_SCALES) {
    const value = presetNumber(input.scales?.[kind], 0, 4);
    if (value !== undefined) scales[kind] = value;
  }
  if (Object.keys(scales).length) out.scales = scales;
  const factor = presetNumber(input.factor, 0, 4);
  if (factor !== undefined) out.factor = factor;
  const colors = {};
  for (const [name, value] of Object.entries(input.colors && typeof input.colors === 'object' ? input.colors : {})) {
    const hex = typeof value === 'string' ? normalizeHex(value) : null;
    if (/^--[\w-]+$/.test(name) && hex) colors[name] = hex;
  }
  if (Object.keys(colors).length) out.colors = colors;
  const overrides = {};
  const given = input.overrides && typeof input.overrides === 'object' ? input.overrides : {};
  for (const key of PRESET_NUMBERS) {
    const value = presetNumber(given[key], 0, 100);
    if (value !== undefined) overrides[key] = value;
  }
  for (const key of PRESET_COLORS) {
    const hex = typeof given[key] === 'string' ? normalizeHex(given[key]) : null;
    if (hex) overrides[key] = hex;
  }
  if (Object.keys(overrides).length) out.overrides = overrides;
  return out;
}

/** A preset's partial settings for the page's current values (see BUILT_IN_PRESETS). */
export function presetSettings(preset, now) {
  const settings = typeof preset.settings === 'function' ? preset.settings(now) : preset.settings;
  return normalizePresetSettings(settings);
}

/** `value` clamped to a slider's { min, max } and rounded to its step, the way the slider shows it. */
export function snapToSlider(value, { min, max, step }) {
  const clamped = Math.min(max, Math.max(min, value));
  return round(Math.min(max, min + Math.round((clamped - min) / step) * step));
}

/**
 * Layers partial settings onto full live-panel settings: scales and factor
 * multiply, colors and overrides replace. Scales and factor land on their
 * slider's step within `ranges` (LIVE_RANGES), so the sliders show the result.
 */
export function layerPreset(state, partial, ranges) {
  const scales = { ...state.scales };
  for (const [kind, factor] of Object.entries(partial.scales ?? {})) scales[kind] = snapToSlider((scales[kind] ?? 1) * factor, ranges[kind]);
  return {
    scales,
    factor: snapToSlider((state.factor ?? 1) * (partial.factor ?? 1), ranges.factor),
    colors: { ...state.colors, ...partial.colors },
    overrides: { ...state.overrides, ...partial.overrides },
  };
}

/** The kit token each color override sets on the kit's design panel. */
export const KIT_COLOR_FOR = {
  text: '--sdk-color-label',
  background: '--sdk-color-bg',
  accent: '--sdk-color-accent',
  onAccent: '--sdk-color-on-accent',
};

/**
 * Layers partial settings onto the kit panel's settings ({ scales, colors:
 * { light, dark } }, see panel.js). The kit has one scale per kind, so a
 * preset's scale multiplies it; without one, its px size sets it instead
 * (fontSize against the body size, radius against --sdk-radius-8), and factor
 * stands in for a missing spacing scale. Colors go to the appearance shown:
 * text, background, accent, and onAccent to their kit roles, and --sdk-color-*
 * names as they are; a color equal to the kit's own value is dropped, not
 * picked. Line height has no kit token and is skipped.
 * `kit` is { scheme, bodyPx, radiusPx, ranges: { space, type, radius }, colorNames, base(name) }.
 */
export function kitLayer(state, partial, kit) {
  const scales = { ...state.scales };
  const scale = (key) => scales[key] ?? 1;
  const set = (key, value) => {
    scales[key] = snapToSlider(value, kit.ranges[key]);
  };
  const { scales: given = {}, overrides = {} } = partial;
  if (given.space !== undefined) set('space', scale('space') * given.space);
  else if (partial.factor !== undefined) set('space', scale('space') * partial.factor);
  if (given.type !== undefined) set('type', scale('type') * given.type);
  else if (overrides.fontSize !== undefined && kit.bodyPx) set('type', overrides.fontSize / kit.bodyPx);
  if (given.radius !== undefined) set('radius', scale('radius') * given.radius);
  else if (overrides.radius !== undefined && kit.radiusPx) set('radius', overrides.radius / kit.radiusPx);
  const picks = { ...state.colors?.[kit.scheme] };
  const pick = (name, hex) => {
    if (normalizeHex(kit.base(name) ?? '') === hex) delete picks[name];
    else picks[name] = hex;
  };
  for (const [name, hex] of Object.entries(partial.colors ?? {})) if (kit.colorNames.includes(name)) pick(name, hex);
  for (const [key, name] of Object.entries(KIT_COLOR_FOR)) if (overrides[key]) pick(name, overrides[key]);
  return { scales, colors: { ...state.colors, [kit.scheme]: picks } };
}

/** The kit panel's settings for one appearance as a preset: its scales, and its color picks. */
export function kitAsPreset(state, scheme) {
  const roles = Object.fromEntries(Object.entries(KIT_COLOR_FOR).map(([key, name]) => [name, key]));
  const settings = { scales: {}, colors: {}, overrides: {} };
  for (const [kind, value] of Object.entries(state.scales ?? {})) if (value !== 1) settings.scales[kind] = value;
  for (const [name, hex] of Object.entries(state.colors?.[scheme] ?? {})) {
    if (roles[name]) settings.overrides[roles[name]] = hex;
    else settings.colors[name] = hex;
  }
  return normalizePresetSettings(settings);
}

/** Live-panel settings as a preset: everything that differs from the page as loaded. */
export function liveAsPreset(state) {
  const scales = Object.fromEntries(Object.entries(state.scales ?? {}).filter(([, value]) => value !== 1));
  return normalizePresetSettings({ ...state, scales, factor: state.factor === 1 ? undefined : state.factor });
}

// ------------------------------------------------------------- your presets

/** A valid saved preset { id, name, settings }, or null. */
export function normalizePreset(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') return null;
  const name = raw.name.trim().replace(/\s+/g, ' ').slice(0, PRESET_MAX_NAME);
  if (!name) return null;
  const id = typeof raw.id === 'string' && /^mine-[\w-]{1,40}$/.test(raw.id) ? raw.id : presetId(name);
  return { id, name, settings: normalizePresetSettings(raw.settings) };
}

let presetCounter = 0;
function presetId(name) {
  presetCounter += 1;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'preset';
  return `mine-${slug}-${Date.now().toString(36)}${presetCounter}`;
}

/** Your presets as the JSON text Export saves. */
export function presetFile(presets) {
  return JSON.stringify({ format: PRESET_FILE_FORMAT, version: 1, presets: presets.map(({ name, settings }) => ({ name, settings })) }, null, 2);
}

/** Reads a file Export saved. Throws an Error with a readable message. */
export function parsePresetFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON.');
  }
  const list = data?.format === PRESET_FILE_FORMAT ? data.presets : null;
  if (!Array.isArray(list)) throw new Error('That file has no design presets.');
  const presets = list.map((raw) => normalizePreset({ name: raw?.name, settings: raw?.settings })).filter(Boolean);
  if (!presets.length) throw new Error('That file has no design presets.');
  return presets;
}

/** Adds presets to a list; one with the same name (any case) replaces the old one. Keeps the newest 50. */
export function mergePresets(list, added) {
  const out = [...list];
  for (const preset of added) {
    const at = out.findIndex((p) => p.name.toLowerCase() === preset.name.toLowerCase());
    if (at === -1) out.push(preset);
    else out[at] = { ...preset, id: out[at].id };
  }
  return out.slice(-PRESET_MAX_MINE);
}

// A store holds your presets and tells every panel using it when they change.
function presetStoreWith(read, write) {
  const listeners = new Set();
  return {
    list: () => (read() ?? []).map(normalizePreset).filter(Boolean),
    save(list) {
      write(list.map(normalizePreset).filter(Boolean));
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: () => listeners.forEach((listener) => listener()),
  };
}

/** Presets kept only in memory, for this tab: what the bookmarklet uses, since it never touches a site's storage. */
export function memoryPresets() {
  let saved = [];
  return presetStoreWith(
    () => saved,
    (list) => {
      saved = list;
    },
  );
}

const presetStores = new Map();

/**
 * Presets kept in this browser's localStorage under `key`, shared by every
 * panel on the playground's origin (one store per key in a window, and the
 * storage event for other windows). Never throws: without storage they last
 * for this page view.
 */
export function storagePresets(key = PRESET_STORAGE_KEY) {
  if (presetStores.has(key)) return presetStores.get(key);
  let fallback = [];
  const store = presetStoreWith(
    () => {
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        return Array.isArray(saved) ? saved : [];
      } catch {
        return fallback;
      }
    },
    (list) => {
      fallback = list;
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch {
        // Storage unavailable (a private window): the presets last for this page view.
      }
    },
  );
  try {
    addEventListener('storage', (event) => {
      if (event.key === key) store.notify();
    });
  } catch {
    // No window (tests): nothing to follow.
  }
  presetStores.set(key, store);
  return store;
}

// ---------------------------------------------------------------------- UI

/**
 * The Presets fieldset both panels show. `apply(preset)` layers a preset onto
 * the panel's settings, and `current()` returns its settings as a preset, for
 * Save mine. Returns { node, destroy }.
 */
export function presetControls({ idPrefix, store, apply, current, note }) {
  const id = (name) => `${idPrefix}-${name}`;
  const status = el('p', { class: 'status', role: 'status' });
  const done = (text) => {
    status.textContent = text;
  };

  const builtIns = el(
    'div',
    { class: 'presets' },
    BUILT_IN_PRESETS.map((preset) => {
      const button = el('button', { type: 'button', title: preset.hint, 'data-preset': preset.id, text: preset.name });
      button.addEventListener('click', () => {
        apply(preset);
        done(`Applied ${preset.name}.`);
      });
      return button;
    }),
  );

  const mineList = el('ul', { class: 'presets mine', role: 'list', 'aria-label': 'Your presets' });
  const empty = el('p', { class: 'hint', text: 'No presets of your own yet.' });
  const exportButton = el('button', { type: 'button', text: 'Export' });

  function render() {
    const mine = store.list();
    mineList.replaceChildren(
      ...mine.map((preset) => {
        const use = el('button', { type: 'button', 'data-preset': preset.id, text: preset.name });
        use.addEventListener('click', () => {
          apply(preset);
          done(`Applied ${preset.name}.`);
        });
        const remove = el('button', { type: 'button', class: 'remove', 'aria-label': `Delete ${preset.name}`, text: '×' });
        remove.addEventListener('click', () => {
          store.save(store.list().filter((p) => p.id !== preset.id));
          done(`Deleted ${preset.name}.`);
        });
        return el('li', {}, [use, remove]);
      }),
    );
    mineList.hidden = !mine.length;
    empty.hidden = Boolean(mine.length);
    exportButton.disabled = !mine.length;
  }

  const nameInput = el('input', { id: id('preset-name'), type: 'text', maxlength: String(PRESET_MAX_NAME), autocomplete: 'off', placeholder: 'My preset' });
  const save = el('button', { type: 'button', text: 'Save mine' });
  save.addEventListener('click', () => {
    const preset = normalizePreset({ name: nameInput.value || 'My preset', settings: current() });
    store.save(mergePresets(store.list(), [preset]));
    nameInput.value = '';
    done(`Saved ${preset.name}.`);
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save.click();
  });

  exportButton.addEventListener('click', () => {
    const link = el('a', { href: `data:application/json;charset=utf-8,${encodeURIComponent(presetFile(store.list()))}`, download: 'design-presets.json' });
    link.click();
    done('Exported design-presets.json.');
  });

  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
  const importButton = el('button', { type: 'button', text: 'Import' });
  importButton.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const [chosen] = file.files ?? [];
    file.value = '';
    if (!chosen) return;
    try {
      const added = parsePresetFile(await chosen.text());
      store.save(mergePresets(store.list(), added));
      done(`Imported ${added.length} preset${added.length === 1 ? '' : 's'}.`);
    } catch (error) {
      done(error.message);
    }
  });

  const unsubscribe = store.subscribe(render);
  render();

  const node = el('fieldset', {}, [
    el('legend', { text: 'Presets' }),
    el('p', { class: 'hint', text: 'Each adds to the current settings: scales multiply, sizes and colors replace. The sliders show the result.' }),
    builtIns,
    el('div', { class: 'field' }, [
      el('label', { for: id('preset-name'), text: 'Save the current settings as' }),
      el('div', { class: 'row' }, [nameInput, save]),
    ]),
    mineList,
    empty,
    el('div', { class: 'actions' }, [exportButton, importButton, file]),
    ...(note ? [el('p', { class: 'hint', text: note })] : []),
    status,
  ]);
  return { node, destroy: unsubscribe };
}
