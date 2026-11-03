import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { promisify } from 'node:util';
import { buildTokens, renderJson } from '../lib/build.mjs';
import { composite, contrast, luminance } from '../lib/contrast.mjs';
import { cssName, cssValue, renderCss } from '../lib/css.mjs';
import { buildModel, CORE_FILE, flattenTokens, MODES, toMs, toPx, valueError } from '../lib/tokens.mjs';

const run = promisify(execFile);
const CLI = join(import.meta.dirname, '..', 'build-tokens.mjs');

const rgb = (hex, alpha) => {
  const components = [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 10000) / 10000);
  return { colorSpace: 'srgb', components, ...(alpha === undefined ? {} : { alpha }), hex };
};

/** A small but complete token set: one core file and four mode files with the same roles. */
function fixtureFiles() {
  const mode = (bg, label) => ({
    color: {
      $type: 'color',
      bg: { $value: rgb(bg), $extensions: { 'io.github.jlu22003.sdk': { usage: 'surface' } } },
      label: { $value: rgb(label), $extensions: { 'io.github.jlu22003.sdk': { usage: 'text' } } },
      link: { $value: '{color.label}' },
    },
  });
  return {
    core: {
      space: { $type: 'dimension', 16: { $value: { value: 1, unit: 'rem' } }, gutter: { $value: '{space.16}' } },
      duration: { $type: 'duration', base: { $value: { value: 200, unit: 'ms' }, $extensions: { 'io.github.jlu22003.sdk': { reducedMotion: { value: 150, unit: 'ms' } } } } },
      font: { family: { $type: 'fontFamily', sans: { $value: ['Inter', 'sans-serif'] } } },
    },
    modes: {
      light: mode('#FFFFFF', '#141416'),
      dark: mode('#000000', '#F5F5F7'),
      'light-hc': mode('#FFFFFF', '#000000'),
      'dark-hc': mode('#000000', '#FFFFFF'),
    },
  };
}

describe('contrast', () => {
  test('matches the WCAG reference values', () => {
    assert.equal(contrast(rgb('#FFFFFF'), rgb('#000000')), 21);
    assert.equal(contrast(rgb('#777777'), rgb('#FFFFFF')).toFixed(2), '4.48');
    assert.equal(luminance(rgb('#FFFFFF')), 1);
  });

  test('composites a translucent color over an opaque one', () => {
    const mixed = composite(rgb('#FFFFFF', 0.5), rgb('#000000'));
    assert.deepEqual(mixed.components, [0.5, 0.5, 0.5]);
  });
});

describe('flattenTokens and buildModel', () => {
  test('inherits $type from groups and resolves aliases', () => {
    const model = buildModel(fixtureFiles());
    assert.deepEqual(model.errors, []);
    const gutter = model.core.find((t) => t.name === 'space.gutter');
    assert.equal(gutter.type, 'dimension');
    assert.equal(gutter.alias, 'space.16');
    assert.deepEqual(gutter.value, { value: 1, unit: 'rem' });
    const link = model.modes.dark.find((t) => t.name === 'color.link');
    assert.equal(link.value.hex, '#F5F5F7');
  });

  test('reports structural problems', () => {
    const errors = [];
    flattenTokens({
      a: { $value: 1 },
      g: { $type: 'number', 'bad.name': { $value: 1 }, b: { $value: 1, $bogus: true }, c: { $type: 'gradient', $value: [] } },
    }, 'x.json', errors);
    assert.deepEqual(errors, [
      'x.json: a: no $type on the token or any parent group',
      'x.json: g.bad.name: invalid name (no $, ".", "{" or "}")',
      'x.json: g.b: unknown reserved key $bogus',
      'x.json: g.c: unsupported $type "gradient"',
    ]);
  });

  test('reports broken aliases, cycles, and type mismatches', () => {
    const files = fixtureFiles();
    files.core.space.missing = { $value: '{space.nope}' };
    files.core.space.loop = { $value: '{space.loop}' };
    files.core.space.font = { $value: '{font.family.sans}' };
    const { errors } = buildModel(files);
    assert.ok(errors.includes(`${CORE_FILE}: space.missing: alias {space.nope} points to no token`), errors.join('\n'));
    assert.ok(errors.some((e) => e.startsWith(`${CORE_FILE}: space.loop: alias cycle`)), errors.join('\n'));
    assert.ok(errors.includes(`${CORE_FILE}: space.font: alias {font.family.sans} is a fontFamily, not a dimension`), errors.join('\n'));
  });

  test('requires every mode to define the same tokens (COL-07 schema)', () => {
    const files = fixtureFiles();
    delete files.modes.dark.color.link;
    files.modes['dark-hc'].color.extra = { $value: rgb('#123456') };
    const { errors } = buildModel(files);
    assert.ok(errors.includes('color.dark.tokens.json: missing color.link (defined in color.light.tokens.json)'), errors.join('\n'));
    assert.ok(errors.includes('color.dark-hc.tokens.json: color.extra is not in color.light.tokens.json'), errors.join('\n'));
  });

  test('rejects a mode token that shadows a core token', () => {
    const files = fixtureFiles();
    for (const { id } of MODES) files.modes[id].space = { $type: 'dimension', 16: { $value: { value: 2, unit: 'rem' } } };
    const { errors } = buildModel(files);
    assert.ok(errors.includes('color.light.tokens.json: space.16 is already a core token'), errors.join('\n'));
  });
});

