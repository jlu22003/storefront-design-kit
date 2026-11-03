// Playground dev server and design panel helpers.

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { changedCss, contrastRatio, normalizeHex, scaleValue } from '../../playground/dev/panel.js';
import { createDevServer, injectClient, resolveRequestPath } from '../../playground/server.mjs';

let root;
let dev;
let port;

function get(path, { host } = {}) {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host: host ?? `localhost:${port}` } }, (res) => {
      if (res.headers['content-type'] === 'text/event-stream') {
        res.destroy();
        done({ status: res.statusCode, headers: res.headers, body: '' });
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'sdk-playground-'));
  await mkdir(join(root, 'playground'), { recursive: true });
  await mkdir(join(root, 'theme/assets'), { recursive: true });
  await mkdir(join(root, 'sketches/idea'), { recursive: true });
  await writeFile(join(root, 'playground/index.html'), '<!doctype html><html><body><p>hi</p></body></html>');
  await writeFile(join(root, 'theme/assets/sdk-base.css'), 'body {}');
  await writeFile(join(root, 'sketches/idea/notes.txt'), 'private');
  await writeFile(join(root, 'secret.txt'), 'outside the served dirs');
  dev = createDevServer({ root });
  await new Promise((done) => dev.server.listen(0, '127.0.0.1', done));
  port = dev.server.address().port;
});

after(async () => {
  await dev.close();
  await rm(root, { recursive: true, force: true });
});

describe('dev server', () => {
  test('redirects / to the playground index', async () => {
    const res = await get('/');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/playground/');
  });

  test('serves HTML with the dev client injected before </body>', async () => {
    const res = await get('/playground/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /<script type="module" src="\/playground\/dev\/client\.js"><\/script>\n<\/body>/);
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('serves the kit CSS', async () => {
    const res = await get('/theme/assets/sdk-base.css');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/css/);
    assert.equal(res.body, 'body {}');
  });

  test('lists a sketch folder that has no index.html', async () => {
    const res = await get('/sketches/idea/');
    assert.equal(res.status, 200);
    assert.match(res.body, /notes\.txt/);
  });

  test('refuses files outside the served directories and path traversal', async () => {
    for (const path of ['/secret.txt', '/playground/../secret.txt', '/playground/%2e%2e/secret.txt', '/theme/tokens.json', '/package.json']) {
      assert.equal((await get(path)).status, 404, path);
    }
  });

  test('answers only to localhost host names', async () => {
    assert.equal((await get('/playground/', { host: 'evil.example:80' })).status, 403);
    assert.equal((await get('/playground/', { host: `127.0.0.1:${port}` })).status, 200);
  });

  test('opens a live-reload event stream', async () => {
    const res = await get('/__dev/events');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/event-stream');
  });
});

describe('dev server helpers', () => {
  test('resolveRequestPath keeps requests inside the served directories', () => {
    assert.equal(resolveRequestPath('/repo', '/playground/a.html'), '/repo/playground/a.html');
    assert.equal(resolveRequestPath('/repo', '/sketches/x/index.html'), '/repo/sketches/x/index.html');
    assert.equal(resolveRequestPath('/repo', '/sketches/.git/config'), null);
    assert.equal(resolveRequestPath('/repo', '/../etc/passwd'), null);
    assert.equal(resolveRequestPath('/repo', '/%E0%A4%A'), null);
  });

  test('injectClient appends when there is no </body>', () => {
    assert.match(injectClient('<p>fragment</p>'), /<p>fragment<\/p>\n<script type="module"/);
  });
});

describe('design panel helpers', () => {
  test('scaleValue multiplies every length, clamp() included', () => {
    assert.equal(scaleValue('1rem', 1.25), '1.25rem');
    assert.equal(scaleValue('clamp(2.5rem, 1.75rem + 2.5vw, 3.5rem)', 2), 'clamp(5rem, 3.5rem + 5vw, 7rem)');
    assert.equal(scaleValue('8px', 0.5), '4px');
    assert.equal(scaleValue('0', 2), '0');
  });

  test('normalizeHex accepts #rgb and #rrggbb only', () => {
    assert.equal(normalizeHex('#ABC'), '#aabbcc');
    assert.equal(normalizeHex(' #0a5fd1 '), '#0a5fd1');
    assert.equal(normalizeHex('rgb(0 0 0 / 0.35)'), null);
  });

  test('contrastRatio matches WCAG for black on white', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff') * 100) / 100, 21);
    assert.equal(Math.round(contrastRatio('#ffffff', '#0a5fd1') * 100) / 100, 5.88);
  });

  test('changedCss emits only changed tokens', () => {
    assert.match(changedCss({}, {}), /No changes yet/);
    assert.match(changedCss({}, { light: {}, dark: {} }), /No changes yet/);
    const css = changedCss({ '--sdk-space-16': '1.25rem', '--sdk-space-8': '0.625rem' }, {});
    assert.match(css, /:root \{\n {2}--sdk-space-16: 1\.25rem;\n {2}--sdk-space-8: 0\.625rem;\n\}/);
    assert.doesNotMatch(css, /appearance|data-theme/);
  });

  test('changedCss puts each appearance\'s color picks under that appearance\'s selectors', () => {
    const css = changedCss({}, { light: { '--sdk-color-bg': '#fafafa' }, dark: { '--sdk-color-bg': '#101010' } });
    assert.match(css, /light appearance\. \*\/\n:root \{\n {2}--sdk-color-bg: #fafafa;\n\}/);
    assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\) \{\n {4}--sdk-color-bg: #101010;\n {2}\}\n\}/);
    assert.match(css, /:root\[data-theme="dark"\] \{\n {2}--sdk-color-bg: #101010;\n\}/);
    assert.doesNotMatch(changedCss({}, { light: { '--sdk-color-bg': '#fafafa' } }), /#101010|dark/);
  });
});
