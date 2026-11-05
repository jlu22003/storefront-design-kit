// Links from a catalog standard to its sources: its HIG pages and the WCAG 2.2
// success criteria it cites, for failure messages from tests and the coverage gate.

const WCAG = 'https://www.w3.org/TR/WCAG22/';

// WCAG 2.2 success criterion number -> its anchor in the Recommendation.
const WCAG_ANCHORS = {
  '1.1.1': 'non-text-content',
  '1.2.2': 'captions-prerecorded',
  '1.3.1': 'info-and-relationships',
  '1.3.2': 'meaningful-sequence',
  '1.3.3': 'sensory-characteristics',
  '1.3.4': 'orientation',
  '1.3.5': 'identify-input-purpose',
  '1.4.1': 'use-of-color',
  '1.4.2': 'audio-control',
  '1.4.3': 'contrast-minimum',
  '1.4.4': 'resize-text',
  '1.4.5': 'images-of-text',
  '1.4.6': 'contrast-enhanced',
  '1.4.10': 'reflow',
  '1.4.11': 'non-text-contrast',
  '1.4.12': 'text-spacing',
  '1.4.13': 'content-on-hover-or-focus',
  '2.1.1': 'keyboard',
  '2.1.2': 'no-keyboard-trap',
  '2.1.4': 'character-key-shortcuts',
  '2.2.1': 'timing-adjustable',
  '2.2.2': 'pause-stop-hide',
  '2.3.1': 'three-flashes-or-below-threshold',
  '2.3.3': 'animation-from-interactions',
  '2.4.1': 'bypass-blocks',
  '2.4.2': 'page-titled',
  '2.4.3': 'focus-order',
  '2.4.4': 'link-purpose-in-context',
  '2.4.6': 'headings-and-labels',
  '2.4.7': 'focus-visible',
  '2.4.8': 'location',
  '2.4.11': 'focus-not-obscured-minimum',
  '2.4.13': 'focus-appearance',
  '2.5.1': 'pointer-gestures',
  '2.5.3': 'label-in-name',
  '2.5.5': 'target-size-enhanced',
  '2.5.7': 'dragging-movements',
  '2.5.8': 'target-size-minimum',
  '3.1.1': 'language-of-page',
  '3.1.2': 'language-of-parts',
  '3.1.5': 'reading-level',
  '3.2.1': 'on-focus',
  '3.2.3': 'consistent-navigation',
  '3.2.4': 'consistent-identification',
  '3.3.1': 'error-identification',
  '3.3.2': 'labels-or-instructions',
  '3.3.3': 'error-suggestion',
  '3.3.4': 'error-prevention-legal-financial-data',
  '3.3.7': 'redundant-entry',
  '3.3.8': 'accessible-authentication-minimum',
  '4.1.2': 'name-role-value',
  '4.1.3': 'status-messages',
};

/** The URL of a WCAG 2.2 success criterion, or null when the number is not one this table knows. */
export const wcagUrl = (sc) => (WCAG_ANCHORS[sc] ? `${WCAG}#${WCAG_ANCHORS[sc]}` : null);

/** [{ label: "HIG", url }, { label: "WCAG 2.5.8", url }]: a standard's HIG pages, then its WCAG success criteria. */
export function standardSources(standard) {
  return [
    ...standard.hig.map((link) => ({ label: 'HIG', url: link.url })),
    ...standard.wcag.map((ref) => ({ label: `WCAG ${ref.sc}`, url: wcagUrl(ref.sc) ?? WCAG })),
  ];
}

/** ["HIG https://…/accessibility", "WCAG 2.5.8 https://www.w3.org/TR/WCAG22/#target-size-minimum"] for a standard. */
export function standardLinks(standard) {
  return standardSources(standard).map(({ label, url }) => `${label} ${url}`);
}
