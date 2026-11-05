// Site lab local copies (`npm run lab:copy`): the pure helpers in
// scripts/lib/lab/assets.mjs, and the rule that keeps copies out of git.
// The browser side is covered by tests/e2e/lab-copy.spec.mjs.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { TYPES } from '../../playground/server.mjs';
import {
  ASSET_EXTENSIONS,
  buildPatches,
  copyName,
  createAssetStore,
  extensionFor,
  isAssetType,
  parseSrcset,
  resolveRef,
  rewriteCssUrls,
  rewriteSrcset,
  wantedUrls,
} from '../../scripts/lib/lab/assets.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const BASE = 'https://shop.example/products/shirt';
const saved = {
  'https://shop.example/assets/bg.png': 'a1.png',
  'https://shop.example/assets/icons.svg': 'b2.svg',
  'https://cdn.example/theme.css': 'c3.css',
  'https://shop.example/img/shirt.jpg?width=400': 'd4.jpg',
};
const lookup = (url) => saved[url] ?? null;

describe('copy names and file types', () => {
  test('copyName is the host and the local capture time', () => {
    assert.equal(copyName('https://Shop.Example:8443/products/x?y=1', new Date(2026, 10, 4, 9, 5, 7)), 'shop.example-20261104-090507');
    assert.equal(copyName('http://127.0.0.1:4500/', new Date(2026, 0, 2, 3, 4, 5)), '127.0.0.1-20260102-030405');
    assert.equal(copyName('http://[::1]:4500/', new Date(2026, 0, 2, 3, 4, 5)), '1-20260102-030405');
  });

  test('extensionFor prefers the content type, then the URL, then the resource type', () => {
    assert.equal(extensionFor('text/css; charset=utf-8', 'https://x.example/a'), 'css');
    assert.equal(extensionFor('image/svg+xml', 'https://x.example/a.png'), 'svg');
    assert.equal(extensionFor('application/octet-stream', 'https://x.example/font.woff2?v=3'), 'woff2');
    assert.equal(extensionFor(undefined, 'https://x.example/photo.JPEG'), 'jpg');
    assert.equal(extensionFor('text/plain', 'https://x.example/theme', 'stylesheet'), 'css');
    assert.equal(extensionFor('application/x-thing', 'https://x.example/blob', 'image'), 'bin');
  });

  test('isAssetType keeps CSS, images, fonts, and media, never scripts or documents', () => {
    for (const type of ['text/css', 'image/webp', 'font/woff2', 'video/mp4', 'IMAGE/PNG; q=1']) assert.ok(isAssetType(type), type);
    for (const type of ['text/javascript', 'application/javascript', 'text/html', 'application/json', '', undefined]) {
      assert.ok(!isAssetType(type), String(type));
    }
  });

  test('the dev server serves every extension a copy can save', () => {
    for (const ext of new Set(Object.values(ASSET_EXTENSIONS))) assert.ok(TYPES[`.${ext}`], `.${ext} has no content type in server.mjs`);
  });
});

