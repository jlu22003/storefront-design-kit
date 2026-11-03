import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { promisify } from 'node:util';
import { loadCatalog } from '../lib/catalog.mjs';
import { CATALOG_DIR, catalogDocs } from '../lib/docs.mjs';
import { cell, headingAnchor, renderAll, renderLiberties, renderStandards } from '../lib/render.mjs';
import { fixtureCatalog } from './fixture.mjs';

const run = promisify(execFile);
const CLI = join(import.meta.dirname, '..', 'catalog-docs.mjs');

describe('helpers', () => {
  test('cell escapes pipes and flattens newlines', () => {
    assert.equal(cell('a | b\nc'), 'a \\| b c');
  });

  test('headingAnchor matches GitHub heading anchors', () => {
    assert.equal(headingAnchor('Layout and adaptivity (LAY)'), 'layout-and-adaptivity-lay');
    assert.equal(headingAnchor('Modals, sheets, popovers, alerts (MOD)'), 'modals-sheets-popovers-alerts-mod');
  });
});

describe('renderStandards', () => {
  const md = renderStandards(fixtureCatalog());

  test('starts with the generated-file banner', () => {
    assert.match(md.split('\n')[0], /^<!-- Generated from catalog\/standards\.json/);
  });

  test('summarises counts per family and in total', () => {
    assert.match(md, /\| \[Layout and adaptivity \(LAY\)\]\(#layout-and-adaptivity-lay\) \| 2 \| 1 \| 1 \| 1 \|/);
    assert.match(md, /\| \*\*Total\*\* \| \*\*3\*\* \| \*\*2\*\* \| \*\*1\*\* \| \*\*2\*\* \|/);
  });

  test('renders each standard as a table row', () => {
    assert.ok(md.includes('| **LAY-01** | Reading order matches visual order. | No `tabindex>0` | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) | 1.3.2 (A) | automated | — |'));
    assert.ok(md.includes('| **LAY-02** | Align items to a shared grid (see LAY-01). | — | [layout](https://developer.apple.com/design/human-interface-guidelines/layout) (macOS) | — | visual, principle | [LIB-01](LIBERTIES.md) |'));
  });

  test('escapes pipes and shows enforcement qualifiers', () => {
    assert.ok(md.includes('| **COL-01** | Text contrast meets the minimum \\| always. | 4.5:1 (LIB-01) | — | 1.4.3 (AA) | automated (warn), principle | [LIB-01](LIBERTIES.md) |'));
  });

  test('lists notes under the family table', () => {
    assert.match(md, /Notes:\n\n- \*\*LAY-02\*\*: A note\./);
  });

  test('ends with exactly one newline', () => {
    assert.ok(md.endsWith('|\n') && !md.endsWith('\n\n'));
  });
});

describe('renderLiberties', () => {
  const md = renderLiberties(fixtureCatalog());

  test('links each liberty back to the standards that cite it', () => {
    assert.ok(md.includes('| **LIB-01** | **pt → px.** One point is one pixel. | Testable. | [LAY-02](STANDARDS.md#layout-and-adaptivity-lay), [COL-01](STANDARDS.md#color-col) |'));
  });

  test('handles a liberty with no detail and no citing standards', () => {
    assert.ok(md.includes('| **LIB-02** | **No detail here.** | Short. | — |'));
    assert.match(md, /- \*\*LIB-02\*\*: Revised\./);
  });
});

describe('catalogDocs', () => {
  let dir;
  const writeCatalog = async (catalog) => {
    await writeFile(join(dir, 'standards.json'), JSON.stringify(catalog.standards));
    await writeFile(join(dir, 'liberties.json'), JSON.stringify(catalog.liberties));
  };
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sdk-catalog-'));
    await writeCatalog(fixtureCatalog());
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('check mode reports missing files without writing them', async () => {
    const result = await catalogDocs({ dir, check: true });
    assert.deepEqual(result.stale, ['STANDARDS.md', 'LIBERTIES.md']);
    await assert.rejects(readFile(join(dir, 'STANDARDS.md')), { code: 'ENOENT' });
  });

  test('write mode writes, then check mode passes', async () => {
    assert.deepEqual((await catalogDocs({ dir })).written, ['STANDARDS.md', 'LIBERTIES.md']);
    assert.deepEqual((await catalogDocs({ dir, check: true })).stale, []);
  });

  test('check mode tolerates CRLF line endings', async () => {
    const path = join(dir, 'STANDARDS.md');
    await writeFile(path, (await readFile(path, 'utf8')).replace(/\n/g, '\r\n'));
    assert.deepEqual((await catalogDocs({ dir, check: true })).stale, []);
  });

  test('check mode flags a doc that no longer matches the JSON', async () => {
    const catalog = fixtureCatalog();
    catalog.standards.standards[0].rule = 'Changed rule.';
    await writeCatalog(catalog);
    assert.deepEqual((await catalogDocs({ dir, check: true })).stale, ['STANDARDS.md']);
  });

  test('an invalid catalog returns errors and writes nothing', async () => {
    const catalog = fixtureCatalog();
    catalog.standards.standards[0].liberties = ['LIB-99'];
    await writeCatalog(catalog);
    const result = await catalogDocs({ dir });
    assert.ok(result.errors.some((e) => /unknown liberty/.test(e)));
    assert.deepEqual(result.written, []);
  });
});

describe('committed docs', () => {
  test('match a fresh render of the committed JSON', async () => {
    const rendered = renderAll(await loadCatalog(CATALOG_DIR));
    for (const [name, content] of Object.entries(rendered)) {
      const committed = (await readFile(join(CATALOG_DIR, name), 'utf8')).replace(/\r\n/g, '\n');
      assert.equal(committed, content, `catalog/${name} is stale: run npm run catalog:docs`);
    }
  });

  test('the CLI check mode exits 0', async () => {
    const { stdout } = await run(process.execPath, [CLI, '--check']);
    assert.match(stdout, /up to date/);
  });
});
