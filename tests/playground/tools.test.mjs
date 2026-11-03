// Format frames, variant boards, and the live-site bookmarklet: pure helpers.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { Script } from 'node:vm';
import { buildBookmarklet, compactJs, hostTokenCss, remToPx, stripModule, toBookmarkletUrl } from '../../playground/dev/bookmarklet.js';
import { BOARD_WIDTHS, FORMATS, fitScale, framedPath, printMediaText, rowFitHeight } from '../../playground/dev/formats.js';
import {
  boxRules,
  classifyVariable,
  colorFormat,
  colorToHex,
  formatColor,
  liveCss,
  overrideRules,
  scaleVariable,
  selectorFor,
  variableBlock,
} from '../../playground/dev/live-panel.js';

const ROOT = resolve(import.meta.dirname, '../..');
const ORIGIN = 'http://127.0.0.1:4400';

describe('format frames', () => {
  test('lists every format the playground promises, at its real size', () => {
    const sizes = Object.fromEntries(FORMATS.map((f) => [f.id, [f.width, f.height]]));
    assert.deepEqual(Object.keys(sizes), ['phone', 'tablet', 'desktop', 'square', 'story', 'email', 'print']);
    assert.deepEqual(sizes.square, [1080, 1080]);
    assert.deepEqual(sizes.story, [1080, 1920]);
    assert.equal(sizes.email[0], 600);
    assert.equal(FORMATS.filter((f) => f.print).length, 1);
    assert.ok(BOARD_WIDTHS.length >= 2);
  });

  test('fitScale fits height and width and never enlarges', () => {
    assert.equal(fitScale({ width: 1080, height: 1920 }, { maxHeight: 480 }), 0.25);
    assert.equal(fitScale({ width: 1440, height: 900 }, { maxHeight: 900, maxWidth: 720 }), 0.5);
    assert.equal(fitScale({ width: 390, height: 844 }, { maxHeight: 2000 }), 1);
  });

  test('rowFitHeight puts every format in one row', () => {
    const two = [{ width: 100, height: 200 }, { width: 300, height: 200 }];
    assert.equal(rowFitHeight(two, { width: 410, gap: 10 }), 200);
    assert.equal(rowFitHeight([], { width: 500 }), 0);
    const height = rowFitHeight(FORMATS, { width: 1600, gap: 32 });
    const total = FORMATS.reduce((sum, f) => sum + f.width * fitScale(f, { maxHeight: height }), 0) + 32 * (FORMATS.length - 1);
    assert.ok(total <= 1600, `row is ${total}px wide`);
  });

  test('framedPath accepts playground and sketch pages on this origin only', () => {
    assert.equal(framedPath('/sketches/idea/', ORIGIN), '/sketches/idea/');
    assert.equal(framedPath('sketches/idea/index.html?x=1#top', ORIGIN), '/sketches/idea/index.html?x=1#top');
    assert.equal(framedPath(`${ORIGIN}/playground/starters/product.html`, ORIGIN), '/playground/starters/product.html');
    for (const bad of [
      '',
      'https://example.com/playground/x.html',
      '//example.com/sketches/x/',
      'javascript:alert(1)',
      '/theme/assets/sdk-base.css',
      '/playground/frames.html',
      '/playground/variants.html',
      '/playground/dev/client.js',
    ]) {
      assert.equal(framedPath(bad, ORIGIN), null, bad);
    }
  });

  test('printMediaText turns print styles on and screen styles off', () => {
    assert.equal(printMediaText('print'), 'all');
    assert.equal(printMediaText('only print and (min-width: 40rem)'), 'all and (min-width: 40rem)');
    assert.equal(printMediaText('screen'), 'not all');
    assert.equal(printMediaText('screen and (min-width: 48rem)'), 'not all');
    assert.equal(printMediaText('not print'), 'not all');
    assert.equal(printMediaText('not screen and (color)'), 'all');
    assert.equal(printMediaText('(min-width: 30rem)'), '(min-width: 30rem)');
    assert.equal(printMediaText('screen, print'), 'not all, all');
    assert.equal(printMediaText('all'), 'all');
    // Running it twice changes nothing, so frames can re-apply it after every stylesheet load.
    for (const text of ['print', 'screen and (x)', 'not print and (y)']) {
      assert.equal(printMediaText(printMediaText(text)), printMediaText(text));
    }
  });
});

