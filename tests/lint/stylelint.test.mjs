// Stylelint standards tests: each kit lint rule rejects what its catalog ID bans
// and accepts the token-based form. catalog/lint-map.json lists the same rules.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
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
    await accepts('.sdk-a {\n  transition: opacity var(--sdk-duration-fast) var(--sdk-ease-standard);\n}\n');
  });

  test('the lint map names a rule for every ID tested here', async () => {
    const map = JSON.parse(await readFile(join(ROOT, 'catalog', 'lint-map.json'), 'utf8'));
    for (const id of ['LAY-13', 'TYP-02', 'TYP-05', 'COL-06', 'MOT-01']) {
      assert.ok(Array.isArray(map[id]) && map[id].length, `${id} is in catalog/lint-map.json`);
    }
  });
});

describe('kit stylesheets', () => {
  test('ship every layout primitive', async () => {
    const css = await readFile(join(ROOT, 'theme/assets/sdk-primitives.css'), 'utf8');
    for (const name of ['box', 'stack', 'row', 'grid', 'cluster', 'switcher', 'center', 'float', 'clip', 'aspect']) {
      assert.match(css, new RegExp(`\\.sdk-${name}\\b[^{]*\\{`), `.sdk-${name} is defined`);
    }
  });

  test('read only --sdk-* tokens from the theme (no stray custom properties)', async () => {
    const known = await readFile(join(ROOT, 'theme/assets/sdk-tokens.css'), 'utf8');
    const defined = new Set(known.match(/--sdk-[a-z0-9-]+(?=:)/g));
    for (const file of ['sdk-base.css', 'sdk-primitives.css']) {
      const css = await readFile(join(ROOT, 'theme/assets', file), 'utf8');
      for (const [, name] of css.matchAll(/var\((--sdk-[a-z0-9-]+)/g)) {
        assert.ok(defined.has(name), `${file} uses ${name}, which sdk-tokens.css defines`);
      }
    }
  });
});
