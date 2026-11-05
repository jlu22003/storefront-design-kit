// Design presets (playground/dev/presets.js): the built-ins, how a preset
// layers onto live-panel and kit-panel settings, and saving, exporting, and
// importing your own.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LIVE_RANGES, freshLiveState, normalizeLiveState } from '../../playground/dev/live-panel.js';
import {
  BUILT_IN_PRESETS,
  KIT_COLOR_FOR,
  PRESET_FILE_FORMAT,
  contrastColors,
  kitAsPreset,
  kitLayer,
  layerPreset,
  liveAsPreset,
  memoryPresets,
  mergePresets,
  mixHex,
  normalizePreset,
  normalizePresetSettings,
  parsePresetFile,
  presetFile,
  presetSettings,
  storagePresets,
  toContrast,
} from '../../playground/dev/presets.js';
import { contrastRatio } from '../../playground/dev/util.js';

const NOW = { fontSize: 16, lineHeight: 1.5, radius: 4, text: '#666666', background: '#ffffff', accent: '#3b82f6', onAccent: '#ffffff' };
const builtIn = (id) => BUILT_IN_PRESETS.find((preset) => preset.id === id);
const apply = (state, id, now = NOW) => normalizeLiveState(layerPreset(normalizeLiveState(state), presetSettings(builtIn(id), now), LIVE_RANGES));

describe('contrast helpers', () => {
  test('mixHex blends in sRGB', () => {
    assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
    assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
    assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  });

  test('toContrast moves a color just far enough, toward the better extreme', () => {
    const darker = toContrast('#888888', '#ffffff', 7);
    assert.ok(contrastRatio(darker, '#ffffff') >= 7);
    assert.ok(contrastRatio(darker, '#ffffff') < 7.3, 'stops close to the target');
    const lighter = toContrast('#555555', '#111111', 7);
    assert.ok(contrastRatio(lighter, '#111111') >= 7);
    assert.ok(parseInt(lighter.slice(1, 3), 16) > 0x55, 'lightens on a dark background');
    assert.equal(toContrast('#000000', '#ffffff', 7), '#000000', 'already passing: unchanged');
    // Nothing reaches 7:1 on mid gray: the best extreme comes back.
    assert.equal(toContrast('#777777', '#777777', 7), '#000000');
  });

  test('contrastColors moves text and accent to 7:1, and switches text on accent when it must', () => {
    const out = contrastColors(NOW, 7);
    assert.ok(contrastRatio(out.text, NOW.background) >= 7);
    assert.ok(contrastRatio(out.onAccent, out.accent) >= 7);
    assert.equal(out.onAccent, '#ffffff', 'the accent darkens under white text');
    const mid = contrastColors({ ...NOW, accent: '#808080', onAccent: '#808080' }, 7);
    assert.ok(contrastRatio(mid.onAccent, mid.accent) >= 7);
  });
});

