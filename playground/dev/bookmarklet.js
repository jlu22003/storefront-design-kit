// Builds the live-site bookmarklet from live-panel.js, util.js, the panel's
// stylesheet, and the kit's tokens. Runs in Node (`npm run bookmarklet`) and in
// the browser (playground/bookmarklet.html), so it takes a read(path) function
// instead of touching the file system. Paths are relative to the repo root.

export const SOURCES = {
  util: 'playground/dev/util.js',
  live: 'playground/dev/live-panel.js',
  panelCss: 'playground/dev/panel.css',
  tokensCss: 'theme/assets/sdk-tokens.css',
};

const IMPORT_LINE = /^import\s+\{[^}]*\}\s+from\s+'\.\/[\w-]+\.js';$/;
const REEXPORT_LINE = /^export\s+\{[^}]*\}\s+from\s+'[^']+';$/;

/** Turns one of our ES modules into plain script: drops relative imports and `export` keywords. */
export function stripModule(source, name = 'module') {
  const lines = source.split('\n').filter((line) => !IMPORT_LINE.test(line) && !REEXPORT_LINE.test(line));
  const text = lines.join('\n').replace(/^export (?=(?:async )?function |const |let |class )/gm, '');
  const leftover = /^\s*(?:import|export)\b.*$/m.exec(text);
  if (leftover) throw new Error(`${name}: the bookmarklet bundler cannot handle "${leftover[0].trim()}"`);
  return text;
}

/** Drops comment-only lines, blank lines, and indentation. Line breaks stay, so ASI is unchanged. */
export function compactJs(source) {
  const out = [];
  let inComment = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (inComment) {
      if (line.includes('*/')) inComment = false;
      continue;
    }
    if (line.startsWith('/*')) {
      inComment = !line.includes('*/');
      continue;
    }
    if (!line || line.startsWith('//')) continue;
    out.push(line);
  }
  return out.join('\n');
}

/** Converts rem to px (16px per rem), so the panel keeps its size on sites that change the root font size. */
export function remToPx(css) {
  return css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${Math.round(Number(n) * 16 * 100) / 100}px`);
}

function declarationsIn(block) {
  const values = new Map();
  for (const [, name, value] of block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) values.set(name, value.trim());
  return values;
}

function blockAfter(css, opener) {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`sdk-tokens.css: "${opener}" not found`);
  const end = css.indexOf('}', start + opener.length);
  return css.slice(start + opener.length, end);
}

/**
 * The token values panel.css uses, set on :host for light and dark, so the
 * panel looks the same on a site that does not load the kit's tokens.
 */
export function hostTokenCss(tokensCss, panelCss) {
  const light = declarationsIn(blockAfter(tokensCss, ':root {'));
  const dark = declarationsIn(blockAfter(tokensCss, '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {'));
  const needed = new Set();
  const visit = (text) => {
    for (const [, name] of text.matchAll(/var\((--[\w-]+)/g)) {
      if (needed.has(name)) continue;
      if (!light.has(name)) throw new Error(`panel.css uses ${name}, which sdk-tokens.css does not define on :root`);
      needed.add(name);
      visit(light.get(name));
      if (dark.has(name)) visit(dark.get(name));
    }
  };
  visit(panelCss);
  const names = [...needed].sort();
  const lightLines = names.map((name) => `  ${name}: ${light.get(name)};`);
  const darkLines = names.filter((name) => dark.has(name)).map((name) => `    ${name}: ${dark.get(name)};`);
  return [':host {', ...lightLines, '}', '@media (prefers-color-scheme: dark) {', '  :host {', ...darkLines, '  }', '}'].join('\n');
}

/** Percent-encodes what a javascript: URL cannot carry as-is: %, #, quotes, whitespace other than spaces, and non-ASCII. */
export function toBookmarkletUrl(code) {
  return `javascript:${code.replace(/[%#"]|[^\x20-\x7e]/gu, (c) => encodeURIComponent(c))}`;
}

/** The live panel's stylesheet: panel.css plus the token values it needs, in px. Also used on local copies (client.js). */
export function livePanelCss(tokensCss, panelCss) {
  return remToPx(`${hostTokenCss(tokensCss, panelCss)}\n${panelCss}`);
}

/** Builds the bookmarklet. read(path) returns a source file's text. Returns { code, url }. */
export async function buildBookmarklet(read) {
  const [util, live, panelCss, tokensCss] = await Promise.all(
    [SOURCES.util, SOURCES.live, SOURCES.panelCss, SOURCES.tokensCss].map((path) => read(path)),
  );
  const css = livePanelCss(tokensCss, panelCss);
  const code = compactJs(
    ['(() => {', stripModule(util, SOURCES.util), stripModule(live, SOURCES.live), `toggleLivePanel(${JSON.stringify(css)});`, '})();'].join(
      '\n',
    ),
  );
  return { code, url: toBookmarkletUrl(code) };
}
