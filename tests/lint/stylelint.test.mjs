// Stylelint standards tests: each kit lint rule rejects what its catalog ID bans
// and accepts the token-based form. catalog/lint-map.json lists the same rules.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import postcss from 'postcss';
import stylelint from 'stylelint';

const ROOT = join(import.meta.dirname, '..', '..');
const configFile = join(ROOT, 'stylelint.config.mjs');

async function lint(code) {
  const { results } = await stylelint.lint({ code, configFile, codeFilename: join(ROOT, 'theme/assets/example.css') });
  return results[0].warnings.map((warning) => warning.rule);
}

async function rejects(code, rule) {
  const rules = await lint(code);
  assert.ok(rules.includes(rule), `expected ${rule} for: ${code}\ngot: ${rules.join(', ') || 'no warnings'}`);
}

async function accepts(code) {
  assert.deepEqual(await lint(code), [], `expected no warnings for: ${code}`);
}

describe('stylelint kit rules', () => {
  test('LAY-13 bans physical left/right properties and keywords', async () => {
    await rejects('.sdk-a {\n  margin-left: var(--sdk-space-8);\n}\n', 'property-disallowed-list');
    await rejects('.sdk-a {\n  padding-right: var(--sdk-space-8);\n}\n', 'property-disallowed-list');
    await rejects('.sdk-a {\n  left: 0;\n}\n', 'property-disallowed-list');
    await rejects('.sdk-a {\n  border-top-left-radius: var(--sdk-radius-8);\n}\n', 'property-disallowed-list');
    await rejects('.sdk-a {\n  text-align: left;\n}\n', 'declaration-property-value-disallowed-list');
    await rejects('.sdk-a {\n  float: right;\n}\n', 'declaration-property-value-disallowed-list');
    await accepts('.sdk-a {\n  margin-inline-start: var(--sdk-space-8);\n  inset-inline-end: 0;\n  text-align: start;\n}\n');
  });

  test('TYP-02 font sizes use rem, em, or %, and pt is banned', async () => {
    await rejects('.sdk-a {\n  font-size: 16px;\n}\n', 'declaration-property-unit-allowed-list');
    await rejects('html {\n  font-size: 12pt;\n}\n', 'unit-disallowed-list');
    await rejects('.sdk-a {\n  inline-size: 10pt;\n}\n', 'unit-disallowed-list');
  });

  test('TYP-05 font sizes are text-style tokens', async () => {
    await rejects('.sdk-a {\n  font-size: 1.3rem;\n}\n', 'declaration-property-value-allowed-list');
    await rejects('.sdk-a {\n  font: 600 1rem/1.2 sans-serif;\n}\n', 'declaration-property-value-allowed-list');
    await accepts('.sdk-a {\n  font-size: var(--sdk-font-size-title-2);\n}\n');
  });

  test('COL-06 colors come from role tokens', async () => {
    await rejects('.sdk-a {\n  color: #333;\n}\n', 'color-no-hex');
    await rejects('.sdk-a {\n  color: red;\n}\n', 'color-named');
    await rejects('.sdk-a {\n  background: rgb(0 0 0 / 50%);\n}\n', 'function-disallowed-list');
    await rejects('.sdk-a {\n  background: oklch(70% 0.1 200);\n}\n', 'function-disallowed-list');
    await accepts(
      '.sdk-a {\n  color: var(--sdk-color-label);\n  background: color-mix(in srgb, var(--sdk-color-accent) 20%, transparent);\n}\n',
    );
  });

  test('MOT-01 durations and easings come from motion tokens', async () => {
    await rejects('.sdk-a {\n  transition: opacity 300ms ease;\n}\n', 'declaration-property-value-disallowed-list');
    await rejects('.sdk-a {\n  animation: spin 1s linear infinite;\n}\n', 'declaration-property-value-disallowed-list');
    await rejects('.sdk-a {\n  transition-duration: 0.2s;\n}\n', 'declaration-property-value-allowed-list');
    await rejects('.sdk-a {\n  transition-timing-function: ease-in-out;\n}\n', 'declaration-property-value-allowed-list');
    await rejects('.sdk-a {\n  transition: opacity var(--sdk-duration-fast) ease-in-out;\n}\n', 'declaration-property-value-disallowed-list');
    await rejects('.sdk-a {\n  transition: opacity var(--sdk-duration-fast) ease;\n}\n', 'declaration-property-value-disallowed-list');
    await rejects(
      '.sdk-a {\n  animation: spin var(--sdk-duration-slow) cubic-bezier(0.2, 0, 0, 1);\n}\n',
      'declaration-property-value-disallowed-list',
    );
    await rejects('.sdk-a {\n  animation: spin var(--sdk-duration-slow) steps(4) infinite;\n}\n', 'declaration-property-value-disallowed-list');
    await accepts('.sdk-a {\n  transition: opacity var(--sdk-duration-fast) var(--sdk-ease-standard);\n}\n');
  });

  test('the lint map names a rule for every ID tested here', async () => {
    const map = JSON.parse(await readFile(join(ROOT, 'catalog', 'lint-map.json'), 'utf8'));
    for (const id of ['LAY-13', 'TYP-02', 'TYP-05', 'COL-06', 'MOT-01']) {
      assert.ok(Array.isArray(map[id]) && map[id].length, `${id} is in catalog/lint-map.json`);
    }
  });
});

