// Page helpers shared by frames.html and variants.html: the page picker and
// copying text to the clipboard.

import { DEFAULT_SRC, framedPath } from './formats.js';
import { el } from './util.js';

const STARTERS = [
  ['/playground/starters/landing.html', 'Landing starter'],
  ['/playground/starters/product.html', 'Product starter'],
  ['/playground/starters/collection.html', 'Collection starter'],
  ['/playground/primitives.html', 'Layout primitives'],
];

// Sketch folders, read from the dev server's /sketches/ listing.
async function sketchPaths() {
  try {
    const res = await fetch('/sketches/');
    if (!res.ok) return [];
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    return [...doc.querySelectorAll('main li a')]
      .map((a) => a.getAttribute('href'))
      .filter((href) => href?.startsWith('/sketches/') && href.endsWith('/'));
  } catch {
    return [];
  }
}

/**
 * Wires a page-picker form: fills its <datalist> with the starters and your
 * sketches, and keeps ?src= in the address bar. Returns the current path.
 */
export function bindSourceForm(form) {
  const input = form.querySelector('input[name="src"]');
  const list = form.querySelector('datalist');
  const error = form.querySelector('[data-error]');
  const params = new URLSearchParams(location.search);
  const requested = params.get('src');
  const src = framedPath(requested ?? DEFAULT_SRC, location.origin);
  input.value = src ?? requested;
  if (requested && !src) {
    error.textContent = 'Pick a page under /playground/ or /sketches/ on this server.';
  }

  list.append(...STARTERS.map(([value, label]) => el('option', { value, label })));
  sketchPaths().then((paths) => list.append(...paths.map((value) => el('option', { value, label: 'Sketch' }))));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = framedPath(input.value, location.origin);
    if (!next) {
      error.textContent = 'Pick a page under /playground/ or /sketches/ on this server.';
      input.focus();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('src', next);
    location.assign(url);
  });
  return src;
}

/** Copies text; when the clipboard is blocked, shows it in `fallback` (a <pre>) selected. */
export async function copyText(text, { status, fallback }) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied.';
    if (fallback) fallback.hidden = true;
  } catch {
    if (!fallback) {
      status.textContent = 'Clipboard unavailable.';
      return;
    }
    fallback.textContent = text;
    fallback.hidden = false;
    const range = document.createRange();
    range.selectNodeContents(fallback);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    fallback.focus();
    status.textContent = 'Clipboard unavailable: the text is selected below, press Ctrl+C or Cmd+C.';
  }
}
