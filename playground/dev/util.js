// Small helpers shared by the design panel (panel.js) and the live-site panel
// (live-panel.js, bundled into the bookmarklet). Keep this file free of
// top-level DOM access so Node tests can import it, and free of multi-line
// template literals so the bookmarklet build can compact it line by line.

export const round = (n) => Math.round(n * 10000) / 10000;

/** Multiplies every length in a token value: "1rem" → "1.25rem", clamp(…) included. */
export function scaleValue(value, factor) {
  return value.replace(/(-?\d*\.?\d+)(rem|px|em|vw|vh|svh|ch)\b/g, (_, n, unit) => `${round(Number(n) * factor)}${unit}`);
}

/** Returns "#rrggbb" for a #rgb or #rrggbb value, or null for anything else. */
export function normalizeHex(value) {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio between two #rrggbb colors. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Creates an element: el('p', { class: 'hint', text: 'Hi' }, [children]). */
export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'text') node.textContent = value;
    else if (value !== false && value !== undefined) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children);
  return node;
}
