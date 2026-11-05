#!/usr/bin/env node
// The playground's dev server: `npm run dev`.
//
// Serves the kit's CSS and the playground pages from this repository on
// localhost only, and reloads the browser whenever a served file is saved.
// Saved CSS is swapped in place without a reload, so the page keeps its
// scroll position and the design panel keeps its state. Node built-ins only.
//
//   node playground/server.mjs [--port 4400] [--no-open]
//
// Served:  /theme/assets/*  the kit stylesheets
//          /playground/*    the playground pages, starters, and dev scripts
//          /sketches/*      your private, gitignored sketches
//          /lab/*           local copies of other sites (`npm run lab:copy`),
//                           gitignored, with a Content-Security-Policy (LAB_CSP)
// Every HTML page gets the dev client injected (live reload and design panel),
// so pages stay plain HTML you can copy anywhere.

import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

export const ROOT = resolve(import.meta.dirname, '..');
export const SERVED_DIRS = ['theme/assets', 'playground', 'sketches', 'lab'];
// lab/ holds frozen copies that never change once written, so it is not watched for live reload.
const WATCHED_DIRS = SERVED_DIRS.filter((dir) => dir !== 'lab');
const LAB_PREFIX = '/lab/';

/**
 * Sent with everything under /lab/. Copies are other sites' pages: only
 * same-origin scripts may run (the dev client; the copy's own scripts were
 * removed), inline handlers and javascript: URLs are blocked, frames are off,
 * and nothing loads from or submits to another origin, so viewing a copy never
 * contacts the live site.
 */
export const LAB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const EVENTS_PATH = '/__dev/events';
const CLIENT_TAG = '<script type="module" src="/playground/dev/client.js"></script>';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/** Maps a URL path to a file under one of the served directories, or null. */
export function resolveRequestPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relativePath = normalize(decoded).replace(/^[/\\]+/, '');
  const absolute = resolve(root, relativePath);
  const inside = relative(root, absolute).split(sep).join('/');
  if (inside.startsWith('..') || inside.split('/').some((part) => part.startsWith('.'))) return null;
  const allowed = SERVED_DIRS.some((dir) => inside === dir || inside.startsWith(`${dir}/`));
  return allowed ? absolute : null;
}

