// Pure helpers for the format frames and variant board pages: the formats,
// which pages may be framed, how far to scale a frame, and how to rewrite
// media queries so a frame shows a page's print styles. No DOM access at the
// top level, so Node tests can import it.

/** Every format frames.html renders. Sizes are CSS pixels (96 per inch). */
export const FORMATS = [
  { id: 'phone', label: 'Phone', width: 390, height: 844 },
  { id: 'tablet', label: 'Tablet', width: 820, height: 1180 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
  { id: 'square', label: 'Social post, square', width: 1080, height: 1080 },
  { id: 'story', label: 'Story, 9:16', width: 1080, height: 1920 },
  { id: 'email', label: 'Email width', width: 600, height: 1200 },
  { id: 'print', label: 'Print page, US Letter', width: 816, height: 1056, print: true },
];

/** Viewport widths a variant board can render its copies at. */
export const BOARD_WIDTHS = [
  { id: 'phone', label: 'Phone (390px)', width: 390 },
  { id: 'tablet', label: 'Tablet (820px)', width: 820 },
  { id: 'desktop', label: 'Desktop (1280px)', width: 1280 },
];

export const DEFAULT_SRC = '/playground/starters/landing.html';

// Pages that host frames themselves, so framing them would nest forever.
const HOSTS = new Set(['/playground/frames.html', '/playground/variants.html']);

/**
 * Returns the path to frame for a user-entered page, or null when it is not a
 * playground page, sketch, or local copy (/lab/) on this origin. With
 * `copies: false`, local copies are refused too. Accepts "/sketches/x/",
 * "sketches/x", or a full localhost URL from the address bar.
 */
export function framedPath(input, origin, { copies = true } = {}) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `/${text}`, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  const path = url.pathname;
  const roots = copies ? /^\/(playground|sketches|lab)\// : /^\/(playground|sketches)\//;
  if (!roots.test(path) || path.split('/').some((part) => part === '..')) return null;
  if (HOSTS.has(path) || path.startsWith('/playground/dev/')) return null;
  return `${path}${url.search}${url.hash}`;
}

/**
 * The scale that fits a width × height frame inside `maxHeight` (and
 * `maxWidth`, when given), never enlarging it.
 */
export function fitScale({ width, height }, { maxHeight, maxWidth = Infinity }) {
  const scale = Math.min(1, maxHeight / height, maxWidth / width);
  return Math.max(0, Math.round(scale * 1000) / 1000);
}

/**
 * The frame height at which every format fits side by side in one row of
 * `width` pixels, with `gap` pixels between frames.
 */
export function rowFitHeight(formats, { width, gap = 0 }) {
  const aspect = formats.reduce((sum, f) => sum + f.width / f.height, 0);
  if (!aspect) return 0;
  return Math.max(0, Math.floor((width - gap * (formats.length - 1)) / aspect));
}

/**
 * Rewrites a media query list so it matches when the page is shown on screen
 * the way it would print: print queries become "all", screen and speech
 * queries never match, and queries without a media type are kept.
 */
export function printMediaText(mediaText) {
  const queries = String(mediaText)
    .split(',')
    .map((query) => query.trim())
    .filter(Boolean);
  if (!queries.length) return mediaText;
  return queries
    .map((query) => {
      const match = /^(only\s+|not\s+)?(print|screen|all|speech)\b(.*)$/i.exec(query);
      if (!match) return query;
      const [, prefix = '', type, rest] = match;
      const negated = prefix.trim().toLowerCase() === 'not';
      const kind = type.toLowerCase();
      if (kind === 'all') return query;
      // While printing, "not print and (…)" is "not all and (…)", and "not screen and (…)" always matches.
      if (kind === 'print') return `${negated ? 'not ' : ''}all${rest}`;
      return negated ? 'all' : 'not all';
    })
    .join(', ');
}
