// The site audit behind `npm run audit`: copy a page (capture.mjs), run the
// standards checks on the copy (checks.mjs), and write prioritized insights
// (insights.mjs) as report.md and report.json, with screenshots.
//
// The checks run on the frozen local copy, never on the live site: the copy
// is served to the browser from disk through Playwright request routing, with
// the playground's lab Content-Security-Policy, and every other request is
// aborted. An audit folder holds:
//
//   <out>/<host>-<stamp>/
//     report.md, report.json
//     copies/<viewport>/   the copy that was checked (index.html, assets/, manifest.json)
//     shots/<viewport>.png, shots/<viewport>-full.png

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { LAB_CSP, TYPES } from '../../../playground/server.mjs';
import { copyName } from './assets.mjs';
import { VIEWPORTS, capturePage, launch } from './capture.mjs';
import { CHECKS, openForChecks, runChecks } from './checks.mjs';
import { INFO, TIERS, buildInsights, fails, summarize } from './insights.mjs';

/** The made-up origin a copy is served from during checks. Requests never leave the browser. */
export const COPY_ORIGIN = 'http://lab-copy.localhost';

/** What an audit of a frozen copy cannot tell you; report.md lists these. */
export const LIMITS = [
  'The checks ran on a frozen local copy with its scripts removed, so menus, drawers, dialogs, carousels, variant pickers, and the cart were not exercised. A live-site test comes after release.',
  'Animations are checked as CSS left them; anything a script would start is not seen.',
  'The kit-only checks (the data-theme override and screenshot baselines) do not apply to other sites; the screenshots stand in for them.',
];

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Answers requests for COPY_ORIGIN from the copy's folder, with the lab CSP; aborts everything else. */
async function serveCopy(context, dir) {
  const root = resolve(dir);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== COPY_ORIGIN) return route.abort('blockedbyclient');
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return route.fulfill({ status: 400, body: 'Bad path' });
    }
    const file = resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) return route.fulfill({ status: 404, body: 'Not found' });
    let body;
    try {
      body = await readFile(file);
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    return route.fulfill({
      status: 200,
      body,
      headers: {
        'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-security-policy': LAB_CSP,
        'cache-control': 'no-store',
      },
    });
  });
}

/**
 * Runs every check on the copy in `copyDir` at `viewport` ("desktop" or
 * "phone") and saves a first-screen and a full-page screenshot in `shotsDir`.
 * Resolves to { results, screenshots: { screen, full } } (absolute paths).
 */
export async function checkCopy(copyDir, { viewport = 'desktop', shotsDir, browser } = {}) {
  const device = Object.hasOwn(VIEWPORTS, viewport) ? VIEWPORTS[viewport] : null;
  if (!device) throw new Error(`Unknown viewport "${viewport}"; use ${Object.keys(VIEWPORTS).join(' or ')}.`);
  const ownBrowser = browser ?? (await launch());
  try {
    const context = await ownBrowser.newContext({ ...device, serviceWorkers: 'block' });
    try {
      await serveCopy(context, copyDir);
      const results = await runChecks(context, `${COPY_ORIGIN}/`);
      let screenshots = null;
      if (shotsDir) {
        await mkdir(shotsDir, { recursive: true });
        const page = await context.newPage();
        await openForChecks(page, `${COPY_ORIGIN}/`);
        screenshots = { screen: join(shotsDir, `${viewport}.png`), full: join(shotsDir, `${viewport}-full.png`) };
        await page.screenshot({ path: screenshots.screen, scale: 'css', animations: 'disabled' });
        await page.screenshot({ path: screenshots.full, fullPage: true, scale: 'css', animations: 'disabled' });
        await page.close();
      }
      return { results, screenshots };
    } finally {
      await context.close();
    }
  } finally {
    if (!browser) await ownBrowser.close();
  }
}

/** Every check that ran, with how many problems it found in each viewport. axe rules are one row. */
function checksRun(runs) {
  const rows = new Map();
  const row = (check, ids, label, level) => {
    if (!rows.has(check)) rows.set(check, { check, ids, label, level, viewports: {} });
    return rows.get(check);
  };
  for (const { viewport, results } of runs) {
    row('axe', [], 'axe-core: WCAG 2.2 A and AA rules and best practices (problems are elements, across all rules)', 'A/AA').viewports[viewport] ??= 0;
    for (const result of results) {
      const entry = result.axe ? rows.get('axe') : row(result.check, CHECKS[result.check].ids, CHECKS[result.check].label, CHECKS[result.check].level);
      entry.viewports[viewport] = (entry.viewports[viewport] ?? 0) + result.items.length;
    }
  }
  return [...rows.values()];
}