describe('built-in presets', () => {
  test('there are the seven named presets, each a valid partial settings object', () => {
    assert.deepEqual(
      BUILT_IN_PRESETS.map((preset) => preset.name),
      ['Airy', 'Compact', 'Editorial', 'Soft corners', 'Sharp corners', 'Larger text', 'Higher contrast'],
    );
    for (const preset of BUILT_IN_PRESETS) {
      const settings = presetSettings(preset, NOW);
      assert.ok(Object.keys(settings).length, `${preset.name} changes something`);
      assert.deepEqual(normalizePresetSettings(settings), settings, `${preset.name} is already normal`);
      assert.ok(preset.hint, `${preset.name} has a hint`);
    }
  });

  test('applying layers onto the current settings: scales multiply, overrides replace', () => {
    const start = { scales: { space: 1.2, type: 1, radius: 1 }, factor: 1.2, overrides: { lineHeight: 1.4, fontSize: 18 }, colors: { '--brand': '#123456' } };
    const airy = apply(start, 'airy');
    assert.equal(airy.scales.space, 1.5);
    assert.equal(airy.factor, 1.5);
    assert.equal(airy.overrides.lineHeight, 1.7, 'line height replaced');
    assert.equal(airy.overrides.fontSize, 18, 'what the preset leaves alone stays');
    assert.deepEqual(airy.colors, { '--brand': '#123456' });
    // Stacking keeps multiplying, and the panel clamps to its slider range.
    assert.equal(apply(apply(apply(airy, 'airy'), 'airy'), 'airy').scales.space, LIVE_RANGES.space.max);
    // Stacked scales land on the slider's 0.05 step: 1.25 × 1.25 = 1.5625 shows as 1.55.
    const twice = apply(apply(freshLiveState(), 'airy'), 'airy');
    assert.deepEqual([twice.scales.space, twice.factor], [1.55, 1.55]);
    const compact = apply(freshLiveState(), 'compact');
    assert.deepEqual([compact.scales.space, compact.factor, compact.overrides.lineHeight], [0.8, 0.8, 1.35]);
  });

  test('corner presets set radius variables and the corner radius override', () => {
    const sharp = apply(freshLiveState(), 'sharp-corners');
    assert.equal(sharp.scales.radius, 0);
    assert.equal(sharp.overrides.radius, 0);
    const soft = apply(freshLiveState(), 'soft-corners');
    assert.equal(soft.scales.radius, 1.5);
    assert.equal(soft.overrides.radius, 12, 'at least 12px');
    assert.equal(apply(freshLiveState(), 'soft-corners', { ...NOW, radius: 10 }).overrides.radius, 15);
  });

  test('text presets build on the current body size', () => {
    const larger = apply(freshLiveState(), 'larger-text');
    assert.equal(larger.overrides.fontSize, 18.5);
    assert.equal(larger.scales.type, 1.15);
    assert.equal(apply(freshLiveState(), 'larger-text', { ...NOW, fontSize: 20 }).overrides.fontSize, 23);
    const editorial = apply(freshLiveState(), 'editorial');
    assert.deepEqual([editorial.overrides.fontSize, editorial.overrides.lineHeight, editorial.scales.type], [18, 1.65, 1.1]);
    assert.equal(apply(freshLiveState(), 'editorial', { ...NOW, fontSize: 20 }).overrides.fontSize, 20, 'never smaller');
  });

  test('Higher contrast moves text and accent to at least 7:1', () => {
    const { overrides } = apply(freshLiveState(), 'higher-contrast');
    assert.ok(contrastRatio(overrides.text, NOW.background) >= 7);
    assert.ok(contrastRatio(overrides.onAccent, overrides.accent) >= 7);
  });
});

describe('preset settings', () => {
  test('normalizePresetSettings keeps valid parts and drops the rest', () => {
    assert.deepEqual(normalizePresetSettings(null), {});
    assert.deepEqual(
      normalizePresetSettings({
        scales: { space: 1.25, type: 'x', radius: 9, extra: 2 },
        factor: null,
        colors: { '--brand': '#ABC', '--bad': 'red', 'no-dashes': '#000000' },
        overrides: { fontSize: 18, lineHeight: -1, radius: 0, text: '#111', accent: 'blue', width: 3 },
        extra: true,
      }),
      { scales: { space: 1.25 }, colors: { '--brand': '#aabbcc' }, overrides: { fontSize: 18, radius: 0, text: '#111111' } },
    );
  });

  test('liveAsPreset keeps only what differs from the page as loaded', () => {
    assert.deepEqual(liveAsPreset(freshLiveState()), {});
    const state = normalizeLiveState({ scales: { space: 1.5 }, factor: 1.1, overrides: { fontSize: 18 }, colors: { '--brand': '#ff0000' } });
    assert.deepEqual(liveAsPreset(state), { scales: { space: 1.5 }, factor: 1.1, colors: { '--brand': '#ff0000' }, overrides: { fontSize: 18 } });
    // Applied to a reset panel, a saved preset gives the saved settings back.
    assert.deepEqual(normalizeLiveState(layerPreset(freshLiveState(), liveAsPreset(state), LIVE_RANGES)), state);
  });
});

