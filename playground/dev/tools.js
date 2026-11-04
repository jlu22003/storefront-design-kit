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

const PICK_ERROR = 'Pick a page under /playground/, /sketches/, or /lab/ on this server.';
const PICK_ERROR_NO_COPIES = 'Pick a page under /playground/ or /sketches/ on this server. Local copies (/lab/) open in the format frames.';

// Folders listed by the dev server under `dir`: your sketches, or local copies of sites.
async function folderPaths(dir) {
  try {
    const res = await fetch(dir);
    if (!res.ok) return [];
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    return [...doc.querySelectorAll('main li a')]
      .map((a) => a.getAttribute('href'))
      .filter((href) => href?.startsWith(dir) && href.endsWith('/'));
  } catch {
    return [];
  }
}

/**
 * Wires a page-picker form: fills its <datalist> with the starters, your
 * sketches, and (unless `copies: false`) local copies of sites, and keeps
 * ?src= in the address bar. Returns the current path.
 */
export function bindSourceForm(form, { copies = true } = {}) {
  const input = form.querySelector('input[name="src"]');
  const list = form.querySelector('datalist');
  const error = form.querySelector('[data-error]');
  const params = new URLSearchParams(location.search);
  const requested = params.get('src');
  const pickError = copies ? PICK_ERROR : PICK_ERROR_NO_COPIES;
  const src = framedPath(requested ?? DEFAULT_SRC, location.origin, { copies });
  input.value = src ?? requested;
  if (requested && !src) error.textContent = pickError;

  list.append(...STARTERS.map(([value, label]) => el('option', { value, label })));
  folderPaths('/sketches/').then((paths) => list.append(...paths.map((value) => el('option', { value, label: 'Sketch' }))));
  if (copies) folderPaths('/lab/copies/').then((paths) => list.append(...paths.map((value) => el('option', { value, label: 'Local copy' }))));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = framedPath(input.value, location.origin, { copies });
    if (!next) {
      error.textContent = pickError;
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