describe('valueError', () => {
  test('accepts valid values', () => {
    assert.equal(valueError('color', rgb('#0A5FD1')), null);
    assert.equal(valueError('dimension', { value: 4, unit: 'px' }), null);
    assert.equal(valueError('duration', { value: 0.2, unit: 's' }), null);
    assert.equal(valueError('cubicBezier', [0.34, 1.36, 0.64, 1]), null);
    assert.equal(valueError('fontWeight', 600), null);
  });

  test('rejects invalid values', () => {
    assert.match(valueError('color', { ...rgb('#0A5FD1'), hex: '#0A5FD2' }), /do not match hex/);
    assert.match(valueError('dimension', { value: 4, unit: 'em' }), /expected/);
    assert.match(valueError('duration', { value: 200, unit: 'px' }), /expected/);
    assert.match(valueError('cubicBezier', [1.2, 0, 0, 1]), /x in \[0, 1\]/);
    assert.match(valueError('fontFamily', []), /non-empty/);
    assert.match(valueError('shadow', { color: rgb('#000000'), offsetX: { value: 0, unit: 'px' } }), /shadow:/);
  });
});

describe('unit helpers', () => {
  test('convert rem to px at a 16px root and s to ms', () => {
    assert.equal(toPx({ value: 2.75, unit: 'rem' }), 44);
    assert.equal(toPx({ value: 3, unit: 'px' }), 3);
    assert.equal(toMs({ value: 0.4, unit: 's' }), 400);
  });
});

