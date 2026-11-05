// Site lab local copies (`npm run lab:copy`, scripts/lib/lab/capture.mjs), run
// in the `lab` project. Copies a fixture shop served on localhost (never a real
// site) from two origins, a page and a "CDN", then opens the copy on the
// playground server. The copy must keep what the scripts rendered, lose the
// scripts themselves, load every file from the copy, and never contact the
// site it came from.

import { createHash } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { LAB_CSP } from '../../playground/server.mjs';
import { capturePage } from '../../scripts/lib/lab/capture.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const COPIES = join(ROOT, 'lab', 'copies');
const NAME = `e2e-lab-copy-${process.pid}-${Date.now()}`;

const svg = (body, size = 10) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${body}</svg>`;
const square = (fill, size) => svg(`<rect width="${size ?? 10}" height="${size ?? 10}" fill="${fill}"/>`, size);

const STYLES_CSS = `@import url("imported.css");
@font-face { font-family: Fixture; src: url("font.woff2") format("woff2"); }
body { font-family: Fixture, sans-serif; }
@media (max-width: 500px) { .phone-only { background-image: url("phone.svg"); } }
`;
// Subresource Integrity hash of styles.css as the site serves it: the copy rewrites the file, so it must drop the hash.
const STYLES_SRI = `sha384-${createHash('sha384').update(STYLES_CSS).digest('base64')}`;

/** The fixture shop. {{CDN}} becomes the CDN origin. The page lives at /shop/ and uses <base href="/">. */
const SITE_FILES = {
  '/shop/': [
    'text/html',
    `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline'">
<title>Fixture shop</title>
<base href="/">
<link rel="preconnect" href="{{CDN}}">
<link rel="icon" href="favicon.svg">
<link rel="stylesheet" href="styles.css" integrity="${STYLES_SRI}">
<link rel="stylesheet" href="{{CDN}}/cdn.css">
<style>.inline-style { color: rgb(7, 8, 9); background-image: url("pattern.svg"); }</style>
<style id="css-in-js"></style>
<script src="app.js"></script>
</head>
<body>
<main>
<h1>Fixture shop</h1>
<p id="from-js">Waiting for JavaScript</p>
<p class="imported">Imported styles</p>
<img id="hero" src="hero.svg?w=800" srcset="hero.svg?w=400 400w, hero.svg?w=800 800w" sizes="400px" alt="Hero" width="400" height="300">
<img id="logo" src="redirect.svg" alt="Logo">
<img id="broken" src="missing.png" alt="Missing">
<div id="inline" class="inline-style" style="background-image: url('stripe.svg'); inline-size: 50px; block-size: 50px">Styled</div>
<div id="cdn" class="cdn">From the CDN stylesheet</div>
<div class="phone-only">Phone only</div>
<a id="link" href="products/shirt" onclick="alert(1)">Shirt</a>
<a id="js-link" href="javascript:alert(1)">Script link</a>
<button type="button" onclick="alert(1)">Add to cart</button>
<iframe id="video" src="{{CDN}}/embed.html" width="320" height="180" title="Video"></iframe>
<svg width="10" height="10" aria-hidden="true"><use href="icons.svg#star"></use></svg>
<noscript><p>Turn on JavaScript</p></noscript>
</main>
<script>
document.getElementById('from-js').textContent = 'Rendered by JavaScript';
document.getElementById('css-in-js').sheet.insertRule('#from-js { color: rgb(1, 2, 3); }');
</script>
</body>
</html>
`,
  ],
  '/styles.css': ['text/css', STYLES_CSS],
  '/imported.css': ['text/css', '.imported { color: rgb(4, 5, 6); }\n'],
  '/app.js': ['text/javascript', "document.documentElement.classList.replace('no-js', 'js');\n"],
  '/favicon.svg': ['image/svg+xml', square('#0a5fd1')],
  '/logo.svg': ['image/svg+xml', square('#222222')],
  '/pattern.svg': ['image/svg+xml', square('#cccccc')],
  '/stripe.svg': ['image/svg+xml', square('#ff9500')],
  '/phone.svg': ['image/svg+xml', square('#34c759')],
  '/icons.svg': ['image/svg+xml', svg('<symbol id="star" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></symbol>')],
  '/font.woff2': ['font/woff2', 'wOF2 fixture font bytes'],
};
const CDN_FILES = {
  '/cdn.css': ['text/css', '.cdn { background-image: url("cdn-pattern.svg"); inline-size: 40px; block-size: 40px; }\n'],
  '/cdn-pattern.svg': ['image/svg+xml', square('#5856d6')],
  '/embed.html': ['text/html', '<!doctype html><title>Video</title><p>Video player</p>'],
};

/** Serves fixture files on 127.0.0.1 and counts requests, so the test can tell whether a copy ever calls home. */
function fixtureServer(files, extra = () => false) {
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    const { pathname, searchParams } = new URL(req.url, 'http://fixture');
    if (extra(pathname, searchParams, res)) return;
    const file = files[pathname];
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const [type, body] = file;
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body.replaceAll('{{CDN}}', cdnOrigin));
  });
  return { server, hits };
}

let cdnOrigin = '';
let siteOrigin = '';
const site = fixtureServer(SITE_FILES, (pathname, searchParams, res) => {
  if (pathname === '/redirect.svg') {
    res.writeHead(302, { location: '/logo.svg' }).end();
    return true;
  }
  if (pathname === '/hero.svg') {
    const width = Number(searchParams.get('w')) || 400;
    res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(square('#af52de', width));
    return true;
  }
  return false;
});
const cdn = fixtureServer(CDN_FILES);

const listen = ({ server }) =>
  new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`)));