/**
 * Audits one page. Options: outDir (where audit folders go), viewports
 * (["desktop", "phone"] by default), failOn ("blocker", "aa", or "none"),
 * log (progress messages). Resolves to { dir, report, failed }.
 */
export async function auditPage(url, { outDir, viewports = ['desktop', 'phone'], failOn = 'none', now = new Date(), log = () => {}, captureOptions = {} } = {}) {
  if (!outDir) throw new Error('auditPage needs an outDir.');
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error(`Only http and https pages can be audited (got ${target.protocol}).`);
  if (!viewports.length) throw new Error('auditPage needs at least one viewport.');
  for (const viewport of viewports) if (!Object.hasOwn(VIEWPORTS, viewport)) throw new Error(`Unknown viewport "${viewport}"; use ${Object.keys(VIEWPORTS).join(' or ')}.`);
  fails([], failOn);

  await mkdir(outDir, { recursive: true });
  let name = copyName(url, now);
  for (let n = 2; await exists(join(outDir, name)); n += 1) name = `${copyName(url, now)}-${n}`;
  const dir = join(outDir, name);
  await mkdir(dir);

  const runs = [];
  try {
    for (const viewport of viewports) {
      log(`Copying ${url} at ${viewport} width…`);
      const copy = await capturePage(url, { ...captureOptions, copiesDir: join(dir, 'copies'), viewport, name: viewport, now });
      log(`Checking the ${viewport} copy…`);
      const { results, screenshots } = await checkCopy(copy.dir, { viewport, shotsDir: join(dir, 'shots') });
      runs.push({ viewport, height: VIEWPORTS[viewport].viewport.height, copy, results, screenshots });
    }
  } catch (error) {
    // A half-made audit is no use: remove the folder this run created.
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  const insights = buildInsights(runs);
  const local = (path) => relative(dir, path).split(sep).join('/');
  const report = {
    version: 1,
    url,
    title: runs[0].copy.manifest.title,
    auditedAt: now.toISOString(),
    failOn,
    failed: fails(insights, failOn),
    viewports: runs.map(({ viewport, copy, screenshots }) => ({
      name: viewport,
      width: copy.manifest.viewport.width,
      height: copy.manifest.viewport.height,
      copy: `${local(copy.dir)}/`,
      screenshots: { screen: local(screenshots.screen), full: local(screenshots.full) },
      files: { saved: copy.manifest.files.saved.length, failed: copy.manifest.files.failed.length, skipped: copy.manifest.files.skipped.length },
      removed: copy.manifest.removed,
    })),
    tiers: [...TIERS, INFO],
    summary: summarize(insights),
    insights,
    checks: checksRun(runs),
    limits: LIMITS,
  };
  await writeFile(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(dir, 'report.md'), renderMarkdown(report));
  return { dir, report, failed: report.failed };
}

// --------------------------------------------------------------- report.md

/** Escapes text from the audited page (or anywhere) for Markdown prose and table cells. */
export function escapeMarkdown(text) {
  return String(text)
    .replace(/[\\`*_[\]<>|#~]/g, (ch) => `\\${ch}`)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Inline code that survives backticks in the text. */
function code(text) {
  const value = String(text).replace(/\s+/g, ' ');
  const fence = value.includes('`') ? '``' : '`';
  return `${fence}${fence === '``' ? ' ' : ''}${value}${fence === '``' ? ' ' : ''}${fence}`;
}

const MAX_ITEMS_SHOWN = 5;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** The kit's own text in a table cell: only a pipe would break the row. */
const cell = (text) => String(text).replaceAll('|', '\\|');

const viewportCounts = (viewports) =>
  Object.entries(viewports)
    .map(([name, n]) => `${name} ${n}`)
    .join(', ');

/** A finding's items with the same selector and detail in several viewports become one line. */
function mergedItems(items) {
  const merged = new Map();
  for (const item of items) {
    const key = `${item.selector}\u0000${item.detail}`;
    if (merged.has(key)) merged.get(key).viewports.push(item.viewport);
    else merged.set(key, { selector: item.selector, detail: item.detail, viewports: [item.viewport] });
  }
  return [...merged.values()];
}

// The insight wording and catalog rule text are the kit's own Markdown; only text
// from the audited page (selectors, details, axe's messages, the title) is escaped.
function renderInsight(insight) {
  const lines = [`### ${insight.id ? `${insight.id} · ` : ''}${insight.title}`, ''];
  if (insight.rule) lines.push(`> ${insight.rule}`, '');
  for (const finding of insight.findings) {
    const rule = finding.axe ? ` [axe ${code(finding.axe.rule)}](${finding.axe.helpUrl})` : '';
    lines.push(`- **${escapeMarkdown(finding.sentence)}** (${viewportCounts(finding.viewports)}).${rule}`);
    const items = mergedItems(finding.items);
    for (const item of items.slice(0, MAX_ITEMS_SHOWN)) {
      lines.push(`  - ${code(item.selector)}${item.detail ? `: ${escapeMarkdown(item.detail)}` : ''} (${item.viewports.join(', ')})`);
    }
    if (items.length > MAX_ITEMS_SHOWN) lines.push(`  - …and ${items.length - MAX_ITEMS_SHOWN} more in report.json`);
  }
  lines.push('', `**Why it matters:** ${insight.why}`, '', `**How to fix it:** ${insight.fix}`);
  if (insight.links.length) lines.push('', `**Standards:** ${insight.links.map((link) => `[${insight.ids.length > 1 ? `${link.id} ` : ''}${link.label}](${link.url})`).join(' · ')}`);
  lines.push('');
  return lines.join('\n');
}

/** report.md: the summary, then each tier's insights, then what was checked and what an audit of a copy cannot see. */
export function renderMarkdown(report) {
  const lines = [
    `# Site audit: ${escapeMarkdown(report.title || report.url)}`,
    '',
    `${escapeMarkdown(report.url)} · ${report.auditedAt} · ${report.viewports.map((viewport) => `${viewport.name} ${viewport.width}×${viewport.height}`).join(', ')}`,
    '',
    'Checked on a frozen local copy (scripts removed) against the kit standards in catalog/STANDARDS.md.',
    '',
    '## Summary',
    '',
    '| Tier | Insights | What it covers |',
    '|---|---|---|',
    ...TIERS.map((tier) => `| ${tier.number} · ${tier.label} | ${report.summary[tier.id]} | ${cell(tier.description)} |`),
    `| ${INFO.label} | ${report.summary.info} | ${cell(INFO.description)} |`,
    '',
  ];
  if (report.failOn !== 'none') lines.push(`\`--fail-on ${report.failOn}\`: ${report.failed ? '**failed**' : 'passed'}.`, '');

  for (const tier of [...TIERS, INFO]) {
    const insights = report.insights.filter((insight) => insight.tier === tier.id);
    if (!insights.length) continue;
    lines.push(`## ${tier.number ? `${tier.number} · ` : ''}${tier.label}`, '', tier.description, '');
    for (const insight of insights) lines.push(renderInsight(insight));
  }
  if (!report.insights.length) lines.push('No problems found.', '');

  const names = report.viewports.map((viewport) => viewport.name);
  lines.push(
    '## Checks run',
    '',
    `| Check | Standards | Level | ${names.join(' | ')} |`,
    `|---|---|---|${names.map(() => '---|').join('')}`,
    ...report.checks.map(
      (row) =>
        `| ${cell(row.label)} | ${row.ids.join(', ') || 'mapped per rule'} | ${row.level} | ${names
          .map((name) => (row.viewports[name] === undefined ? 'n/a' : row.viewports[name] === 0 ? 'pass' : `${row.viewports[name]} found`))
          .join(' | ')} |`,
    ),
    '',
    '## What this audit cannot see',
    '',
    ...report.limits.map((limit) => `- ${limit}`),
    '',
    '## Files',
    '',
    ...report.viewports.flatMap((viewport) => [
      `- **${viewport.name}:** the copy in [${viewport.copy}](${viewport.copy}) (${plural(viewport.files.saved, 'file')} saved, ${viewport.files.failed + viewport.files.skipped} not; see its manifest.json), screenshots [first screen](${viewport.screenshots.screen}) and [full page](${viewport.screenshots.full}).`,
    ]),
    '- **report.json** holds every finding with its selector and position on the page.',
    '',
  );
  return lines.join('\n');
}
