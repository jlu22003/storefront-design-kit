// WCAG 2.2 contrast math for DTCG srgb colors ({ components: [r, g, b], alpha }).

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance of an opaque srgb color. */
export function luminance(color) {
  const [r, g, b] = color.components.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Composites `top` (which may be translucent) over an opaque `bottom`, in srgb. */
export function composite(top, bottom) {
  const alpha = top.alpha ?? 1;
  return {
    colorSpace: 'srgb',
    components: top.components.map((c, i) => c * alpha + bottom.components[i] * (1 - alpha)),
  };
}

/** WCAG contrast ratio between two opaque colors, from 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