const close = ({ server }) => new Promise((done) => server.close(() => done()));

let copy;
let html;
let assetFiles;
const savedFile = (url) => copy.manifest.files.saved.find((entry) => entry.url === url)?.file;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async () => {
  [siteOrigin, cdnOrigin] = await Promise.all([listen(site), listen(cdn)]);
  copy = await capturePage(`${siteOrigin}/shop/`, { copiesDir: COPIES, name: NAME });
  html = await readFile(join(copy.dir, 'index.html'), 'utf8');
  assetFiles = await readdir(join(copy.dir, 'assets'));
});

test.afterAll(async () => {
  await Promise.all([close(site), close(cdn)]);
  await rm(join(COPIES, NAME), { recursive: true, force: true });
});

test('the copy keeps what scripts rendered and none of the scripts', () => {
  expect(html).toContain('Rendered by JavaScript');
  expect(html).toContain('#from-js { color: rgb(1, 2, 3); }');
  expect(html).toMatch(/<html lang="en" class="js">/);
  for (const gone of [/<script/i, /onclick/i, /<base/i, /Content-Security-Policy/i, /preconnect/i, /<noscript/i, /<iframe/i, /javascript:/i, /data-sdk-ref/, /data-sdk-current/, /integrity=/]) {
    expect(html).not.toMatch(gone);
  }
  expect(copy.manifest.removed).toEqual({ scripts: 2, eventHandlers: 2, frames: 1, other: 5 });
  expect(assetFiles.filter((file) => file.endsWith('.js'))).toEqual([]);
});

test('frames become labelled placeholders of the same size', () => {
  const placeholder = /<div id="video" data-sdk-placeholder="iframe" role="img" aria-label="([^"]+)" style="([^"]+)">([^<]+)<\/div>/.exec(html);
  expect(placeholder, 'placeholder div').not.toBeNull();
  const [, label, style, text] = placeholder;
  expect(label).toBe('Embedded content from 127.0.0.1 (not copied)');
  expect(text).toBe(label);
  // The iframe's 320×180 plus its default 2px border: the box takes the same space the frame did.
  expect(style).toContain('inline-size: 324px');
  expect(style).toContain('block-size: 184px');
});

test('every file the page used is saved, across origins, redirects, @import, and other breakpoints', () => {
  for (const url of [
    `${siteOrigin}/styles.css`,
    `${siteOrigin}/imported.css`,
    `${cdnOrigin}/cdn.css`,
    `${cdnOrigin}/cdn-pattern.svg`,
    `${siteOrigin}/pattern.svg`,
    `${siteOrigin}/stripe.svg`,
    `${siteOrigin}/logo.svg`,
    `${siteOrigin}/icons.svg`,
    `${siteOrigin}/favicon.svg`,
    `${siteOrigin}/font.woff2`,
    `${siteOrigin}/phone.svg`,
    `${siteOrigin}/hero.svg?w=400`,
  ]) {
    expect(savedFile(url), url).toMatch(/^assets\/[0-9a-f]{16}\.(css|svg|woff2)$/);
  }
  expect(copy.manifest.files.failed).toContainEqual({ url: `${siteOrigin}/missing.png`, reason: 'HTTP 404' });
  expect(copy.manifest.url).toBe(`${siteOrigin}/shop/`);
  expect(copy.manifest.title).toBe('Fixture shop');
});

