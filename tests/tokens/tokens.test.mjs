// Token standards tests (research report §5.4): each test names the catalog ID it checks.
// They run against the real token files in tokens/ through the same model the CSS is built from.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { before, describe, test } from 'node:test';
import { buildTokens, ROOT } from '../../scripts/lib/build.mjs';
import { composite, contrast, luminance } from '../../scripts/lib/contrast.mjs';
import { renderCss } from '../../scripts/lib/css.mjs';
import { loadModel, MODES, toMs, toPx } from '../../scripts/lib/tokens.mjs';

const WHITE = { colorSpace: 'srgb', components: [1, 1, 1] };
const BLACK = { colorSpace: 'srgb', components: [0, 0, 0] };

let model;
const core = (name) => {
  const token = model.core.find((t) => t.name === name);
  assert.ok(token, `core token ${name} exists`);
  return token;
};
const coreGroup = (prefix) => model.core.filter((t) => t.name.startsWith(`${prefix}.`));
const colors = (mode) => model.modes[mode].filter((t) => t.type === 'color');
const byUsage = (mode, usage) => colors(mode).filter((t) => t.extensions.usage === usage);
const color = (mode, role) => {
  const token = colors(mode).find((t) => t.name === `color.${role}`);
  assert.ok(token, `${mode} defines color.${role}`);
  return token.value;
};
const ratio = (a, b) => Math.round(contrast(a, b) * 100) / 100;

before(async () => {
  model = await loadModel();
});

