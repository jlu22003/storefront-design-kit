// Loads and validates the standards catalog (catalog/standards.json and
// catalog/liberties.json). Zero dependencies: Node built-ins only.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ENFORCEMENT_LABELS = ['automated', 'visual', 'principle'];
export const WCAG_LEVELS = ['A', 'AA', 'AAA'];

const STANDARD_ID = /^([A-Z]{3})-(\d{2})$/;
const LIBERTY_ID = /^LIB-\d{2}$/;
const WCAG_SC = /^\d\.\d+\.\d+$/;
const STANDARD_KEYS = new Set([
  'id', 'family', 'rule', 'threshold', 'hig', 'wcag', 'enforcement',
  'automatedSeverity', 'automatedScope', 'liberties', 'note',
]);
const LIBERTY_KEYS = new Set(['id', 'title', 'detail', 'rationale', 'note']);

/** Reads both catalog files from `dir` and returns their parsed contents. */
export async function loadCatalog(dir) {
  const [standards, liberties] = await Promise.all(
    ['standards.json', 'liberties.json'].map(async (name) => {
      const path = join(dir, name);
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch (error) {
        throw new Error(`cannot read ${path}: ${error.message}`, { cause: error });
      }
    }),
  );
  return { standards, liberties };
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Checks the catalog's structure and cross-references.
 * Returns a list of human-readable problems; an empty list means valid.
 */
export function validateCatalog({ standards: doc, liberties: libDoc }) {
  const errors = [];
  const fail = (where, message) => errors.push(`${where}: ${message}`);

  if (!doc || !Array.isArray(doc.families) || !Array.isArray(doc.standards)) {
    return ['standards.json: expected "families" and "standards" arrays'];
  }
  if (!libDoc || !Array.isArray(libDoc.liberties)) {
    return ['liberties.json: expected a "liberties" array'];
  }
  const higBase = doc.sources?.hig;
  if (!isText(higBase)) fail('standards.json', 'sources.hig must be the HIG base URL');

  const familyIds = new Set();
  for (const family of doc.families) {
    if (!/^[A-Z]{3}$/.test(family?.id ?? '')) fail('families', `bad family id ${JSON.stringify(family?.id)}`);
    else if (familyIds.has(family.id)) fail('families', `duplicate family ${family.id}`);
    familyIds.add(family?.id);
    if (!isText(family?.name)) fail(`family ${family?.id}`, 'name is required');
  }

  const libertyIds = new Set();
  for (const [index, liberty] of libDoc.liberties.entries()) {
    const where = liberty?.id ?? `liberties[${index}]`;
    if (!LIBERTY_ID.test(liberty?.id ?? '')) fail(where, 'id must look like LIB-01');
    else if (libertyIds.has(liberty.id)) fail(where, 'duplicate id');
    libertyIds.add(liberty?.id);
    for (const key of Object.keys(liberty ?? {})) {
      if (!LIBERTY_KEYS.has(key)) fail(where, `unknown field "${key}"`);
    }
    for (const key of ['title', 'rationale']) {
      if (!isText(liberty?.[key])) fail(where, `${key} is required`);
    }
    for (const key of ['detail', 'note']) {
      if (key in (liberty ?? {}) && !isText(liberty[key])) fail(where, `${key} must be non-empty text when present`);
    }
  }

  const standardIds = new Set();
  const numbersByFamily = new Map();
  for (const [index, standard] of doc.standards.entries()) {
    const where = standard?.id ?? `standards[${index}]`;
    const match = STANDARD_ID.exec(standard?.id ?? '');
    if (!match) {
      fail(where, 'id must look like LAY-01');
    } else {
      if (standardIds.has(standard.id)) fail(where, 'duplicate id');
      standardIds.add(standard.id);
      if (standard.family !== match[1]) fail(where, `family must be ${match[1]}`);
      if (!numbersByFamily.has(match[1])) numbersByFamily.set(match[1], []);
      numbersByFamily.get(match[1]).push(Number(match[2]));
    }
    if (!familyIds.has(standard?.family)) fail(where, `unknown family ${JSON.stringify(standard?.family)}`);
    for (const key of Object.keys(standard ?? {})) {
      if (!STANDARD_KEYS.has(key)) fail(where, `unknown field "${key}"`);
    }
    if (!isText(standard?.rule)) fail(where, 'rule is required');
    if (standard?.threshold !== null && !isText(standard?.threshold)) {
      fail(where, 'threshold must be text or null');
    }

    if (!Array.isArray(standard?.hig)) fail(where, 'hig must be an array');
    else {
      for (const link of standard.hig) {
        if (!/^[a-z0-9-]+$/.test(link?.slug ?? '')) fail(where, `bad HIG slug ${JSON.stringify(link?.slug)}`);
        else if (link.url !== `${higBase}${link.slug}`) fail(where, `HIG url for ${link.slug} must be ${higBase}${link.slug}`);
        if ('note' in (link ?? {}) && !isText(link.note)) fail(where, 'HIG note must be non-empty text');
      }
    }

    if (!Array.isArray(standard?.wcag)) fail(where, 'wcag must be an array');
    else {
      for (const ref of standard.wcag) {
        if (!WCAG_SC.test(ref?.sc ?? '')) fail(where, `bad WCAG criterion ${JSON.stringify(ref?.sc)}`);
        if (!WCAG_LEVELS.includes(ref?.level)) fail(where, `bad WCAG level ${JSON.stringify(ref?.level)}`);
      }
    }

    const labels = standard?.enforcement;
    if (!Array.isArray(labels) || labels.length === 0) {
      fail(where, 'enforcement must list at least one label');
    } else {
      for (const label of labels) {
        if (!ENFORCEMENT_LABELS.includes(label)) fail(where, `unknown enforcement label ${JSON.stringify(label)}`);
      }
      if (new Set(labels).size !== labels.length) fail(where, 'duplicate enforcement label');
    }
    const automated = Array.isArray(labels) && labels.includes('automated');
    if ('automatedSeverity' in (standard ?? {})) {
      if (standard.automatedSeverity !== 'warn') fail(where, 'automatedSeverity can only be "warn"');
      if (!automated) fail(where, 'automatedSeverity needs the automated label');
    }
    if ('automatedScope' in (standard ?? {})) {
      if (standard.automatedScope !== 'partial') fail(where, 'automatedScope can only be "partial"');
      if (!automated) fail(where, 'automatedScope needs the automated label');
    }

    if (!Array.isArray(standard?.liberties)) fail(where, 'liberties must be an array');
    else {
      for (const id of standard.liberties) {
        if (!libertyIds.has(id)) fail(where, `unknown liberty ${JSON.stringify(id)}`);
      }
      if (new Set(standard.liberties).size !== standard.liberties.length) fail(where, 'duplicate liberty');
    }
    if ('note' in (standard ?? {}) && !isText(standard.note)) fail(where, 'note must be non-empty text when present');
  }

  for (const [family, numbers] of numbersByFamily) {
    numbers.forEach((number, index) => {
      if (number !== index + 1) {
        fail(`family ${family}`, `ids must be numbered 01, 02, ... in order; found ${family}-${String(number).padStart(2, '0')} at position ${index + 1}`);
      }
    });
  }

  // Every ID mentioned in prose must exist, so "See ACC-10" never dangles.
  const mentioned = (text, where) => {
    for (const [id] of String(text ?? '').matchAll(/\b[A-Z]{3}-\d{2}\b/g)) {
      const known = id.startsWith('LIB-') ? libertyIds.has(id) : standardIds.has(id);
      if (!known) fail(where, `mentions unknown id ${id}`);
    }
  };
  for (const standard of doc.standards) {
    for (const key of ['rule', 'threshold', 'note']) mentioned(standard?.[key], standard?.id);
  }
  for (const liberty of libDoc.liberties) {
    for (const key of ['title', 'detail', 'rationale', 'note']) mentioned(liberty?.[key], liberty?.id);
  }
  return errors;
}

/** True when the standard carries the given enforcement label. */
export const hasLabel = (standard, label) => standard.enforcement.includes(label);