describe('live-site panel helpers', () => {
  test('colorToHex reads hex, opaque rgb(), and Shopify-style triplets', () => {
    assert.equal(colorToHex('#ABC'), '#aabbcc');
    assert.equal(colorToHex('rgb(18, 18, 18)'), '#121212');
    assert.equal(colorToHex('rgb(255 0 0 / 1)'), '#ff0000');
    assert.equal(colorToHex('rgba(0, 0, 0, 0)'), null);
    assert.equal(colorToHex('rgb(0 0 0 / 50%)'), null);
    assert.equal(colorToHex('18, 18, 18'), '#121212');
    assert.equal(colorToHex('5 59 179'), '#053bb3');
    assert.equal(colorToHex('hsl(0 0% 0%)'), null);
  });

  test('formatColor writes a pick back in the site\'s own format', () => {
    assert.equal(colorFormat(' 18, 18, 18 '), 'triplet');
    assert.equal(colorFormat('18 18 18'), 'triplet-space');
    assert.equal(formatColor('#ff8000', 'triplet'), '255, 128, 0');
    assert.equal(formatColor('#ff8000', 'triplet-space'), '255 128 0');
    assert.equal(formatColor('#ff8000', 'rgb'), 'rgb(255, 128, 0)');
    assert.equal(formatColor('#ff8000', 'hex'), '#ff8000');
  });

  test('classifyVariable sorts common variable names', () => {
    assert.deepEqual(classifyVariable('--color-foreground', '18,18,18'), { kind: 'color', format: 'triplet' });
    assert.deepEqual(classifyVariable('--brand', '#0a5fd1'), { kind: 'color', format: 'hex' });
    assert.equal(classifyVariable('--columns', '3, 4, 5'), null);
    assert.deepEqual(classifyVariable('--sdk-space-16', '1rem'), { kind: 'space' });
    assert.deepEqual(classifyVariable('--spacing-sections-desktop', '36px'), { kind: 'space' });
    assert.deepEqual(classifyVariable('--font-size-body', 'clamp(1rem, 0.9rem + 0.5vw, 1.125rem)'), { kind: 'type' });
    assert.deepEqual(classifyVariable('--text-lg', '1.125rem'), { kind: 'type' });
    assert.deepEqual(classifyVariable('--font-body-scale', '1.0'), { kind: 'type' });
    assert.deepEqual(classifyVariable('--buttons-radius', '6px'), { kind: 'radius' });
    assert.equal(classifyVariable('--page-width', '120rem'), null);
    assert.equal(classifyVariable('--gap', 'var(--space-4)'), null);
    assert.equal(classifyVariable('--z-header', '10'), null);
  });

  test('scaleVariable scales lengths, and bare numbers only for scale variables', () => {
    assert.equal(scaleVariable('--space-4', '1rem', 1.5), '1.5rem');
    assert.equal(scaleVariable('--font-body-scale', '1.0', 1.2), '1.2');
    assert.equal(scaleVariable('--line-height', '1.5', 2), '1.5');
  });

  test('selectorFor names an element by id, or tag and two classes', () => {
    assert.equal(selectorFor({ tag: 'DIV', id: 'hero', classes: ['a'] }), '#hero');
    assert.equal(selectorFor({ tag: 'section', id: '', classes: ['page-width', 'x', 'y'] }), 'section.page-width.x');
    assert.equal(selectorFor({ tag: 'div', classes: ['md:p-4'] }), 'div.md\\:p-4');
  });

  test('overrideRules emits only what was set, with !important only when asked', () => {
    assert.deepEqual(overrideRules({}), []);
    const rules = overrideRules({ fontSize: 18, background: '#fafafa', accent: '#ff0000' });
    assert.equal(rules.length, 4);
    assert.match(rules[0], /font-size: 18px;/);
    assert.match(rules.join('\n'), /html, body \{ background-color: #fafafa; \}/);
    assert.match(rules.join('\n'), /accent-color: #ff0000;/);
    assert.doesNotMatch(rules.join('\n'), /important/);
    assert.match(overrideRules({ lineHeight: 1.6 }, { important: true })[0], /line-height: 1\.6 !important;/);
  });

  test('boxRules scales measured padding and gaps, once per selector', () => {
    const boxes = [
      { selector: 'section.hero', values: { 'padding-block-start': '40px', 'row-gap': '0px' } },
      { selector: 'section.hero', values: { 'padding-block-start': '99px' } },
      { selector: '#footer', values: { 'column-gap': '16px' } },
    ];
    assert.deepEqual(boxRules(boxes, 1), []);
    assert.deepEqual(boxRules(boxes, 1.5), ['section.hero { padding-block-start: 60px; }', '#footer { column-gap: 24px; }']);
  });

  test('liveCss copies variables, overrides, and containers with notes', () => {
    assert.match(liveCss({}), /No changes yet/);
    assert.equal(variableBlock({}), '');
    const css = liveCss({
      vars: { '--color-foreground': '18, 18, 18', '--buttons-radius': '12px' },
      overrides: { text: '#111111' },
      boxes: [{ selector: 'main', values: { 'padding-inline-start': '20px' } }],
      factor: 2,
      site: 'shop.example',
    });
    assert.match(css, /^\/\* Design panel values for shop\.example\./);
    assert.match(css, /:root \{\n {2}--buttons-radius: 12px;\n {2}--color-foreground: 18, 18, 18;\n\}/);
    assert.match(css, /color: #111111;/);
    assert.match(css, /Container spacing at 200%[^\n]*\nmain \{ padding-inline-start: 40px; \}/);
    assert.doesNotMatch(css, / !important;|data-sdk-live/);
  });
});

describe('bookmarklet build', () => {
  const read = (path) => readFile(join(ROOT, path), 'utf8');

  test('stripModule drops relative imports and export keywords, and refuses anything else', () => {
    const out = stripModule("import { a } from './util.js';\nexport function f() {}\nexport const x = 1;\nconst y = 2;");
    assert.equal(out, 'function f() {}\nconst x = 1;\nconst y = 2;');
    assert.throws(() => stripModule("import fs from 'node:fs';"), /cannot handle/);
    assert.throws(() => stripModule('export default 1;'), /cannot handle/);
  });

  test('compactJs drops comments, blank lines, and indentation only', () => {
    assert.equal(compactJs('/**\n * doc\n */\nconst a = 1; // keep\n\n  // gone\n  b();\n/* one */\nc();'), 'const a = 1; // keep\nb();\nc();');
  });

  test('remToPx and hostTokenCss make the panel independent of the site', async () => {
    assert.equal(remToPx('inline-size: min(22rem, 100%); gap: 0.75rem;'), 'inline-size: min(352px, 100%); gap: 12px;');
    const tokens = await read('theme/assets/sdk-tokens.css');
    const host = hostTokenCss(tokens, '.x { color: var(--sdk-color-focus); padding: var(--sdk-space-8); }');
    // --sdk-color-focus aliases other tokens; those come along so the alias resolves.
    assert.match(host, /^:host \{\n {2}--sdk-color-accent: /);
    assert.match(host, /--sdk-color-focus: var\(--sdk-color-accent\);/);
    assert.match(host, /--sdk-color-link: /);
    assert.match(host, /@media \(prefers-color-scheme: dark\) \{\n {2}:host \{\n {4}--sdk-color-accent: /);
    assert.throws(() => hostTokenCss(tokens, '.x { color: var(--sdk-nope); }'), /--sdk-nope/);
  });

  test('toBookmarkletUrl keeps the code intact through URL decoding', () => {
    const code = 'alert("50% #1 ×")\nx()';
    const url = toBookmarkletUrl(code);
    assert.doesNotMatch(url, /[\n"#×]|%(?![0-9A-F]{2})/);
    assert.equal(decodeURIComponent(url.slice('javascript:'.length)), code);
  });

  test('the built bookmarklet is valid, self-contained, and offline', async () => {
    const { code, url } = await buildBookmarklet(read);
    new Script(code);
    assert.equal(decodeURIComponent(url.slice('javascript:'.length)), code);
    assert.ok(url.length < 60_000, `bookmarklet is ${url.length} characters; keep it under 60k for browser bookmark limits`);
    assert.match(code, /toggleLivePanel\("/);
    assert.doesNotMatch(code, /^\s*(import|export)\b/m);
    // It must not send data anywhere or leave anything behind on the site.
    for (const api of [/\bfetch\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\bimport\(/, /new Image\b/, /url\(/]) {
      assert.doesNotMatch(code, api, String(api));
    }
  });
});
