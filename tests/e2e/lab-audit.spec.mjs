// Site audits (`npm run audit`, scripts/lib/lab/audit.mjs), run in the `lab`
// project. Audits fixture pages served on localhost (never a real site): one
// with a known set of problems, one with none. The audit must copy the page,
// sort what the checks find into the right tiers, write report.md,
// report.json, and screenshots, set the exit code from --fail-on, and run its
// checks without contacting the site.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { checkCopy } from '../../scripts/lib/lab/audit.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

/** Problems on purpose, each with an id the test can find in the report. */
const PROBLEMS_PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit fixture</title>
<style>
  body { margin: 0; font-family: sans-serif; color: #111; background: #fff; }
  #faint { color: #b0b0b0; }
  #tiny, .badge { font-size: 9px; }
  #serif { font-family: serif; }
  #cursive { font-family: cursive; }
  #wide { inline-size: 600px; block-size: 10px; background: #ddd; }
  #wide > div { block-size: 10px; }
  #tiny-button { inline-size: 20px; block-size: 20px; padding: 0; border: 0; }
  #small-button { inline-size: 30px; block-size: 30px; padding: 0; border: 0; }
  @keyframes spin { to { transform: rotate(1turn); } }
  #spinner { animation: spin 2s linear infinite; inline-size: 16px; block-size: 16px; background: #333; }
</style>
</head>
<body>
<main>
<h1>Audit fixture</h1>
<p id="faint">Faint text that fails contrast.</p>
<p id="tiny">Tiny print.</p>
<p><span class="badge">Sale</span> <span class="badge">Sale</span></p>
<p id="serif">A serif paragraph.</p>
<p id="cursive">A cursive paragraph.</p>
<img id="no-alt" src="/photo.svg" width="40" height="40">
<img id="broken" src="/missing.png" alt="">
<div id="wide"><div></div></div>
<div id="spinner"></div>
<label for="email">Email</label> <input id="email" type="email">
<button id="tiny-button" type="button" aria-label="Close">×</button>
<button id="small-button" type="button" aria-label="Menu">≡</button>
<a id="jumps" href="#top" tabindex="2">Jumps the queue</a>
</main>
</body>
</html>
`;

/** Nothing for the checks to find. */
const CLEAN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clean fixture</title>
<style>
  body { margin: 0; font-family: sans-serif; font-size: 1rem; color: #111; background: #fff; }
  main { padding: 1rem; }
  a { display: inline-block; min-block-size: 44px; min-inline-size: 44px; line-height: 44px; color: #0040a0; }
  a:focus-visible { outline: 2px solid #111; outline-offset: 2px; }
</style>
</head>
<body>
<main>
<h1>Clean fixture</h1>
<p>Plain, readable text.</p>
<a href="#more">More</a>
</main>
</body>
</html>
`;

const FILES = {
  '/problems/': ['text/html', PROBLEMS_PAGE],
  '/clean/': ['text/html', CLEAN_PAGE],
  '/photo.svg': ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#5856d6"/></svg>'],
};

const hits = [];
const server = createServer((req, res) => {
  hits.push(req.url);
  const file = FILES[new URL(req.url, 'http://fixture').pathname];
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': file[0], 'cache-control': 'no-store' }).end(file[1]);
});

let origin = '';
let out = '';

/** Runs `npm run audit` (scripts/audit.mjs) and resolves to { code, stdout, stderr }. */
function audit(...args) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'audit.mjs'), ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout, stderr }));
  });
}

