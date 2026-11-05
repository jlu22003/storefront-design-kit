// Makes a frozen local copy of one web page: what `npm run lab:copy` runs.
//
// Headless Chromium (Playwright's library API from @playwright/test) opens the
// page, scrolls it so lazy images load, and records every stylesheet, image,
// font, and media response. The DOM is saved as the scripts left it, then
// frozen: scripts, event handler attributes, <base>, CSP and refresh <meta>, and
// resource hints are removed, and iframes become labelled placeholders. URLs in
// attributes and CSS are rewritten to the copy's own files. The copy is written
// to <copiesDir>/<host>-<stamp>/ (index.html, assets/, manifest.json); the
// playground serves lab/ with a Content-Security-Policy that lets no script from
// the copy run and no request reach the live site.

import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';
import { ASSET_RESOURCE_TYPES, buildPatches, copyName, createAssetStore, isAssetType, rewriteCssUrls, wantedUrls } from './assets.mjs';

/** Browser settings for each capture viewport. */
export const VIEWPORTS = {
  desktop: devices['Desktop Chrome'],
  phone: devices['Pixel 7'],
};

export const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 60_000;
/** At most this many files are fetched after the page settles (CSS references the page never loaded, such as other breakpoints' images). */
const MAX_EXTRA_FETCHES = 200;
const EXTRA_FETCH_TIMEOUT_MS = 15_000;
const EXTRA_FETCH_CONCURRENCY = 6;
/** Stylesheets fetched after the page settles are followed this many @import or url() levels deep. */
const MAX_CSS_DEPTH = 3;

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

// ------------------------------------------------------------ in-page steps
// These two functions run inside the page through page.evaluate, so they must
// not use anything from this module's scope.

/**
 * Freezes the DOM and lists every URL in it. CSS-in-JS rules (inserted into
 * <style> tags with insertRule) and adopted stylesheets become text, the image
 * each <img> showed is recorded, and scripts, event handlers, and frames are
 * removed. Every element with a URL attribute, and every <style> with url() or
 * @import, gets a data-sdk-ref id so applyPatches can find it again.
 */