async function parse(file) {
  return postcss.parse(await readFile(join(ROOT, 'theme/assets', file), 'utf8'));
}

// Declarations of the rules whose selector list names `.sdk-<name>` on its own.
function declarationsOf(sheet, selector) {
  const found = {};
  sheet.walkRules((rule) => {
    if (rule.parent.type !== 'root' || !rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => {
      found[decl.prop] = decl.value;
    });
  });
  return found;
}

describe('kit stylesheets', () => {
  // Each primitive's defining layout, from the research plan's primitive list.
  const PRIMITIVES = {
    box: { display: 'flex' },
    stack: { display: 'flex', 'flex-direction': 'column' },
    row: { display: 'flex', 'flex-direction': 'row' },
    grid: { display: 'grid' },
    cluster: { display: 'flex', 'flex-wrap': 'wrap' },
    switcher: { display: 'flex', 'flex-wrap': 'wrap' },
    center: { 'margin-inline': 'auto' },
    float: { position: 'absolute' },
    clip: { overflow: 'clip' },
    aspect: { overflow: 'clip' },
  };

  test('ship every layout primitive with its defining layout', async () => {
    const sheet = await parse('sdk-primitives.css');
    for (const [name, expected] of Object.entries(PRIMITIVES)) {
      const actual = declarationsOf(sheet, `.sdk-${name}`);
      for (const [prop, value] of Object.entries(expected)) {
        assert.equal(actual[prop], value, `.sdk-${name} sets ${prop}: ${value}`);
      }
    }
    assert.ok(declarationsOf(sheet, '.sdk-aspect')['aspect-ratio'], '.sdk-aspect sets aspect-ratio');
    assert.ok(declarationsOf(sheet, '.sdk-center')['max-inline-size'], '.sdk-center caps its inline size');
  });

  test('read only --sdk-* tokens from the theme (no stray custom properties)', async () => {
    const defined = new Set();
    (await parse('sdk-tokens.css')).walkDecls(/^--sdk-/, (decl) => defined.add(decl.prop));
    for (const file of ['sdk-base.css', 'sdk-primitives.css']) {
      (await parse(file)).walkDecls((decl) => {
        for (const [, name] of decl.value.matchAll(/var\(\s*(--sdk-[a-z0-9-]+)/g)) {
          assert.ok(defined.has(name), `${file} uses ${name}, which sdk-tokens.css defines`);
        }
      });
    }
  });
});