test('URLs point at the copy, links point at the live site', async () => {
  // src becomes the image the browser showed (400w); the src fallback (800w) is saved too, so srcset keeps both.
  const [hero400, hero800] = [400, 800].map((w) => savedFile(`${siteOrigin}/hero.svg?w=${w}`));
  expect(html).toContain(`src="${hero400}" srcset="${hero400} 400w, ${hero800} 800w"`);
  expect(html).toContain(`href="${savedFile(`${siteOrigin}/styles.css`)}"`);
  expect(html).toContain(`src="${savedFile(`${siteOrigin}/logo.svg`)}"`);
  expect(html).toContain(`href="${savedFile(`${siteOrigin}/icons.svg`)}#star"`);
  expect(html).toContain(`url(&quot;${savedFile(`${siteOrigin}/stripe.svg`)}&quot;)`);
  expect(html).toContain(`href="${siteOrigin}/products/shirt"`);
  expect(html).toContain(`src="${siteOrigin}/missing.png"`);

  const styles = await readFile(join(copy.dir, savedFile(`${siteOrigin}/styles.css`)), 'utf8');
  const local = (url) => savedFile(url).replace('assets/', '');
  expect(styles).toContain(`@import url("${local(`${siteOrigin}/imported.css`)}")`);
  expect(styles).toContain(`url("${local(`${siteOrigin}/font.woff2`)}")`);
  expect(styles).toContain(`url("${local(`${siteOrigin}/phone.svg`)}")`);
});

test('the playground serves the copy with the live panel, and it never contacts the site', async ({ page, baseURL }) => {
  const siteHits = site.hits.length + cdn.hits.length;
  // Chromium reports a request the CSP then blocks, so count only requests to other origins that completed.
  const reachedElsewhere = [];
  page.on('requestfinished', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL).origin) reachedElsewhere.push(request.url());
  });
  await page.addInitScript(() => {
    window.sdkBlocked = [];
    document.addEventListener('securitypolicyviolation', (event) => window.sdkBlocked.push(event.blockedURI));
  });

  const response = await page.goto(`/lab/copies/${NAME}/`, { waitUntil: 'load' });
  expect(response.headers()['content-security-policy']).toBe(LAB_CSP);
  await page.locator('[data-sdk-live-panel]').waitFor({ state: 'attached' });

  expect(await page.locator('#hero').evaluate((img) => img.complete && img.naturalWidth)).toBe(400);
  expect(await page.locator('#logo').evaluate((img) => img.complete && img.naturalWidth)).toBe(10);
  const background = (selector) => page.locator(selector).evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(await background('#inline')).toContain(`/lab/copies/${NAME}/assets/`);
  expect(await background('#cdn')).toContain(`/lab/copies/${NAME}/assets/`);
  await expect(page.locator('#from-js')).toHaveCSS('color', 'rgb(1, 2, 3)');
  await expect(page.locator('.imported')).toHaveCSS('color', 'rgb(4, 5, 6)');
  await expect(page.locator('#inline')).toHaveCSS('color', 'rgb(7, 8, 9)');
  await expect(page.locator('body')).toHaveCSS('font-family', 'Fixture, sans-serif');

  // The panel starts closed; the Design button opens it.
  const toggle = page.locator('[data-sdk-live-panel] button.toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-sdk-live-panel] #sdk-live-panel')).toBeVisible();

  // The dev client keeps a live-reload stream open, so wait for fonts rather than network idle.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(reachedElsewhere).toEqual([]);
  expect(site.hits.length + cdn.hits.length).toBe(siteHits);
  // The one reference left pointing at the site (a 404 image) is blocked by the lab CSP, not fetched.
  expect(await page.evaluate(() => window.sdkBlocked)).toContain(`${siteOrigin}/missing.png`);
});