describe('kit panel presets', () => {
  const KIT = {
    scheme: 'light',
    bodyPx: 17,
    radiusPx: 8,
    ranges: { space: { min: 0.5, max: 2, step: 0.05 }, type: { min: 0.75, max: 1.5, step: 0.025 }, radius: { min: 0, max: 2.5, step: 0.05 } },
    colorNames: ['--sdk-color-bg', '--sdk-color-label', '--sdk-color-accent', '--sdk-color-on-accent', '--sdk-color-link'],
    base: (name) => ({ '--sdk-color-label': '#141416', '--sdk-color-on-accent': '#FFFFFF', '--sdk-color-bg': '#ffffff' })[name],
  };

  test('scales multiply the kit scales; factor stands in for a missing spacing scale', () => {
    assert.deepEqual(kitLayer({ scales: { space: 1.2 }, colors: {} }, { scales: { space: 1.25 }, factor: 2 }, KIT).scales, { space: 1.5 });
    assert.deepEqual(kitLayer({ scales: {}, colors: {} }, { factor: 0.8 }, KIT).scales, { space: 0.8 });
    assert.deepEqual(kitLayer({ scales: { radius: 1 }, colors: {} }, { scales: { radius: 0 }, overrides: { radius: 30 } }, KIT).scales, { radius: 0 });
    assert.deepEqual(kitLayer({ scales: { space: 1.9 }, colors: {} }, { scales: { space: 2 } }, KIT).scales, { space: 2 }, 'clamped');
    assert.deepEqual(kitLayer({ scales: { space: 1.25 }, colors: {} }, { scales: { space: 1.25 } }, KIT).scales, { space: 1.55 }, '1.5625 lands on the 0.05 step');
    assert.deepEqual(kitLayer({ scales: {}, colors: {} }, { overrides: { fontSize: 20 } }, KIT).scales, { type: 1.175 }, '20 / 17 lands on the 0.025 step');
  });

  test('px sizes set the matching kit scale when the preset has no scale for it', () => {
    assert.deepEqual(kitLayer({ scales: {}, colors: {} }, { overrides: { fontSize: 21.25, radius: 12, lineHeight: 2 } }, KIT).scales, { type: 1.25, radius: 1.5 });
  });

  test('colors go to the appearance shown, by role or by kit name', () => {
    const state = { scales: {}, colors: { dark: { '--sdk-color-bg': '#000000' }, light: { '--sdk-color-link': '#0000ff' } } };
    const next = kitLayer(state, { overrides: { text: '#111111', accent: '#222222' }, colors: { '--sdk-color-link': '#333333', '--brand': '#444444' } }, KIT);
    assert.deepEqual(next.colors.light, { '--sdk-color-link': '#333333', [KIT_COLOR_FOR.text]: '#111111', [KIT_COLOR_FOR.accent]: '#222222' });
    assert.deepEqual(next.colors.dark, { '--sdk-color-bg': '#000000' }, 'the other appearance is untouched');
    assert.deepEqual(state.colors.light, { '--sdk-color-link': '#0000ff' }, 'the input is not changed');
  });

  test('a color equal to the kit value is not picked, and clears an earlier pick', () => {
    const state = { scales: {}, colors: { light: { '--sdk-color-label': '#333333' } } };
    const next = kitLayer(state, { overrides: { text: '#141416', onAccent: '#ffffff', accent: '#003399' } }, KIT);
    assert.deepEqual(next.colors.light, { [KIT_COLOR_FOR.accent]: '#003399' });
  });

  test('kitAsPreset saves the scales and the shown appearance colors, roles as overrides', () => {
    const state = { scales: { space: 1.25, type: 1 }, colors: { light: { '--sdk-color-label': '#111111', '--sdk-color-link': '#0000ff' }, dark: { '--sdk-color-bg': '#000000' } } };
    assert.deepEqual(kitAsPreset(state, 'light'), { scales: { space: 1.25 }, colors: { '--sdk-color-link': '#0000ff' }, overrides: { text: '#111111' } });
    const back = kitLayer({ scales: {}, colors: {} }, kitAsPreset(state, 'light'), KIT);
    assert.deepEqual(back, { scales: { space: 1.25 }, colors: { light: state.colors.light } });
  });
});

