// `npm run audit` (scripts/audit.mjs, scripts/lib/lab/audit.mjs): report.md
// and the command line. The browser side is covered by
// tests/e2e/lab-audit.spec.mjs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { parseAuditArgs } from '../../scripts/audit.mjs';
import { escapeMarkdown, renderMarkdown } from '../../scripts/lib/lab/audit.mjs';
import { CHECKS } from '../../scripts/lib/lab/checks.mjs';
import { buildInsights, loadInsightData, summarize } from '../../scripts/lib/lab/insights.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const { wording, standards } = loadInsightData();
const result = (check, items) => ({ check, ids: [...CHECKS[check].ids], items });

describe('report.md', () => {
  const insights = buildInsights(
    [{ viewport: 'desktop', height: 720, results: [result('text-size', [{ selector: '#a', detail: 'p "<b>*hi*</b> | `x`" at 9px', rect: null }])] }],
    { wording, standards },
  );
  const report = {
    url: 'https://shop.example/',
    title: 'Shop | <Home>',
    auditedAt: '2026-11-04T12:00:00.000Z',
    failOn: 'blocker',
    failed: false,
    viewports: [{ name: 'desktop', width: 1280, height: 720, copy: 'copies/desktop/', screenshots: { screen: 'shots/desktop.png', full: 'shots/desktop-full.png' }, files: { saved: 1, failed: 0, skipped: 0 } }],
    summary: summarize(insights),
    insights,
    checks: [{ check: 'text-size', ids: ['TYP-01'], label: 'text under 11px', level: 'kit', viewports: { desktop: 1 } }],
    limits: ['A limit.'],
  };
  const markdown = renderMarkdown(report);

  test('lists the tiers, each insight with its wording and links, and the checks run', () => {
    assert.match(markdown, /^# Site audit: Shop \\\| \\<Home\\>$/m);
    assert.match(markdown, /^\| 3 · Kit polish \| 1 \|/m);
    assert.match(markdown, /^## 3 · Kit polish$/m);
    assert.match(markdown, /^### TYP-01 · Some text is too small$/m);
    assert.ok(markdown.includes(`**How to fix it:** ${wording.standards['TYP-01'].fix}`));
    assert.match(markdown, /\[WCAG|\[HIG\]\(https:\/\/developer\.apple\.com/);
    assert.match(markdown, /^\| text under 11px \| TYP-01 \| kit \| 1 found \|$/m);
    assert.match(markdown, /^`--fail-on blocker`: passed\.$/m);
    assert.match(markdown, /1 file saved, 0 not/);
  });

  test('escapes what came from the page', () => {
    assert.ok(markdown.includes('`#a`: p "\\<b\\>\\*hi\\*\\</b\\> \\| \\`x\\`" at 9px (desktop)'), markdown);
    assert.equal(escapeMarkdown('a\n  b'), 'a b');
  });
});

describe('npm run audit arguments', () => {
  test('defaults: both viewports, lab/audits, --fail-on none', () => {
    const options = parseAuditArgs(['https://shop.example/']);
    assert.deepEqual(options, { url: 'https://shop.example/', viewports: ['desktop', 'phone'], outDir: resolve(ROOT, 'lab', 'audits'), failOn: 'none', json: false });
  });

  test('flags', () => {
    const options = parseAuditArgs(['https://shop.example/', '--viewport', 'phone', '--out', 'somewhere', '--fail-on', 'aa', '--json']);
    assert.deepEqual(options.viewports, ['phone']);
    assert.equal(options.outDir, resolve('somewhere'));
    assert.equal(options.failOn, 'aa');
    assert.equal(options.json, true);
  });

  test('bad input explains the usage', () => {
    assert.throws(() => parseAuditArgs([]), /usage: npm run audit/);
    assert.throws(() => parseAuditArgs(['a', 'b']), /usage: npm run audit/);
    assert.throws(() => parseAuditArgs(['https://x.example/', '--viewport', 'tablet']), /--viewport must be one of: desktop, phone, both/);
    assert.throws(() => parseAuditArgs(['https://x.example/', '--viewport', 'constructor']), /--viewport must be one of/);
    assert.throws(() => parseAuditArgs(['https://x.example/', '--fail-on', 'all']), /--fail-on must be one of: blocker, aa, none/);
    assert.throws(() => parseAuditArgs(['https://x.example/', '--colour']), /Unknown option '--colour'[\s\S]*usage/);
  });

  test('package.json runs it as npm run audit', () => {
    assert.equal(JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).scripts.audit, 'node scripts/audit.mjs');
  });
});
