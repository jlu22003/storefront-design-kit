// Pure helpers for local page copies (`npm run lab:copy`, see capture.mjs):
// naming a copy, picking file types, keeping saved files under a size cap, and
// rewriting URLs in CSS, srcset, and HTML attributes to the copy's own files.
// No file system, browser, or network access, so Node tests can cover all of it.

import { createHash } from 'node:crypto';

/** File extension for each content type a copy keeps. The dev server serves each one (server.mjs TYPES). */
export const ASSET_EXTENSIONS = {
  'text/css': 'css',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'application/font-woff': 'woff',
  'font/ttf': 'ttf',
  'application/x-font-ttf': 'ttf',
  'font/otf': 'otf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
};

const KNOWN_EXTENSIONS = new Set(Object.values(ASSET_EXTENSIONS));
const EXTENSION_ALIASES = { jpeg: 'jpg' };

/** Browser resource types whose responses a copy keeps. Scripts, documents, and data requests are never kept. */
export const ASSET_RESOURCE_TYPES = new Set(['stylesheet', 'image', 'font', 'media']);

const mediaType = (contentType) => String(contentType ?? '').split(';')[0].trim().toLowerCase();

/** True when a content type is one a copy keeps: CSS, images, fonts, video, or audio. */
export function isAssetType(contentType) {
  return mediaType(contentType) in ASSET_EXTENSIONS;
}

/**
 * The extension to save a response under: from its content type, else from the
 * URL's own extension when it is one we serve, else "css" for stylesheets and
 * "bin" for anything else.
 */
export function extensionFor(contentType, url, resourceType) {
  const fromType = ASSET_EXTENSIONS[mediaType(contentType)];
  if (fromType) return fromType;
  let fromPath = '';
  try {
    fromPath = new URL(url).pathname.split('/').at(-1).split('.').at(-1).toLowerCase();
  } catch {
    // Not a URL; fall through.
  }
  fromPath = EXTENSION_ALIASES[fromPath] ?? fromPath;
  if (KNOWN_EXTENSIONS.has(fromPath)) return fromPath;
  return resourceType === 'stylesheet' ? 'css' : 'bin';
}

const pad = (n) => String(n).padStart(2, '0');