function prepareDom() {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ASSET_LINK_REL = /(^|\s)(stylesheet|icon|apple-touch-icon|mask-icon)(\s|$)/i;
  const baseURI = document.baseURI;
  const removed = { scripts: 0, eventHandlers: 0, frames: 0, other: 0 };

  // CSS-in-JS: when the text does not hold the rules the browser has, write the rules out.
  for (const style of document.querySelectorAll('style')) {
    let rules;
    try {
      rules = [...(style.sheet?.cssRules ?? [])].map((rule) => rule.cssText);
    } catch {
      continue;
    }
    let parsed = -1;
    try {
      const probe = new CSSStyleSheet();
      probe.replaceSync(style.textContent);
      parsed = probe.cssRules.length;
    } catch {
      // Unparseable text: keep the browser's rules.
    }
    if (style.sheet && parsed !== rules.length) style.textContent = rules.join('\n');
  }
  for (const sheet of document.adoptedStyleSheets ?? []) {
    const style = document.createElement('style');
    style.setAttribute('data-sdk-adopted', '');
    style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
    document.head.append(style);
  }

  // The image the browser chose from srcset and <picture> at this viewport.
  for (const img of document.images) {
    if (img.currentSrc && !img.currentSrc.startsWith('data:')) img.setAttribute('data-sdk-current', img.currentSrc);
  }

  const drop = [
    'script',
    'noscript',
    'base',
    'link[rel~="preload" i]',
    'link[rel~="modulepreload" i]',
    'link[rel~="prefetch" i]',
    'link[rel~="preconnect" i]',
    'link[rel~="dns-prefetch" i]',
    'link[rel~="manifest" i]',
    'meta[http-equiv="content-security-policy" i]',
    'meta[http-equiv="refresh" i]',
  ].join(', ');
  for (const node of document.querySelectorAll(drop)) {
    if (node.localName === 'script') removed.scripts += 1;
    else removed.other += 1;
    node.remove();
  }

  // Frames and plugins become a labelled box of the same size.
  for (const frame of document.querySelectorAll('iframe, frame, object, embed')) {
    const source = frame.getAttribute('src') ?? frame.getAttribute('data') ?? '';
    let host = '';
    try {
      host = new URL(source, baseURI).hostname;
    } catch {
      // No usable URL.
    }
    const rect = frame.getBoundingClientRect();
    const box = document.createElement('div');
    for (const name of ['id', 'class', 'style']) {
      if (frame.hasAttribute(name)) box.setAttribute(name, frame.getAttribute(name));
    }
    const label = host ? `Embedded content from ${host} (not copied)` : 'Embedded content (not copied)';
    box.setAttribute('data-sdk-placeholder', frame.localName);
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', label);
    box.textContent = label;
    const positioned = /^(absolute|fixed)$/.test(getComputedStyle(frame).position);
    const size = positioned ? '' : `inline-size: ${Math.round(rect.width)}px; max-inline-size: 100%; block-size: ${Math.round(rect.height)}px;`;
    box.style.cssText += `${size} box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 8px; overflow: hidden; border: 1px dashed #8a8a8e; background: #f2f2f7; color: #3c3c43; font: 14px/1.4 system-ui, sans-serif; text-align: center;`;
    frame.replaceWith(box);
    removed.frames += 1;
  }

  // Event handlers, integrity hashes (the saved files are rewritten), javascript: URLs, and every URL the copy has to rewrite.
  const refs = [];
  const styles = [];
  let next = 0;
  for (const node of document.querySelectorAll('*')) {
    const entries = [];
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        removed.eventHandlers += 1;
        continue;
      }
      if (name === 'integrity') {
        node.removeAttribute(attr.name);
        removed.other += 1;
        continue;
      }
      let kind = null;
      if (name === 'src' || name === 'poster' || name === 'background' || name === 'data-sdk-current') kind = 'asset';
      else if (name === 'srcset') kind = 'srcset';
      else if (name === 'href' || name === 'xlink:href') {
        const svgAsset = node.namespaceURI === SVG_NS && node.localName !== 'a';
        kind = svgAsset || (node.localName === 'link' && ASSET_LINK_REL.test(node.getAttribute('rel') ?? '')) ? 'asset' : 'link';
      } else if (name === 'action' || name === 'formaction') kind = 'link';
      else if (name === 'style' && /url\(/i.test(attr.value)) kind = 'style';
      if (!kind) continue;
      if (kind !== 'style' && /^\s*javascript:/i.test(attr.value)) {
        if (kind === 'link') node.setAttribute(attr.name, '#');
        else node.removeAttribute(attr.name);
        continue;
      }
      entries.push({ name: attr.name, value: attr.value, kind });
    }
    if (entries.length) {
      const id = String(next++);
      node.setAttribute('data-sdk-ref', id);
      refs.push({ id, tag: node.localName, entries });
    }
  }
  for (const style of document.querySelectorAll('style')) {
    if (!/url\(|@import/i.test(style.textContent)) continue;
    const id = String(next++);
    style.setAttribute('data-sdk-ref', id);
    styles.push({ id, text: style.textContent });
  }
  return { baseURI, title: document.title, refs, styles, removed };
}

/** Applies the patches from buildPatches, then returns the document as HTML, open shadow roots included. */
function applyPatches(patches) {
  const nodes = new Map([...document.querySelectorAll('[data-sdk-ref]')].map((node) => [node.getAttribute('data-sdk-ref'), node]));
  for (const { id, attrs = {}, text, remove } of patches) {
    const node = nodes.get(id);
    if (!node) continue;
    if (remove) {
      node.remove();
      continue;
    }
    for (const [name, value] of Object.entries(attrs)) {
      if (value === null) node.removeAttribute(name);
      else node.setAttribute(name, value);
    }
    if (text !== undefined) node.textContent = text;
  }
  for (const node of nodes.values()) node.removeAttribute('data-sdk-ref');

  const shadowRoots = [];
  const walk = (root) => {
    for (const node of root.querySelectorAll('*')) {
      if (node.shadowRoot) {
        shadowRoots.push(node.shadowRoot);
        walk(node.shadowRoot);
      }
    }
  };
  walk(document);
  const html = document.documentElement;
  const doctype = document.doctype;
  const declaration = doctype
    ? `<!DOCTYPE ${doctype.name}${doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ''}${doctype.systemId ? `${doctype.publicId ? '' : ' SYSTEM'} "${doctype.systemId}"` : ''}>\n`
    : '';
  const open = html.cloneNode(false).outerHTML.replace(/<\/html>$/i, '');
  const inner = typeof html.getHTML === 'function' ? html.getHTML({ serializableShadowRoots: true, shadowRoots }) : html.innerHTML;
  return `${declaration}${open}${inner}</html>\n`;
}

