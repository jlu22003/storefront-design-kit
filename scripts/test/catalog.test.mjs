import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { hasLabel, loadCatalog, validateCatalog } from '../lib/catalog.mjs';
import { fixtureCatalog } from './fixture.mjs';

const CATALOG_DIR = join(import.meta.dirname, '..', '..', 'catalog');

describe('committed catalog', async () => {
  const catalog = await loadCatalog(CATALOG_DIR);
  const { standards } = catalog.standards;

  test('is valid', () => {
    assert.deepEqual(validateCatalog(catalog), []);
  });

  test('holds every standard and liberty from the research report', () => {
    assert.equal(standards.length, 187);
    assert.equal(catalog.standards.families.length, 17);
    assert.equal(catalog.liberties.liberties.length, 30);
    const count = (label) => standards.filter((s) => hasLabel(s, label)).length;
    assert.deepEqual(
      { automated: count('automated'), visual: count('visual'), principle: count('principle') },
      { automated: 118, visual: 32, principle: 67 },
    );
  });

  test('has the report\'s per-family counts', () => {
    const counts = {};
    for (const s of standards) counts[s.family] = (counts[s.family] ?? 0) + 1;
    assert.deepEqual(counts, {
      LAY: 14, TYP: 13, COL: 12, DRK: 6, ACC: 19, MOT: 7, MAT: 8, ICN: 8, IMG: 6,
      BTN: 9, FRM: 17, NAV: 13, MOD: 14, LST: 10, FBK: 11, WRT: 10, COM: 10,
    });
  });

  test('records the open-fonts decision instead of SF Pro', () => {
    const typ12 = standards.find((s) => s.id === 'TYP-12');
    assert.match(typ12.rule, /Inter/);
    assert.match(typ12.rule, /No SF Pro/);
    assert.deepEqual(typ12.liberties, ['LIB-12']);
  });
});

describe('validateCatalog', () => {
  const problems = (mutate) => {
    const catalog = fixtureCatalog();
    mutate(catalog);
    return validateCatalog(catalog);
  };
  const standard = (catalog, id) => catalog.standards.standards.find((s) => s.id === id);

  test('accepts the fixture', () => {
    assert.deepEqual(problems(() => {}), []);
  });

  const cases = [
    ['duplicate id', (c) => { standard(c, 'LAY-02').id = 'LAY-01'; }, /LAY-01: duplicate id/],
    ['malformed id', (c) => { standard(c, 'LAY-01').id = 'LAY1'; }, /id must look like LAY-01/],
    ['family mismatch', (c) => { standard(c, 'COL-01').family = 'LAY'; }, /family must be COL/],
    ['unknown family', (c) => { c.standards.families.pop(); }, /unknown family "COL"/],
    ['numbering gap', (c) => { standard(c, 'LAY-02').id = 'LAY-03'; }, /numbered 01, 02/],
    ['unknown field', (c) => { standard(c, 'LAY-01').title = 'x'; }, /unknown field "title"/],
    ['empty rule', (c) => { standard(c, 'LAY-01').rule = ' '; }, /rule is required/],
    ['missing threshold', (c) => { delete standard(c, 'LAY-01').threshold; }, /threshold must be text or null/],
    ['wrong HIG url', (c) => { standard(c, 'LAY-01').hig[0].url = 'https://example.com/layout'; }, /HIG url for layout/],
    ['bad WCAG criterion', (c) => { standard(c, 'LAY-01').wcag[0].sc = '1.3'; }, /bad WCAG criterion/],
    ['bad WCAG level', (c) => { standard(c, 'LAY-01').wcag[0].level = 'AAAA'; }, /bad WCAG level/],
    ['no enforcement', (c) => { standard(c, 'LAY-01').enforcement = []; }, /at least one label/],
    ['unknown label', (c) => { standard(c, 'LAY-01').enforcement = ['manual']; }, /unknown enforcement label/],
    ['duplicate label', (c) => { standard(c, 'LAY-01').enforcement = ['automated', 'automated']; }, /duplicate enforcement label/],
    ['severity without automated', (c) => { standard(c, 'LAY-02').automatedSeverity = 'warn'; }, /needs the automated label/],
    ['bad severity', (c) => { standard(c, 'COL-01').automatedSeverity = 'error'; }, /can only be "warn"/],
    ['bad scope', (c) => { standard(c, 'LAY-01').automatedScope = 'some'; }, /can only be "partial"/],
    ['unknown liberty', (c) => { standard(c, 'LAY-01').liberties = ['LIB-99']; }, /unknown liberty "LIB-99"/],
    ['dangling mention', (c) => { standard(c, 'LAY-01').rule = 'See ACC-10.'; }, /mentions unknown id ACC-10/],
    ['dangling liberty mention', (c) => { c.liberties.liberties[0].rationale = 'Per LIB-30.'; }, /LIB-01: mentions unknown id LIB-30/],
    ['duplicate liberty id', (c) => { c.liberties.liberties[1].id = 'LIB-01'; }, /LIB-01: duplicate id/],
    ['liberty missing rationale', (c) => { delete c.liberties.liberties[0].rationale; }, /rationale is required/],
    ['liberty empty detail', (c) => { c.liberties.liberties[0].detail = ''; }, /detail must be non-empty/],
    ['liberty unknown field', (c) => { c.liberties.liberties[0].why = 'x'; }, /unknown field "why"/],
  ];
  for (const [name, mutate, expected] of cases) {
    test(`rejects ${name}`, () => {
      const found = problems(mutate);
      assert.ok(found.some((p) => expected.test(p)), `expected ${expected} in ${JSON.stringify(found)}`);
    });
  }

  test('rejects a document without the expected arrays', () => {
    assert.deepEqual(validateCatalog({ standards: {}, liberties: { liberties: [] } }), [
      'standards.json: expected "families" and "standards" arrays',
    ]);
  });
});

describe('loadCatalog', () => {
  test('names the file it cannot read', async () => {
    await assert.rejects(loadCatalog(join(import.meta.dirname, 'missing')), /cannot read .*(standards|liberties)\.json/);
  });
});