/** Adds the dev client to an HTML document, just before </body> when there is one. */
export function injectClient(html) {
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at === -1 ? `${html}\n${CLIENT_TAG}\n` : `${html.slice(0, at)}${CLIENT_TAG}\n${html.slice(at)}`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

async function directoryListing(dir, urlPath) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const base = urlPath.endsWith('/') ? urlPath : `${urlPath}/`;
  const items = entries
    .map((entry) => {
      const name = entry.isDirectory() ? `${entry.name}/` : entry.name;
      return `<li><a href="${escapeHtml(base + encodeURIComponent(entry.name))}${entry.isDirectory() ? '/' : ''}">${escapeHtml(name)}</a></li>`;
    })
    .join('\n');
  const empty = urlPath.startsWith(LAB_PREFIX)
    ? '<p class="sdk-text-secondary">No copies yet. Run <code>npm run lab:copy -- &lt;url&gt;</code> to copy a page.</p>'
    : '<p class="sdk-text-secondary">Nothing here yet. Run <code>npm run sketch -- my-idea</code> to start one.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(urlPath)}</title>
<link rel="stylesheet" href="/theme/assets/sdk-tokens.css">
<link rel="stylesheet" href="/theme/assets/sdk-base.css">
<link rel="stylesheet" href="/theme/assets/sdk-primitives.css">
</head>
<body>
<main class="sdk-center sdk-stack" data-gutter style="--measure: 48rem; --padding-block: var(--sdk-space-48)">
<p><a href="/playground/">Playground</a></p>
<h1>${escapeHtml(urlPath)}</h1>
${items ? `<ul class="sdk-stack" style="--child-gap: var(--sdk-space-8)">\n${items}\n</ul>` : empty}
</main>
</body>
</html>
`;
}

/**
 * Creates the dev server (not yet listening). Returns { server, notify, close }:
 * notify(path) tells every open page that `path` (relative to root) changed.
 */
export function createDevServer({ root = ROOT } = {}) {
  const clients = new Set();

  const notify = (changedPath) => {
    const data = JSON.stringify({ path: `/${changedPath.split(sep).join('/')}` });
    for (const res of clients) res.write(`data: ${data}\n\n`);
  };

  const server = createServer(async (req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!LOOPBACK_HOSTS.has(host)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('The playground only answers on localhost.\n');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === EVENTS_PATH) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write('retry: 500\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, { 'cache-control': 'no-store' }).end();
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/playground/' }).end();
      return;
    }

    const extraHeaders = url.pathname.startsWith(LAB_PREFIX) ? { 'content-security-policy': LAB_CSP } : {};
    const file = resolveRequestPath(root, url.pathname);
    if (!file) return notFound(res);
    let info;
    try {
      info = await stat(file);
    } catch {
      return notFound(res);
    }

    let target = file;
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      target = join(file, 'index.html');
      try {
        await stat(target);
      } catch {
        const listing = injectClient(await directoryListing(file, url.pathname));
        return send(res, req, 200, TYPES['.html'], listing, extraHeaders);
      }
    }

    const type = TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream';
    let body;
    try {
      body = await readFile(target);
    } catch {
      return notFound(res);
    }
    if (type.startsWith('text/html')) body = injectClient(body.toString('utf8'));
    return send(res, req, 200, type, body, extraHeaders);
  });

  const close = () =>
    new Promise((done) => {
      for (const res of clients) res.end();
      clients.clear();
      server.close(() => done());
    });

  return { server, notify, close };
}

function send(res, req, status, type, body, headers = {}) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('Not found\n');
}

/** Watches the served directories (all but lab/) and calls onChange(relativePath), debounced per file. */
export function watchServedDirs(root, onChange) {
  const timers = new Map();
  const watchers = [];
  for (const dir of WATCHED_DIRS) {
    const watcher = watch(join(root, dir), { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const name = filename.toString();
      const base = name.split(/[/\\]/).at(-1);
      // Skip editor swap, backup, and temp files.
      if (base.startsWith('.') || base.endsWith('~') || /^\d+$/.test(base) || base.endsWith('.swp')) return;
      const path = join(dir, name);
      clearTimeout(timers.get(path));
      timers.set(
        path,
        setTimeout(() => {
          timers.delete(path);
          // Editors and tools save through short-lived temp files; skip any that are already gone.
          if (existsSync(join(root, path))) onChange(path);
        }, 40),
      );
    });
    watchers.push(watcher);
  }
  return () => watchers.forEach((watcher) => watcher.close());
}

function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`Open ${url} in your browser.`));
    child.unref();
  } catch {
    console.log(`Open ${url} in your browser.`);
  }
}

function listen(server, port, host) {
  return new Promise((done, fail) => {
    const onError = (error) => {
      server.off('listening', onListening);
      fail(error);
    };
    const onListening = () => {
      server.off('error', onError);
      done(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
    },
  });
  const explicitPort = values.port ?? process.env.PORT;
  let port = Number(explicitPort ?? 4400);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid port: ${explicitPort}`);

  // sketches/ and lab/ are gitignored; make sure they exist so they can be served and listed.
  await mkdir(join(ROOT, 'sketches'), { recursive: true });
  await mkdir(join(ROOT, 'lab', 'copies'), { recursive: true });

  const { server, notify } = createDevServer();
  for (let attempt = 0; ; attempt += 1) {
    try {
      port = await listen(server, port, '127.0.0.1');
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || explicitPort || attempt >= 10) throw error;
      port += 1;
    }
  }

  watchServedDirs(ROOT, (path) => {
    console.log(`changed ${path.split(sep).join('/')}`);
    notify(path);
  });

  const url = `http://127.0.0.1:${port}/playground/`;
  console.log(`Playground running at ${url}`);
  console.log('Save any file in theme/assets/, playground/, or sketches/ and the page updates. Ctrl+C stops.');
  console.log(`Local copies of other sites (npm run lab:copy) are at ${url.replace(/\/playground\/$/, '/lab/copies/')}`);
  if (!values['no-open'] && !process.env.CI) openBrowser(url);
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