describe('CSS emitter', () => {
  test('formats each token type', () => {
    assert.equal(cssName(['color', 'bg-elevated']), '--sdk-color-bg-elevated');
    assert.equal(cssValue('color', rgb('#0A5FD1')), '#0a5fd1');
    assert.equal(cssValue('color', rgb('#000000', 0.35)), 'rgb(0 0 0 / 0.35)');
    assert.equal(cssValue('dimension', { value: 0, unit: 'rem' }), '0');
    assert.equal(cssValue('duration', { value: 0, unit: 'ms' }), '0ms');
    assert.equal(cssValue('number', 66, { unit: 'ch' }), '66ch');
    assert.equal(cssValue('fontFamily', ['Source Serif 4', 'serif']), '"Source Serif 4", serif');
    assert.equal(cssValue('cubicBezier', [0.2, 0, 0, 1]), 'cubic-bezier(0.2, 0, 0, 1)');
    const shadow = { color: rgb('#000000', 0.08), offsetX: { value: 0, unit: 'px' }, offsetY: { value: 1, unit: 'px' }, blur: { value: 2, unit: 'px' }, spread: { value: 0, unit: 'px' } };
    assert.equal(cssValue('shadow', shadow), '0 1px 2px 0 rgb(0 0 0 / 0.08)');
  });

  test('renders aliases as var() and reduced-motion overrides', () => {
    const css = renderCss(buildModel(fixtureFiles()));
    assert.match(css, /--sdk-space-gutter: var\(--sdk-space-16\);/);
    assert.match(css, /--sdk-color-link: var\(--sdk-color-label\);/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n {2}:root \{\n {4}--sdk-duration-base: 150ms;\n {2}\}\n\}/);
  });

  test('applies the increased-contrast sets after the scheme blocks', () => {
    const css = renderCss(buildModel(fixtureFiles()));
    const order = [
      ':root {',
      '@media (prefers-color-scheme: dark)',
      ':root[data-theme="dark"] {',
      '@media (prefers-contrast: more) and (prefers-color-scheme: light)',
      '@media (prefers-contrast: more) and (prefers-color-scheme: dark)',
    ].map((marker) => css.indexOf(marker));
    assert.ok(order.every((index) => index >= 0), 'every block is present');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  test('renders resolved JSON for tools', () => {
    const json = JSON.parse(renderJson(buildModel(fixtureFiles())));
    assert.deepEqual(json.core['space.gutter'], { type: 'dimension', value: { value: 1, unit: 'rem' } });
    assert.equal(json.modes['dark-hc']['color.label'].value.hex, '#FFFFFF');
  });
});

describe('buildTokens', () => {
  let root;
  let tokensDir;
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'sdk-tokens-'));
    tokensDir = join(root, 'tokens');
    await mkdir(tokensDir);
    const files = fixtureFiles();
    await writeFile(join(tokensDir, CORE_FILE), JSON.stringify(files.core));
    for (const mode of MODES) await writeFile(join(tokensDir, mode.file), JSON.stringify(files.modes[mode.id]));
  });
  after(() => rm(root, { recursive: true, force: true }));

  test('writes every output, then --check passes', async () => {
    const result = await buildTokens({ tokensDir, root });
    assert.deepEqual(result.written, ['dist/sdk-tokens.css', 'dist/tokens.json', 'theme/assets/sdk-tokens.css']);
    const css = await readFile(join(root, 'theme/assets/sdk-tokens.css'), 'utf8');
    assert.equal(css, await readFile(join(root, 'dist/sdk-tokens.css'), 'utf8'));
    assert.deepEqual(await buildTokens({ tokensDir, root, check: true }), { errors: [], stale: [], written: [] });
  });

  test('--check accepts CRLF line endings', async () => {
    const path = join(root, 'theme/assets/sdk-tokens.css');
    const css = await readFile(path, 'utf8');
    await writeFile(path, css.replace(/\n/g, '\r\n'));
    assert.deepEqual((await buildTokens({ tokensDir, root, check: true })).stale, []);
    await writeFile(path, css);
  });

  test('--check reports a stale or missing committed output and ignores dist/', async () => {
    const path = join(root, 'theme/assets/sdk-tokens.css');
    const css = await readFile(path, 'utf8');
    await writeFile(path, `${css}/* edited */\n`);
    await rm(join(root, 'dist'), { recursive: true });
    assert.deepEqual((await buildTokens({ tokensDir, root, check: true })).stale, ['theme/assets/sdk-tokens.css']);
    await rm(path);
    assert.deepEqual((await buildTokens({ tokensDir, root, check: true })).stale, ['theme/assets/sdk-tokens.css']);
  });

  test('returns validation errors without writing', async () => {
    const bad = join(root, 'bad');
    await mkdir(bad);
    const files = fixtureFiles();
    files.core.space.gutter.$value = '{space.nope}';
    await writeFile(join(bad, CORE_FILE), JSON.stringify(files.core));
    for (const mode of MODES) await writeFile(join(bad, mode.file), JSON.stringify(files.modes[mode.id]));
    const result = await buildTokens({ tokensDir: bad, root: join(root, 'out') });
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.written, []);
  });
});

describe('build-tokens CLI', () => {
  test('--check passes on the committed tokens', async () => {
    const { stdout } = await run(process.execPath, [CLI, '--check']);
    assert.match(stdout, /up to date/);
  });
});