describe('rewriting URLs', () => {
  test('resolveRef resolves http(s) URLs and splits off the fragment', () => {
    assert.deepEqual(resolveRef('../assets/icons.svg#cart', BASE), { url: 'https://shop.example/assets/icons.svg', hash: '#cart' });
    assert.deepEqual(resolveRef('//cdn.example/theme.css', BASE), { url: 'https://cdn.example/theme.css', hash: '' });
    for (const value of ['', '  ', '#main', 'data:image/png;base64,AAAA', 'blob:https://shop.example/1', 'javascript:void(0)', 'mailto:a@b.c']) {
      assert.equal(resolveRef(value, BASE), null, value);
    }
  });

  test('rewriteCssUrls points saved files at the copy and leaves the rest absolute', () => {
    const css = [
      '@import "//cdn.example/theme.css";',
      '.a { background: url(/assets/bg.png) }',
      ".b { mask: url('/assets/icons.svg#star') }",
      '.c { background-image: url( "missing.png" ) }',
      '.d { background: url(data:image/gif;base64,R0lG) }',
      '.e { fill: url(#gradient) }',
    ].join('\n');
    const { css: out, refs } = rewriteCssUrls(css, { base: 'https://shop.example/css/site.css', lookup, prefix: 'assets/' });
    assert.match(out, /@import "assets\/c3\.css";/);
    assert.match(out, /\.a \{ background: url\("assets\/a1\.png"\) \}/);
    assert.match(out, /\.b \{ mask: url\("assets\/b2\.svg#star"\) \}/);
    assert.match(out, /\.c \{ background-image: url\("https:\/\/shop\.example\/css\/missing\.png"\) \}/);
    assert.match(out, /url\(data:image\/gif;base64,R0lG\)/);
    assert.match(out, /url\(#gradient\)/);
    assert.deepEqual(refs.toSorted(), [
      'https://cdn.example/theme.css',
      'https://shop.example/assets/bg.png',
      'https://shop.example/assets/icons.svg',
      'https://shop.example/css/missing.png',
    ]);
  });

  test('parseSrcset keeps commas inside URLs', () => {
    assert.deepEqual(parseSrcset('a.jpg 1x, https://img.example/w_400,h_300/b.jpg 2x,c.jpg'), [
      { url: 'a.jpg', descriptor: '1x' },
      { url: 'https://img.example/w_400,h_300/b.jpg', descriptor: '2x' },
      { url: 'c.jpg', descriptor: '' },
    ]);
    assert.deepEqual(parseSrcset(''), []);
  });

  test('rewriteSrcset keeps only saved candidates, or drops the attribute', () => {
    const srcset = '/img/shirt.jpg?width=400 400w, /img/shirt.jpg?width=800 800w';
    assert.equal(rewriteSrcset(srcset, { base: BASE, lookup, prefix: 'assets/' }), 'assets/d4.jpg 400w');
    assert.equal(rewriteSrcset('/img/other.jpg 1x', { base: BASE, lookup, prefix: 'assets/' }), null);
  });

  test('buildPatches rewrites assets, srcset, links, inline styles, and <style> text', () => {
    const refs = [
      {
        id: '0',
        tag: 'img',
        entries: [
          { name: 'src', value: '/img/shirt.jpg?width=800', kind: 'asset' },
          { name: 'srcset', value: '/img/shirt.jpg?width=400 400w, /img/shirt.jpg?width=800 800w', kind: 'srcset' },
          { name: 'data-sdk-current', value: 'https://shop.example/img/shirt.jpg?width=400', kind: 'asset' },
        ],
      },
      { id: '1', tag: 'source', entries: [{ name: 'srcset', value: '/img/wide.jpg 1200w', kind: 'srcset' }] },
      { id: '2', tag: 'a', entries: [{ name: 'href', value: '/collections/all', kind: 'link' }] },
      { id: '3', tag: 'div', entries: [{ name: 'style', value: 'background: url(/assets/bg.png)', kind: 'style' }] },
      { id: '4', tag: 'use', entries: [{ name: 'href', value: '/assets/icons.svg#cart', kind: 'asset' }] },
      { id: '5', tag: 'link', entries: [{ name: 'href', value: '/assets/unsaved.css', kind: 'asset' }] },
    ];
    const styles = [{ id: '6', text: '.x { background: url("/assets/bg.png") }' }];
    const patches = buildPatches({ refs, styles, base: BASE, lookup });
    assert.deepEqual(patches, [
      { id: '0', attrs: { src: 'assets/d4.jpg', srcset: 'assets/d4.jpg 400w', 'data-sdk-current': null }, remove: false },
      { id: '1', attrs: { srcset: null }, remove: true },
      { id: '2', attrs: { href: 'https://shop.example/collections/all' }, remove: false },
      { id: '3', attrs: { style: 'background: url("assets/a1.png")' }, remove: false },
      { id: '4', attrs: { href: 'assets/b2.svg#cart' }, remove: false },
      { id: '5', attrs: { href: 'https://shop.example/assets/unsaved.css' }, remove: false },
      { id: '6', text: '.x { background: url("assets/a1.png") }' },
    ]);
  });

  test('buildPatches adds src from the shown image when an <img> only had srcset', () => {
    const refs = [
      {
        id: '0',
        tag: 'img',
        entries: [
          { name: 'srcset', value: '/img/shirt.jpg?width=400 400w', kind: 'srcset' },
          { name: 'data-sdk-current', value: 'https://shop.example/img/shirt.jpg?width=400', kind: 'asset' },
        ],
      },
    ];
    assert.deepEqual(buildPatches({ refs, base: BASE, lookup })[0].attrs, { srcset: 'assets/d4.jpg 400w', 'data-sdk-current': null, src: 'assets/d4.jpg' });
  });

  test('wantedUrls lists assets and CSS references, not links or srcset candidates', () => {
    const refs = [
      { id: '0', tag: 'img', entries: [{ name: 'src', value: 'a.png', kind: 'asset' }, { name: 'srcset', value: 'b.png 2x', kind: 'srcset' }] },
      { id: '1', tag: 'a', entries: [{ name: 'href', value: '/page', kind: 'link' }] },
      { id: '2', tag: 'div', entries: [{ name: 'style', value: 'background: url(c.png)', kind: 'style' }] },
    ];
    const styles = [{ id: '3', text: '@import "d.css";' }];
    assert.deepEqual(
      [...wantedUrls({ refs, styles, base: 'https://shop.example/' })].sort(),
      ['https://shop.example/a.png', 'https://shop.example/c.png', 'https://shop.example/d.css'],
    );
  });
});

describe('asset store', () => {
  const body = (text) => Buffer.from(text);

  test('keeps identical bodies once and answers for every URL, redirects included', () => {
    const store = createAssetStore();
    const first = store.add({ urls: ['https://x.example/logo.svg', 'https://x.example/old-logo.svg'], body: body('<svg/>'), contentType: 'image/svg+xml' });
    const second = store.add({ urls: ['https://cdn.example/logo.svg'], body: body('<svg/>'), contentType: 'image/svg+xml' });
    assert.equal(first, second);
    assert.match(first.file, /^[0-9a-f]{16}\.svg$/);
    assert.equal(store.lookup('https://x.example/old-logo.svg'), first.file);
    assert.equal(store.lookup('https://cdn.example/logo.svg'), first.file);
    assert.equal(store.files().length, 1);
    assert.equal(store.bytes, 6);
  });

  test('gives the same stylesheet text at two URLs two files, since each is rewritten against its own URL', () => {
    const store = createAssetStore();
    const a = store.add({ urls: ['https://x.example/a/site.css'], body: body('.a{}'), contentType: 'text/css' });
    const b = store.add({ urls: ['https://x.example/b/site.css'], body: body('.a{}'), contentType: 'text/css' });
    assert.notEqual(a.file, b.file);
  });

  test('skips files past the size cap and records failures until a later success', () => {
    const store = createAssetStore({ maxBytes: 10 });
    assert.ok(store.add({ urls: ['https://x.example/a.png'], body: body('12345678'), contentType: 'image/png' }));
    assert.equal(store.add({ urls: ['https://x.example/b.png'], body: body('123'), contentType: 'image/png' }), null);
    assert.deepEqual(store.skipped(), [{ url: 'https://x.example/b.png', reason: 'size cap' }]);
    store.fail('https://x.example/c.png', 'HTTP 404');
    assert.deepEqual(store.failed(), [{ url: 'https://x.example/c.png', reason: 'HTTP 404' }]);
    assert.ok(store.known('https://x.example/c.png'));
    store.add({ urls: ['https://x.example/c.png'], body: body('1'), contentType: 'image/png' });
    assert.deepEqual(store.failed(), []);
    assert.equal(store.bytes, 9);
  });

  test('replace swaps a rewritten body in and keeps the byte count right', () => {
    const store = createAssetStore();
    const entry = store.add({ urls: ['https://x.example/site.css'], body: body('.a{}'), contentType: 'text/css' });
    store.replace(entry, body('.a{color:red}'));
    assert.equal(store.bytes, 13);
    assert.equal(store.entry('https://x.example/site.css').body.toString(), '.a{color:red}');
  });
});

describe('copies stay out of git', () => {
  test('git ignores lab/ at the repo root, and only there', (t) => {
    let inside;
    try {
      inside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      inside = 'false';
    }
    if (inside !== 'true') {
      t.skip('not a git work tree');
      return;
    }
    const ignored = (path) => {
      try {
        execFileSync('git', ['check-ignore', '--quiet', '--no-index', path], { cwd: ROOT, stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    };
    assert.ok(ignored('lab/copies/shop.example-20261104-090507/index.html'));
    assert.ok(ignored('lab/copies/shop.example-20261104-090507/assets/a1.woff2'));
    assert.ok(ignored('lab/audits/shop.example-20261104-090507/report.md'), 'npm run audit writes under lab/audits/');
    assert.ok(!ignored('scripts/lib/lab/capture.mjs'), 'scripts/lib/lab/ must stay tracked');
    assert.ok(!ignored('tests/lab/assets.test.mjs'), 'tests/lab/ must stay tracked');
  });
});
