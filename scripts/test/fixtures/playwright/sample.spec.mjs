// Fixture tests for the coverage gate. Only LAY-01, COL-01, and LAY-06 (from
// tests that run) and LAY-05 (run in project "two" only) may count as coverage.
import { test } from '@playwright/test';

test.describe('group', { tag: '@LAY-01' }, () => {
  test.beforeEach('hook titled @LAY-09', async () => {});
  test('runs', { tag: ['@COL-01', '@WCAG-1.4.3'] }, async () => {});
  test('title tag @LAY-06', async () => {});
  test.skip('static skip', { tag: '@LAY-02' }, async () => {});
  test.fixme('static fixme', { tag: '@LAY-03' }, async () => {});
  test('in-body skip', { tag: '@LAY-04' }, async () => {
    test.skip();
  });
  test('in-body fixme', { tag: '@LAY-07' }, async () => {
    test.fixme();
  });
  test('skipped in project one', { tag: '@LAY-05' }, async ({}, testInfo) => {
    test.skip(testInfo.project.name === 'one', 'project two covers it');
  });
  test('string literal', async () => {
    const text = "test('x', { tag: '@LAY-08' })";
    return text;
  });
});

test.describe.skip('skipped group', () => {
  test('inner', { tag: '@LAY-10' }, async () => {});
});

test('screenshot', { tag: ['@visual', '@COL-02', '@LIB-04', '@LYA-01'] }, async () => {});
