// Renders catalog/STANDARDS.md and catalog/LIBERTIES.md from the catalog
// data. Output is deterministic so a check mode can compare it byte for byte.

import { ENFORCEMENT_LABELS, hasLabel } from './catalog.mjs';

const GENERATED = (source) =>
  `<!-- Generated from catalog/${source} by scripts/catalog-docs.mjs. Do not edit by hand: change the JSON and run \`npm run catalog:docs\`. -->`;

/** Escapes text for a GitHub-flavoured Markdown table cell. */
export const cell = (text) => String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

/** The anchor GitHub generates for a heading. */
export const headingAnchor = (heading) =>
  heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
].join('\n');

const familyHeading = (family) => `${family.name} (${family.id})`;

const enforcementText = (standard) =>
  standard.enforcement.map((label) => {
    if (label !== 'automated') return label;
    const qualifiers = [standard.automatedSeverity, standard.automatedScope].filter(Boolean);
    return qualifiers.length ? `${label} (${qualifiers.join(', ')})` : label;
  }).join(', ');

const higText = (standard) =>
  standard.hig.length === 0
    ? '—'
    : standard.hig.map((link) => `[${link.slug}](${link.url})${link.note ? ` (${link.note})` : ''}`).join(', ');

const wcagText = (standard) =>
  standard.wcag.length === 0 ? '—' : standard.wcag.map((ref) => `${ref.sc} (${ref.level})`).join(', ');

const libertyLinks = (ids) => (ids.length === 0 ? '—' : ids.map((id) => `[${id}](LIBERTIES.md)`).join(', '));

const countLabels = (standards) =>
  Object.fromEntries(ENFORCEMENT_LABELS.map((label) => [label, standards.filter((s) => hasLabel(s, label)).length]));

export function renderStandards({ standards: doc, liberties: libDoc }) {
  const { families, standards } = doc;
  const totals = countLabels(standards);
  const lines = [
    GENERATED('standards.json'),
    '',
    '# Standards catalog',
    '',
    `${standards.length} standards in ${families.length} families for responsive storefront layouts.`,
    'Each rule is a web adaptation written in our own words and informed by Apple\'s Human Interface Guidelines (HIG); no HIG text is copied.',
    `Departures from the HIG are listed in [LIBERTIES.md](LIBERTIES.md) (${libDoc.liberties.length} liberties).`,
    '',
    '## Legend',
    '',
    '- **Enforcement**: *automated* means a test or lint can fail the build; *visual* means a screenshot-regression diff flags it for review; *principle* means a design-review checklist item. A standard can carry more than one label.',
    '- *automated (warn)* reports a warning but does not fail the build. *automated (partial)* means automation covers only part of the rule; review covers the rest.',
    `- **HIG** links point to pages under ${doc.sources.hig}.`,
    `- **WCAG** lists WCAG 2.2 success criteria (${doc.sources.wcag}) with their conformance level.`,
    `- **Units**: ${doc.units}`,
    '- References such as "§3.1" point to sections of the research report the catalog was built from.',
    '',
    '## Summary',
    '',
    table(
      ['Family', 'Standards', ...ENFORCEMENT_LABELS.map((label) => label[0].toUpperCase() + label.slice(1))],
      [
        ...families.map((family) => {
          const members = standards.filter((s) => s.family === family.id);
          const counts = countLabels(members);
          return [`[${familyHeading(family)}](#${headingAnchor(familyHeading(family))})`, members.length, ...ENFORCEMENT_LABELS.map((l) => counts[l])];
        }),
        ['**Total**', `**${standards.length}**`, ...ENFORCEMENT_LABELS.map((l) => `**${totals[l]}**`)],
      ],
    ),
  ];

  for (const family of families) {
    const members = standards.filter((s) => s.family === family.id);
    lines.push('', `## ${familyHeading(family)}`, '', table(
      ['ID', 'Rule (web)', 'Threshold', 'HIG', 'WCAG 2.2', 'Enforcement', 'Liberties'],
      members.map((s) => [
        `**${s.id}**`, s.rule, s.threshold ?? '—', higText(s), wcagText(s), enforcementText(s), libertyLinks(s.liberties),
      ]),
    ));
    const notes = members.filter((s) => s.note);
    if (notes.length) {
      lines.push('', 'Notes:', '', ...notes.map((s) => `- **${s.id}**: ${s.note}`));
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderLiberties({ standards: doc, liberties: libDoc }) {
  const familyById = new Map(doc.families.map((family) => [family.id, family]));
  const standardLink = (standard) => {
    const heading = familyHeading(familyById.get(standard.family));
    return `[${standard.id}](STANDARDS.md#${headingAnchor(heading)})`;
  };
  const lines = [
    GENERATED('liberties.json'),
    '',
    '# Notable liberties',
    '',
    `${libDoc.liberties.length} places where the kit departs from, reinterprets, or extends Apple's Human Interface Guidelines for the web.`,
    'The Standards column lists the catalog entries in [STANDARDS.md](STANDARDS.md) that cite each liberty.',
    '',
    table(
      ['ID', 'Liberty', 'Why', 'Standards'],
      libDoc.liberties.map((liberty) => {
        const citing = doc.standards.filter((s) => s.liberties.includes(liberty.id));
        return [
          `**${liberty.id}**`,
          liberty.detail ? `**${liberty.title}** ${liberty.detail}` : `**${liberty.title}**`,
          liberty.rationale,
          citing.length ? citing.map(standardLink).join(', ') : '—',
        ];
      }),
    ),
  ];
  const notes = libDoc.liberties.filter((l) => l.note);
  if (notes.length) {
    lines.push('', 'Notes:', '', ...notes.map((l) => `- **${l.id}**: ${l.note}`));
  }
  return `${lines.join('\n')}\n`;
}

/** Every generated document, keyed by its path relative to the catalog directory. */
export const renderAll = (catalog) => ({
  'STANDARDS.md': renderStandards(catalog),
  'LIBERTIES.md': renderLiberties(catalog),
});
