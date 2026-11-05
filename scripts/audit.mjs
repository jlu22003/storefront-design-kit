#!/usr/bin/env node
// Audits one web page against the kit's standards: `npm run audit -- <url>`.
//
//   npm run audit -- https://example.com/products/shirt [--viewport phone|desktop|both]
//                    [--out lab/audits] [--fail-on blocker|aa|none] [--json]
//
// Makes a frozen local copy of the page at each viewport (as `npm run lab:copy`
// does), runs the standards checks on the copy, and writes report.md,
// report.json, and screenshots to <out>/<host>-<stamp>/ (lab/ is gitignored).
// --out is relative to the current folder (default: the repo's lab/audits).
// --json prints report.json to stdout. Exits 1 when --fail-on finds an insight
// at or above that tier, and 2 when the audit could not run. Audit only sites
// you own or have permission to test.

import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { auditPage } from './lib/lab/audit.mjs';
import { FAIL_ON, TIERS } from './lib/lab/insights.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE = 'usage: npm run audit -- <url> [--viewport phone|desktop|both] [--out lab/audits] [--fail-on blocker|aa|none] [--json]';
const VIEWPORT_CHOICES = { desktop: ['desktop'], phone: ['phone'], both: ['desktop', 'phone'] };

/** Parses the command line; throws a message that ends with the usage line. */
export function parseAuditArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        viewport: { type: 'string', default: 'both' },
        out: { type: 'string' },
        'fail-on': { type: 'string', default: 'none' },
        json: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    throw new Error(`${error.message}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new Error(USAGE);
  const viewports = Object.hasOwn(VIEWPORT_CHOICES, values.viewport) ? VIEWPORT_CHOICES[values.viewport] : null;
  if (!viewports) throw new Error(`--viewport must be one of: ${Object.keys(VIEWPORT_CHOICES).join(', ')}.\n${USAGE}`);
  if (!Object.hasOwn(FAIL_ON, values['fail-on'])) throw new Error(`--fail-on must be one of: ${Object.keys(FAIL_ON).join(', ')}.\n${USAGE}`);
  return { url: positionals[0], viewports, outDir: values.out ? resolve(values.out) : resolve(ROOT, 'lab', 'audits'), failOn: values['fail-on'], json: values.json };
}

async function main() {
  const options = parseAuditArgs(process.argv.slice(2));
  // With --json, stdout carries only the report; progress goes to stderr.
  const say = options.json ? (line) => console.error(line) : (line) => console.log(line);
  const { dir, report, failed } = await auditPage(options.url, { ...options, log: say });

  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    say('');
    for (const tier of TIERS) {
      const insights = report.insights.filter((insight) => insight.tier === tier.id);
      say(`${tier.number} · ${tier.label}: ${insights.length} ${insights.length === 1 ? 'insight' : 'insights'}`);
      for (const insight of insights) say(`  ${insight.id ?? 'axe'}  ${insight.title}: ${insight.findings[0].sentence}`);
    }
    if (report.summary.info) say(`Plus ${report.summary.info} for information; see the report.`);
  }
  const where = relative(process.cwd(), dir) || '.';
  say(`\nReport: ${where}/report.md (and report.json, shots/, copies/)`);
  say('The checks ran on a frozen copy: menus, dialogs, and the cart were not exercised.');
  if (options.failOn !== 'none') say(`--fail-on ${options.failOn}: ${failed ? 'failed' : 'passed'}`);
  if (failed) process.exitCode = 1;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
