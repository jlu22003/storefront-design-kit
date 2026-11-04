// Fixture tests for the coverage gate, run by scripts/test/coverage.test.mjs.
// Only COL-01, COL-02 (subtest), and LAY-01 may count as coverage.
import { before, describe, test } from 'node:test';

describe('COL-03 suite names do not count', () => {
  before(() => {});
  test('COL-01 runs', () => {});
  test.skip('COL-04 skipped', () => {});
  test.todo('COL-05 todo');
  test('COL-06 in-body skip', (t) => {
    t.skip();
  });
  test('COL-07 in-body todo', (t) => {
    t.todo();
  });
  test('parent', async (t) => {
    await t.test('COL-02 subtest', () => {});
  });
});

describe.skip('LAY-02 skipped suite', () => {
  test('LAY-03 inner', () => {});
});

test('LAY-01 and ISO-99 and LAY-77', () => {});
