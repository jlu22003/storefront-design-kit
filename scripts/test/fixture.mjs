// A small valid catalog for unit tests. Each call returns a fresh copy, so a
// test can break one field without affecting the others.

const HIG = 'https://developer.apple.com/design/human-interface-guidelines/';

export function fixtureCatalog() {
  return {
    standards: {
      version: 1,
      sources: { hig: HIG, wcag: 'https://www.w3.org/TR/WCAG22/' },
      units: '1 HIG pt = 1 CSS px.',
      families: [
        { id: 'LAY', name: 'Layout and adaptivity' },
        { id: 'COL', name: 'Color' },
      ],
      standards: [
        {
          id: 'LAY-01',
          family: 'LAY',
          rule: 'Reading order matches visual order.',
          threshold: 'No `tabindex>0`',
          hig: [{ slug: 'layout', url: `${HIG}layout` }],
          wcag: [{ sc: '1.3.2', level: 'A' }],
          enforcement: ['automated'],
          liberties: [],
        },
        {
          id: 'LAY-02',
          family: 'LAY',
          rule: 'Align items to a shared grid (see LAY-01).',
          threshold: null,
          hig: [{ slug: 'layout', url: `${HIG}layout`, note: 'macOS' }],
          wcag: [],
          enforcement: ['visual', 'principle'],
          liberties: ['LIB-01'],
          note: 'A note.',
        },
        {
          id: 'COL-01',
          family: 'COL',
          rule: 'Text contrast meets the minimum | always.',
          threshold: '4.5:1 (LIB-01)',
          hig: [],
          wcag: [{ sc: '1.4.3', level: 'AA' }],
          enforcement: ['automated', 'principle'],
          automatedSeverity: 'warn',
          liberties: ['LIB-01'],
        },
      ],
    },
    liberties: {
      version: 1,
      liberties: [
        { id: 'LIB-01', title: 'pt → px.', detail: 'One point is one pixel.', rationale: 'Testable.' },
        { id: 'LIB-02', title: 'No detail here.', rationale: 'Short.', note: 'Revised.' },
      ],
    },
  };
}