// --------------------------------------------------------------- capture

/** Scrolls through the page so lazy content loads, then waits for the network and fonts to settle. */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.evaluate(async () => {
    const pause = () => new Promise((done) => setTimeout(done, 150));
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let i = 0; i < 40; i += 1) {
      const before = scrollY;
      scrollBy({ top: step, behavior: 'instant' });
      await pause();
      if (scrollY === before) break;
    }
    scrollTo({ top: 0, behavior: 'instant' });
    await pause();
  });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Every URL a response answered for: the final URL first, then each URL that redirected to it. */
function responseUrls(response) {
  const urls = [response.url()];
  for (let request = response.request().redirectedFrom(); request; request = request.redirectedFrom()) urls.push(request.url());
  return urls;
}

/** Fetches what the page referenced but never loaded, following new stylesheets a few levels deep. */
async function fetchMissing(context, store, wanted) {
  let queue = [...wanted].filter((url) => !store.known(url));
  let fetched = 0;
  for (let depth = 0; depth <= MAX_CSS_DEPTH && queue.length; depth += 1) {
    const found = new Set();
    const batch = queue.filter((url) => !store.known(url));
    queue = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < batch.length) {
        const url = batch[cursor++];
        if (store.known(url)) continue;
        if (fetched >= MAX_EXTRA_FETCHES) {
          store.skip(url, `more than ${MAX_EXTRA_FETCHES} extra files`);
          continue;
        }
        fetched += 1;
        try {
          const response = await context.request.get(url, { timeout: EXTRA_FETCH_TIMEOUT_MS, maxRedirects: 5 });
          const contentType = response.headers()['content-type'];
          if (!response.ok()) store.fail(url, `HTTP ${response.status()}`);
          else if (!isAssetType(contentType)) store.skip(url, `not a stylesheet, image, font, or media file (${contentType ?? 'no type'})`);
          else {
            const entry = store.add({ urls: [response.url(), url], body: await response.body(), contentType });
            if (entry?.ext === 'css') for (const ref of rewriteCssUrls(entry.body.toString('utf8'), { base: entry.url }).refs) found.add(ref);
          }
        } catch (error) {
          store.fail(url, error.message.split('\n')[0]);
        }
      }
    };
    await Promise.all(Array.from({ length: EXTRA_FETCH_CONCURRENCY }, worker));
    queue = [...found];
  }
}

/** Launches Chromium, explaining how to install it when Playwright's browsers are missing. */
export async function launch() {
  try {
    return await chromium.launch();
  } catch (error) {
    if (/Executable doesn't exist|playwright install/i.test(error.message)) {
      throw new Error("Playwright's Chromium is not installed. Run `npx playwright install chromium` once, then try again.");
    }
    throw error;
  }
}

/**
 * Copies one page. Options: copiesDir (where copies go), viewport ("desktop"
 * or "phone"), maxBytes (cap on saved files), timeoutMs (page load), name
 * (folder name; default host-stamp). Resolves to { name, dir, manifest }.
 */