/** A copy's folder name: the page's host and the local capture time, e.g. "shop.example-20261104-102233". */
export function copyName(url, date = new Date()) {
  const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/[^a-z0-9.-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${host || 'page'}-${stamp}`;
}

/**
 * Resolves a URL as written in a page or stylesheet against `base`. Returns
 * { url, hash } for http(s) URLs, with the #fragment split off so "icons.svg#cart"
 * maps to the saved icons.svg. Returns null for data:, blob:, javascript:,
 * fragment-only (#id), and empty values, which are left as written.
 */
export function resolveRef(value, base) {
  const text = String(value ?? '').trim();
  if (!text || text.startsWith('#') || /^(data|blob|javascript|about|mailto|tel):/i.test(text)) return null;
  let url;
  try {
    url = new URL(text, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const hash = url.hash;
  url.hash = '';
  return { url: url.href, hash };
}

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;
const CSS_IMPORT = /@import\s+(["'])([^"']*)\1/gi;

/**
 * Rewrites url(…) and @import "…" in CSS. Each http(s) URL resolves against
 * `base`; when lookup(url) returns a saved file name the reference becomes
 * prefix + name (+ #fragment), otherwise the absolute URL (the copy's CSP then
 * blocks it). Returns { css, refs }, refs being every absolute URL referenced.
 */
export function rewriteCssUrls(css, { base, lookup = () => null, prefix = '' }) {
  const refs = [];
  const map = (value) => {
    const ref = resolveRef(value, base);
    if (!ref) return null;
    refs.push(ref.url);
    const file = lookup(ref.url);
    return file ? `${prefix}${file}${ref.hash}` : `${ref.url}${ref.hash}`;
  };
  const out = String(css)
    .replace(CSS_URL, (match, double, single, bare) => {
      const next = map(double ?? single ?? bare ?? '');
      return next === null ? match : `url("${next}")`;
    })
    .replace(CSS_IMPORT, (match, quote, value) => {
      const next = map(value);
      return next === null ? match : `@import "${next}"`;
    });
  return { css: out, refs };
}

/** Splits a srcset into { url, descriptor } candidates, following the HTML parsing rules (URLs may contain commas). */
export function parseSrcset(srcset) {
  const text = String(srcset ?? '');
  const candidates = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i += 1;
    if (i >= text.length) break;
    let url = '';
    while (i < text.length && !/\s/.test(text[i])) url += text[i++];
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      let depth = 0;
      while (i < text.length && (text[i] !== ',' || depth > 0)) {
        if (text[i] === '(') depth += 1;
        else if (text[i] === ')') depth = Math.max(0, depth - 1);
        descriptor += text[i++];
      }
      i += 1;
    }
    if (url) candidates.push({ url, descriptor: descriptor.trim() });
  }
  return candidates;
}

/**
 * Keeps only the srcset candidates that were saved, pointing at prefix + file.
 * Returns the new srcset, or null when none were saved (drop the attribute).
 */
export function rewriteSrcset(srcset, { base, lookup = () => null, prefix = '' }) {
  const kept = [];
  for (const { url, descriptor } of parseSrcset(srcset)) {
    const ref = resolveRef(url, base);
    const file = ref && lookup(ref.url);
    if (file) kept.push(descriptor ? `${prefix}${file}${ref.hash} ${descriptor}` : `${prefix}${file}${ref.hash}`);
  }
  return kept.length ? kept.join(', ') : null;
}

/**
 * Collects a copy's files in memory, under a byte cap. add() keeps a response
 * body once (identical bodies share one file) and answers for every URL that
 * led to it, redirects included. A body that would pass the cap is not kept and
 * is listed as skipped.
 */
export function createAssetStore({ maxBytes = Infinity } = {}) {
  const byUrl = new Map();
  const byName = new Map();
  const failed = new Map();
  const skipped = new Map();
  let bytes = 0;

  return {
    get bytes() {
      return bytes;
    },
    has: (url) => byUrl.has(url),
    /** The saved file name for an absolute URL, or null. */
    lookup: (url) => byUrl.get(url)?.file ?? null,
    entry: (url) => byUrl.get(url) ?? null,
    known: (url) => byUrl.has(url) || failed.has(url) || skipped.has(url),
    /** Keeps a body; returns its entry, or null when skipped. `urls[0]` is the final URL. */
    add({ urls, body, contentType, resourceType }) {
      const [url] = urls;
      const ext = extensionFor(contentType, url, resourceType);
      // A stylesheet is rewritten against its own URL, so the same text at two URLs needs two files.
      const hash = createHash('sha256');
      if (ext === 'css') hash.update(`${url}\n`);
      const file = `${hash.update(body).digest('hex').slice(0, 16)}.${ext}`;
      let entry = byName.get(file);
      if (!entry) {
        if (bytes + body.length > maxBytes) {
          for (const each of urls) if (!byUrl.has(each)) skipped.set(each, 'size cap');
          return null;
        }
        entry = { url, file, ext, body, bytes: body.length };
        byName.set(file, entry);
        bytes += body.length;
      }
      for (const each of urls) {
        byUrl.set(each, entry);
        failed.delete(each);
        skipped.delete(each);
      }
      return entry;
    },
    fail(url, reason) {
      if (!byUrl.has(url)) failed.set(url, reason);
    },
    skip(url, reason) {
      if (!byUrl.has(url)) skipped.set(url, reason);
    },
    /** Replaces a saved file's body (a rewritten stylesheet), keeping its name. */
    replace(entry, body) {
      bytes += body.length - entry.bytes;
      entry.body = body;
      entry.bytes = body.length;
    },
    files: () => [...byName.values()],
    failed: () => [...failed].map(([url, reason]) => ({ url, reason })),
    skipped: () => [...skipped].map(([url, reason]) => ({ url, reason })),
  };
}

/**
 * Turns what prepareDom (capture.mjs) collected from the page into attribute
 * and text patches for applyPatches. refs: [{ id, tag, entries: [{ name, value, kind }] }]
 * with kind "asset", "srcset", "link", or "style"; styles: [{ id, text }] for
 * <style> elements. Saved files are referenced as assets/<file>. A <source>
 * left with no saved srcset candidate is removed, so its <picture> falls back
 * to the <img>.
 */
export function buildPatches({ refs = [], styles = [], base, lookup }) {
  const options = { base, lookup, prefix: 'assets/' };
  const patches = [];
  for (const { id, tag, entries } of refs) {
    const attrs = {};
    let remove = false;
    const current = entries.find((entry) => entry.name === 'data-sdk-current');
    for (const { name, value, kind } of entries) {
      if (name === 'data-sdk-current') {
        attrs[name] = null;
        continue;
      }
      if (kind === 'srcset') {
        const next = rewriteSrcset(value, options);
        attrs[name] = next;
        if (next === null && tag === 'source') remove = true;
        continue;
      }
      if (kind === 'style') {
        attrs[name] = rewriteCssUrls(value, options).css;
        continue;
      }
      // The image the browser actually showed wins over src, so the copy shows the same one.
      const ref = resolveRef(name === 'src' && current ? current.value : value, base);
      if (!ref) continue;
      const file = kind === 'asset' ? lookup(ref.url) : null;
      attrs[name] = file ? `assets/${file}${ref.hash}` : `${ref.url}${ref.hash}`;
    }
    if (current && !entries.some((entry) => entry.name === 'src')) {
      const ref = resolveRef(current.value, base);
      const file = ref && lookup(ref.url);
      if (file) attrs.src = `assets/${file}${ref.hash}`;
    }
    patches.push({ id, attrs, remove });
  }
  for (const { id, text } of styles) patches.push({ id, text: rewriteCssUrls(text, options).css });
  return patches;
}

/** Every absolute URL a page or stylesheet still needs that is worth fetching: assets and CSS references, not srcset candidates or links. */
export function wantedUrls({ refs = [], styles = [], base }) {
  const wanted = new Set();
  for (const { entries } of refs) {
    for (const { name, value, kind } of entries) {
      if (kind === 'asset' || name === 'data-sdk-current') {
        const ref = resolveRef(value, base);
        if (ref) wanted.add(ref.url);
      } else if (kind === 'style') {
        for (const url of rewriteCssUrls(value, { base }).refs) wanted.add(url);
      }
    }
  }
  for (const { text } of styles) for (const url of rewriteCssUrls(text, { base }).refs) wanted.add(url);
  return wanted;
}
