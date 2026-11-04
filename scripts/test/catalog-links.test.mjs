// Failure messages link each standard to its sources; every WCAG success
// criterion the catalog cites must resolve to its own anchor in WCAG 2.2.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { standardLinks, wcagUrl } from '../lib/catalog-links.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

test('every WCAG success criterion in the catalog has a specific link', async () => {
  const { standards } = JSON.parse(await readFile(join(ROOT, 'catalog', 'standards.json'), 'utf8'));
  const unlinked = [...new Set(standards.flatMap((standard) => standard.wcag.map((ref) => ref.sc)))].filter((sc) => !wcagUrl(sc));
  assert.deepEqual(unlinked, []);
});

test('links a standard to its HIG pages and WCAG 2.2 success criteria', () => {
  const standard = {
    hig: [{ slug: 'accessibility', url: 'https://developer.apple.com/design/human-interface-guidelines/accessibility' }],
    wcag: [{ sc: '2.5.8', level: 'AA' }, { sc: '1.4.10', level: 'AA' }],
  };
  assert.deepEqual(standardLinks(standard), [
    'HIG https://developer.apple.com/design/human-interface-guidelines/accessibility',
    'WCAG 2.5.8 https://www.w3.org/TR/WCAG22/#target-size-minimum',
    'WCAG 1.4.10 https://www.w3.org/TR/WCAG22/#reflow',
  ]);
});