export async function capturePage(
  url,
  { copiesDir, viewport = 'desktop', maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS, name, now = new Date() } = {},
) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error(`Only http and https pages can be copied (got ${target.protocol}).`);
  if (!copiesDir) throw new Error('capturePage needs a copiesDir.');
  const device = VIEWPORTS[viewport];
  if (!device) throw new Error(`Unknown viewport "${viewport}"; use ${Object.keys(VIEWPORTS).join(' or ')}.`);

  const store = createAssetStore({ maxBytes });
  const browser = await launch();
  try {
    const context = await browser.newContext({ ...device, bypassCSP: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    const pending = [];
    let recording = true;
    page.on('response', (response) => {
      if (!recording) return;
      const request = response.request();
      const resourceType = request.resourceType();
      const contentType = response.headers()['content-type'];
      if (!ASSET_RESOURCE_TYPES.has(resourceType) && !isAssetType(contentType)) return;
      const status = response.status();
      if (status >= 300 && status < 400) return; // The redirect's target answers for it.
      if (status === 206) return; // A partial media range; fetched whole afterwards if the page references it.
      if (!response.ok()) {
        store.fail(response.url(), `HTTP ${status}`);
        return;
      }
      pending.push(
        response.body().then(
          (body) => store.add({ urls: responseUrls(response), body, contentType, resourceType }),
          (error) => store.fail(response.url(), error.message.split('\n')[0]),
        ),
      );
    });
    page.on('requestfailed', (request) => {
      if (recording && ASSET_RESOURCE_TYPES.has(request.resourceType())) store.fail(request.url(), request.failure()?.errorText ?? 'failed');
    });

    const response = await page.goto(target.href, { waitUntil: 'load', timeout: timeoutMs });
    if (response && response.status() >= 400) throw new Error(`The page answered HTTP ${response.status()}; nothing was copied.`);
    await settle(page);
    recording = false;
    await Promise.all(pending);
    // From here on the page fetches nothing: rewritten URLs point at files that exist only in the copy.
    await page.route('**/*', (route) => route.abort());

    const finalUrl = page.url();
    const collected = await page.evaluate(prepareDom);
    const base = collected.baseURI;

    // Stylesheets the page loaded, then everything referenced but not loaded.
    const wanted = wantedUrls({ ...collected, base });
    for (const entry of store.files()) {
      if (entry.ext === 'css') for (const ref of rewriteCssUrls(entry.body.toString('utf8'), { base: entry.url }).refs) wanted.add(ref);
    }
    await fetchMissing(context, store, wanted);

    // Point each saved stylesheet at the copy's files (they sit beside it in assets/).
    for (const entry of store.files()) {
      if (entry.ext !== 'css') continue;
      const { css } = rewriteCssUrls(entry.body.toString('utf8'), { base: entry.url, lookup: store.lookup });
      store.replace(entry, Buffer.from(css, 'utf8'));
    }

    const html = await page.evaluate(applyPatches, buildPatches({ ...collected, base, lookup: store.lookup }));
    const userAgent = await page.evaluate(() => navigator.userAgent);
    await context.close();

    // Write to a hidden folder first (the dev server never serves dot-folders), then move it into place.
    await mkdir(copiesDir, { recursive: true });
    let folder = name ?? copyName(target.href, now);
    for (let n = 2; await exists(join(copiesDir, folder)); n += 1) folder = `${name ?? copyName(target.href, now)}-${n}`;
    const partial = join(copiesDir, `.partial-${folder}`);
    const dir = join(copiesDir, folder);
    await rm(partial, { recursive: true, force: true });
    await mkdir(join(partial, 'assets'), { recursive: true });
    const htmlBytes = Buffer.byteLength(html);
    await writeFile(join(partial, 'index.html'), html);
    const files = store.files();
    await Promise.all(files.map((entry) => writeFile(join(partial, 'assets', entry.file), entry.body)));

    const saved = [];
    for (const entry of files) saved.push({ url: entry.url, file: `assets/${entry.file}`, bytes: entry.bytes });
    const manifest = {
      version: 1,
      url: target.href,
      finalUrl,
      title: collected.title,
      capturedAt: now.toISOString(),
      viewport: { name: viewport, ...device.viewport },
      userAgent,
      bytes: htmlBytes + store.bytes,
      maxBytes,
      removed: collected.removed,
      files: { saved, failed: store.failed(), skipped: store.skipped() },
    };
    await writeFile(join(partial, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(partial, dir);
    return { name: folder, dir, manifest };
  } finally {
    await browser.close();
  }
}