const isPng = async (path) => (await readFile(path)).subarray(1, 4).toString() === 'PNG';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.beforeAll(async () => {
  origin = await new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`)));
  out = await mkdtemp(join(tmpdir(), 'sdk-lab-audit-'));
});

test.afterAll(async () => {
  await new Promise((done) => server.close(() => done()));
  await rm(out, { recursive: true, force: true });
});

let report;
let dir;

test('audits a page at both widths and sorts what it finds into tiers', async () => {
  const run = await audit(`${origin}/problems/`, '--out', out, '--fail-on', 'blocker', '--json');
  expect(run.code, run.stderr).toBe(1);
  report = JSON.parse(run.stdout);
  const folders = await readdir(out);
  expect(folders).toHaveLength(1);
  dir = join(out, folders[0]);
  expect(report.failed).toBe(true);
  expect(report.viewports.map((viewport) => viewport.name)).toEqual(['desktop', 'phone']);
  expect(report.title).toBe('Audit fixture');

  const find = (tier, id, check) =>
    report.insights.find((insight) => insight.tier === tier && insight.id === id && (!check || insight.findings.some((finding) => finding.check === check)));
  for (const [tier, id, check] of [
    ['blocker', 'ACC-16', 'axe:html-has-lang'],
    ['blocker', 'ACC-04', 'axe:image-alt'],
    ['blocker', 'COL-01', 'axe:color-contrast'],
    ['blocker', 'ACC-10', 'positive-tabindex'],
    ['blocker', 'MOT-07', 'long-animation'],
    ['aa', 'FRM-02', 'autocomplete'],
    ['aa', 'ACC-01', 'target-size-minimum'],
    ['aa', 'LAY-06', 'reflow-320'],
    ['aa', 'LAY-05', 'reflow'],
    ['polish', 'ACC-01', 'target-size'],
    ['polish', 'TYP-01', 'text-size'],
    ['polish', 'TYP-06', 'font-families'],
    ['polish', 'MOT-02', 'reduced-motion'],
    ['info', 'ACC-18', 'contrast-more'],
  ]) {
    expect(find(tier, id, check), `${tier} ${id} ${check}`).toBeTruthy();
  }

  // The 600px strip fits a 1280px desktop but not a 412px phone; its contents are not counted again.
  const sideways = find('aa', 'LAY-05').findings[0];
  expect(Object.keys(sideways.viewports)).toEqual(['phone']);
  expect(sideways.items.map((item) => item.selector)).toEqual(['#wide']);
  expect(sideways.count).toBe(1);
  // Items carry a selector that finds the element again, and where it is.
  const tiny = find('polish', 'TYP-01').findings[0];
  expect(tiny.items[0]).toMatchObject({ viewport: 'desktop', selector: '#tiny', detail: 'p#tiny "Tiny print." at 9px', rect: { width: expect.any(Number) } });
  // Two badges that look the same are still two elements.
  expect(tiny.sentence).toBe('3 pieces of text are under 11px');
  expect(find('polish', 'ACC-01').findings[0].items.map((item) => item.selector)).toContain('#small-button');
  expect(find('aa', 'ACC-01').findings[0].items.map((item) => item.selector)).toContain('#tiny-button');

  // Tiers come in order, and each insight carries its wording and catalog links.
  const order = ['blocker', 'aa', 'polish', 'info'];
  const tiers = report.insights.map((insight) => order.indexOf(insight.tier));
  expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  const contrast = find('blocker', 'COL-01');
  expect(contrast.title).toBe('Text contrast is too low');
  expect(contrast.links).toContainEqual({ id: 'COL-01', label: 'WCAG 1.4.3', url: 'https://www.w3.org/TR/WCAG22/#contrast-minimum' });
  expect(report.summary.blocker).toBeGreaterThanOrEqual(5);
});

test('writes report.md, report.json, the copies, and screenshots', async () => {
  expect(JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'))).toEqual(report);
  const markdown = await readFile(join(dir, 'report.md'), 'utf8');
  expect(markdown).toContain('# Site audit: Audit fixture');
  expect(markdown).toContain('## 1 · Blocks people');
  expect(markdown).toContain('### COL-01 · Text contrast is too low');
  expect(markdown).toContain('`#tiny`');
  expect(markdown).toContain('`--fail-on blocker`: **failed**.');
  for (const viewport of report.viewports) {
    expect(await isPng(join(dir, viewport.screenshots.screen))).toBe(true);
    expect(await isPng(join(dir, viewport.screenshots.full))).toBe(true);
    expect((await stat(join(dir, viewport.copy, 'index.html'))).isFile()).toBe(true);
    // The copy holds no scripts and keeps the 404 image pointing at the site.
    const html = await readFile(join(dir, viewport.copy, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain(`src="${origin}/missing.png"`);
  }
});

test('checks run on the copy and never contact the site', async () => {
  const before = hits.length;
  const { results } = await checkCopy(join(dir, report.viewports[0].copy), { viewport: 'desktop' });
  expect(results.find((result) => result.check === 'text-size').items.map((item) => item.selector)).toEqual([
    '#tiny',
    'body > main > p:nth-of-type(3) > span:nth-of-type(1)',
    'body > main > p:nth-of-type(3) > span:nth-of-type(2)',
  ]);
  expect(hits.length).toBe(before);
});

test('a clean page passes --fail-on aa with nothing to report', async () => {
  const run = await audit(`${origin}/clean/`, '--viewport', 'desktop', '--out', out, '--fail-on', 'aa');
  expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(0);
  expect(run.stdout).toContain('1 · Blocks people: 0 insights');
  expect(run.stdout).toContain('--fail-on aa: passed');
});

test('bad input exits 2 with a message and leaves no audit folder', async () => {
  const before = (await readdir(out)).length;
  const missing = await audit(`${origin}/nowhere/`, '--viewport', 'desktop', '--out', out);
  expect(missing.code).toBe(2);
  expect(missing.stderr).toContain('HTTP 404');
  const usage = await audit(`${origin}/clean/`, '--fail-on', 'everything');
  expect(usage.code).toBe(2);
  expect(usage.stderr).toContain('--fail-on must be one of: blocker, aa, none.');
  expect((await readdir(out)).length).toBe(before);
});