describe('your presets', () => {
  test('normalizePreset cleans the name and settings, and gives a new preset an id', () => {
    assert.equal(normalizePreset({ name: '  ' }), null);
    assert.equal(normalizePreset({ settings: {} }), null);
    const preset = normalizePreset({ name: '  Brand   look  ', settings: { factor: 1.5, junk: 1 } });
    assert.equal(preset.name, 'Brand look');
    assert.match(preset.id, /^mine-brand-look-/);
    assert.deepEqual(preset.settings, { factor: 1.5 });
    assert.equal(normalizePreset(preset).id, preset.id, 'a saved id is kept');
    assert.equal(normalizePreset({ name: 'x'.repeat(100) }).name.length, 60);
  });

  test('mergePresets replaces a preset with the same name and keeps the newest 50', () => {
    const a = normalizePreset({ name: 'A', settings: { factor: 1.1 } });
    const b = normalizePreset({ name: 'B', settings: {} });
    const merged = mergePresets([a, b], [normalizePreset({ name: 'a', settings: { factor: 1.3 } })]);
    assert.deepEqual(merged.map((p) => [p.id, p.name, p.settings.factor]), [[a.id, 'a', 1.3], [b.id, 'B', undefined]]);
    const many = Array.from({ length: 60 }, (_, i) => normalizePreset({ name: `P${i}` }));
    const capped = mergePresets([], many);
    assert.equal(capped.length, 50);
    assert.equal(capped[0].name, 'P10');
  });

  test('presetFile and parsePresetFile round-trip, and bad files get a readable error', () => {
    const presets = [normalizePreset({ name: 'Brand', settings: { scales: { space: 1.5 }, overrides: { accent: '#ff0000' } } })];
    const text = presetFile(presets);
    assert.equal(JSON.parse(text).format, PRESET_FILE_FORMAT);
    assert.deepEqual(
      parsePresetFile(text).map(({ name, settings }) => ({ name, settings })),
      [{ name: 'Brand', settings: { scales: { space: 1.5 }, overrides: { accent: '#ff0000' } } }],
    );
    assert.throws(() => parsePresetFile(JSON.stringify([{ name: 'Bare', settings: { factor: 2 } }])), /no design presets/, 'only the exported file format');
    assert.throws(() => parsePresetFile('{nope'), /not JSON/);
    assert.throws(() => parsePresetFile('{"format":"other","presets":[]}'), /no design presets/);
    assert.throws(() => parsePresetFile(JSON.stringify({ format: PRESET_FILE_FORMAT, presets: [{ settings: {} }] })), /no design presets/);
  });

  test('a memory store lists, saves, and tells subscribers', () => {
    const store = memoryPresets();
    let told = 0;
    const stop = store.subscribe(() => (told += 1));
    store.save([{ name: 'One', settings: { factor: 1.2 } }, { nope: true }]);
    assert.deepEqual(store.list().map((p) => p.name), ['One']);
    stop();
    store.save([]);
    assert.equal(told, 1);
  });

  test('a storage store saves to localStorage, is shared per key, and survives storage errors', () => {
    const saved = new Map();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
      });
      const store = storagePresets('test-presets');
      assert.equal(storagePresets('test-presets'), store, 'one store per key');
      store.save([{ name: 'Kept', settings: { factor: 1.5 } }]);
      assert.equal(JSON.parse(saved.get('test-presets'))[0].name, 'Kept');
      assert.deepEqual(store.list().map((p) => p.name), ['Kept']);

      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem() {
            throw new Error('blocked');
          },
          setItem() {
            throw new Error('blocked');
          },
        },
      });
      const blocked = storagePresets('test-presets-blocked');
      assert.deepEqual(blocked.list(), []);
      blocked.save([{ name: 'This view', settings: {} }]);
      assert.deepEqual(blocked.list().map((p) => p.name), ['This view'], 'kept for this page view');
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    }
  });
});