describe('token source', () => {
  test('is valid DTCG and every alias resolves', () => {
    assert.deepEqual(model.errors, []);
  });

  test('the committed theme/assets/sdk-tokens.css is up to date', async () => {
    const { errors, stale } = await buildTokens({ check: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(stale, [], 'run `npm run tokens` and commit the result');
  });
});

describe('color', () => {
  test('COL-07 every color role defines light, dark, increased-contrast light and dark values', () => {
    const roles = (mode) => colors(mode).map((t) => t.name).sort();
    assert.ok(roles('light').length >= 20, 'the light mode defines the role set');
    for (const { id } of MODES) {
      assert.deepEqual(roles(id), roles('light'), `${id} has the same roles as light`);
      for (const token of colors(id)) assert.ok(token.value?.components, `${id} ${token.name} has a value`);
    }
  });

  test('every color role declares how it is used', () => {
    const usages = new Set(['surface', 'text', 'on-accent', 'boundary', 'decorative', 'disabled', 'overlay']);
    for (const { id } of MODES) {
      for (const token of colors(id)) assert.ok(usages.has(token.extensions.usage), `${id} ${token.name}: usage ${token.extensions.usage}`);
    }
  });

  for (const { id } of MODES) {
    test(`COL-01 every text role is >= 4.5:1 on every surface (${id})`, () => {
      const texts = byUsage(id, 'text');
      const surfaces = byUsage(id, 'surface');
      assert.ok(texts.length >= 9 && surfaces.length >= 4, 'text and surface roles exist');
      for (const surface of surfaces) {
        assert.equal(surface.value.alpha ?? 1, 1, `${surface.name} is opaque`);
        for (const text of texts) {
          const r = ratio(text.value, surface.value);
          assert.ok(r >= 4.5, `${text.name} on ${surface.name}: ${r}:1`);
        }
      }
    });

    test(`COL-01 on-accent text is >= 4.5:1 on the accent fill (${id})`, () => {
      const r = ratio(color(id, 'on-accent'), color(id, 'accent'));
      assert.ok(r >= 4.5, `on-accent on accent: ${r}:1`);
    });

    test(`COL-02 label and label-secondary are >= 7:1 on base surfaces (${id})`, () => {
      for (const surface of byUsage(id, 'surface')) {
        for (const role of ['label', 'label-secondary']) {
          const r = ratio(color(id, role), surface.value);
          assert.ok(r >= 7, `${role} on ${surface.name}: ${r}:1`);
        }
      }
    });

    test(`COL-03 control borders and focus indicators are >= 3:1 against every surface (${id})`, () => {
      const boundaries = byUsage(id, 'boundary').map((t) => t.name);
      assert.ok(boundaries.includes('color.separator-opaque') && boundaries.includes('color.focus'));
      for (const surface of byUsage(id, 'surface')) {
        for (const boundary of byUsage(id, 'boundary')) {
          const r = ratio(boundary.value, surface.value);
          assert.ok(r >= 3, `${boundary.name} on ${surface.name}: ${r}:1`);
        }
      }
    });
  }

  for (const id of MODES.filter((m) => m.scheme === 'dark').map((m) => m.id)) {
    test(`DRK-02 elevated surfaces are lighter than base surfaces in dark mode (${id})`, () => {
      const elevated = luminance(color(id, 'bg-elevated'));
      assert.ok(elevated > luminance(color(id, 'bg')), 'bg-elevated is lighter than bg');
      assert.ok(elevated > luminance(color(id, 'bg-secondary')), 'bg-elevated is lighter than bg-secondary');
      assert.ok(luminance(color(id, 'label')) > luminance(color(id, 'bg')), 'label is brighter than bg');
    });
  }
});

describe('materials', () => {
  const materials = () => coreGroup('material').filter((t) => t.extensions.textRoles);

  test('MAT-03 text on each material is >= 4.5:1 over pure black and pure white backdrops', () => {
    assert.deepEqual(materials().map((t) => t.name), ['material.thin', 'material.regular', 'material.thick']);
    for (const material of materials()) {
      assert.ok(material.extensions.textRoles.includes('label'), `${material.name} allows primary label text`);
      for (const { id } of MODES) {
        const surface = { ...color(id, 'bg-elevated'), alpha: material.value };
        for (const backdrop of [BLACK, WHITE]) {
          const glass = composite(surface, backdrop);
          for (const role of material.extensions.textRoles) {
            const r = ratio(color(id, role), glass);
            assert.ok(r >= 4.5, `${id} ${role} on ${material.name} over ${backdrop === BLACK ? 'black' : 'white'}: ${r}:1`);
          }
        }
      }
    }
  });
});

describe('typography', () => {
  test('TYP-01 body is 17px and no text style is below the 11px minimum', () => {
    assert.equal(toPx(core('font.size.body').value), 17);
    assert.ok(toPx(core('font.size.caption-1').value) >= 12, 'legal and meta text floor');
    for (const token of coreGroup('font.size')) {
      const smallest = token.extensions.fluid ? token.extensions.fluid.min : token.value;
      assert.ok(toPx(smallest) >= 11, `${token.name}: ${toPx(smallest)}px`);
    }
  });

  test('TYP-04 font weights are only regular, semibold and bold', () => {
    assert.deepEqual(coreGroup('font.weight').map((t) => t.value).sort(), [400, 600, 700]);
  });

  test('TYP-07 UI text styles have line-height >= 1.25 and prose >= 1.45', () => {
    // Tight leading is for large single-line headings; every style up to title-3 (20px) is UI text.
    for (const size of coreGroup('font.size')) {
      const style = size.path.at(-1);
      if (!size.extensions.fluid && toPx(size.value) <= 20) {
        assert.ok(core(`font.line-height.${style}`).value >= 1.25, `${style} line-height`);
      }
    }
    assert.ok(core('font.line-height.prose').value >= 1.45);
  });

  test('TYP-12 font stacks lead with the open fonts and never name San Francisco or system UI keywords', async () => {
    const leads = { sans: 'Inter', serif: 'Source Serif 4', mono: 'IBM Plex Mono' };
    const generic = { sans: 'sans-serif', serif: 'serif', mono: 'monospace' };
    const banned = /^(?:-apple-system|BlinkMacSystemFont|system-ui|ui-[a-z-]+|SF\b.*|San Francisco|New York)$/i;
    for (const [name, lead] of Object.entries(leads)) {
      const stack = core(`font.family.${name}`).value;
      assert.equal(stack[0], lead, `${name} leads with ${lead}`);
      assert.equal(stack.at(-1), generic[name], `${name} ends with a generic family`);
      for (const family of stack) assert.doesNotMatch(family, banned, `${name} stack names ${family}`);
    }
    const css = await readFile(join(ROOT, 'theme/assets/sdk-tokens.css'), 'utf8');
    assert.doesNotMatch(css, /-apple-system|BlinkMacSystemFont|system-ui|ui-(?:sans-serif|serif|monospace|rounded)|"SF /);
  });
});

describe('sizes and spacing', () => {
  test('ACC-01 default targets are >= 44px and the dense floor is >= 24px', () => {
    assert.ok(toPx(core('size.target-min').value) >= 44);
    assert.ok(toPx(core('size.field-height').value) >= 44);
    assert.ok(toPx(core('size.target-floor').value) >= 24);
  });

  test('ACC-02 control spacing is >= 12px around bezeled and >= 24px around borderless controls', () => {
    assert.ok(toPx(core('space.control-bezeled').value) >= 12);
    assert.ok(toPx(core('space.control-borderless').value) >= 24);
  });

  test('ACC-09 the focus ring is at least 2px wide', () => {
    assert.ok(toPx(core('focus.width').value) >= 2);
  });

  test('LAY-09 the prose measure targets 66ch and never exceeds 75ch', () => {
    assert.equal(core('size.measure').value, 66);
    assert.ok(core('size.measure-max').value <= 75);
    for (const name of ['size.measure', 'size.measure-max']) assert.equal(core(name).extensions.unit, 'ch');
  });
});

describe('motion', () => {
  test('MOT-01 every duration is a token of at most 400ms, and reduced motion keeps fades only', () => {
    const durations = model.core.filter((t) => t.type === 'duration');
    assert.ok(durations.length >= 4);
    for (const token of durations) {
      assert.ok(toMs(token.value) <= 400, `${token.name}: ${toMs(token.value)}ms`);
      const reduced = token.extensions.reducedMotion;
      if (reduced) assert.ok(toMs(reduced) <= 150, `${token.name} under reduced motion: ${toMs(reduced)}ms`);
    }
    assert.equal(core('motion.movement').extensions.reducedMotion, 0, 'movement is zeroed under reduced motion');
  });
});

describe('generated CSS', () => {
  const blocks = (css) => {
    const found = {};
    for (const match of css.matchAll(/(?:@media ([^{]+)\{\s*)?(:root[^{]*)\{([^}]*)\}/g)) {
      const key = `${match[1]?.trim() ?? ''} ${match[2].trim()}`.trim();
      found[key] = [...match[3].matchAll(/(--sdk-[\w-]+):/g)].map((m) => m[1]);
    }
    return found;
  };

  test('declares color-scheme and an appearance block for every mode and override', () => {
    const css = renderCss(model);
    const found = blocks(css);
    assert.match(css, /:root \{\n {2}color-scheme: light dark;/);
    const modeNames = model.modes.light.map((t) => `--sdk-${t.path.join('-')}`);
    for (const key of [
      '(prefers-color-scheme: dark) :root:not([data-theme="light"])',
      ':root[data-theme="dark"]',
      '(prefers-contrast: more) and (prefers-color-scheme: light) :root:not([data-theme="dark"])',
      '(prefers-contrast: more) :root[data-theme="light"]',
      '(prefers-contrast: more) and (prefers-color-scheme: dark) :root:not([data-theme="light"])',
      '(prefers-contrast: more) :root[data-theme="dark"]',
    ]) {
      assert.deepEqual(found[key], modeNames, `${key} sets every mode token`);
    }
    assert.deepEqual(found['(prefers-reduced-motion: reduce) :root'],
      model.core.filter((t) => t.extensions.reducedMotion !== undefined).map((t) => `--sdk-${t.path.join('-')}`));
  });

  test('emits every token exactly once in :root', () => {
    const names = blocks(renderCss(model))[':root'];
    const expected = [...model.core, ...model.modes.light].map((t) => `--sdk-${t.path.join('-')}`);
    assert.deepEqual(names, expected);
    assert.equal(new Set(names).size, names.length);
  });
});
