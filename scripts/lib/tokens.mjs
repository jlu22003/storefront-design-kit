// Loads, validates and resolves the DTCG design tokens in tokens/.
//
// Source files follow the Design Tokens Format Module 2025.10 (research report §4.1):
//   core.tokens.json              mode-independent tokens
//   color.<mode>.tokens.json      one file per appearance mode, all with the same tokens
//
// The output is an emitter-neutral model: every token with its path, type, resolved
// value, description and kit extensions. Emitters (CSS today, other formats can be
// added) render that model and never read the JSON themselves.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const TOKENS_DIR = join(import.meta.dirname, '..', '..', 'tokens');

/** The appearance modes, in emission order. `base` is the mode an increased-contrast set refines. */
export const MODES = [
  { id: 'light', file: 'color.light.tokens.json', scheme: 'light', contrast: 'normal' },
  { id: 'dark', file: 'color.dark.tokens.json', scheme: 'dark', contrast: 'normal' },
  { id: 'light-hc', file: 'color.light-hc.tokens.json', scheme: 'light', contrast: 'more' },
  { id: 'dark-hc', file: 'color.dark-hc.tokens.json', scheme: 'dark', contrast: 'more' },
];
export const CORE_FILE = 'core.tokens.json';

/** Namespace for this kit's `$extensions` (reverse-domain, as DTCG recommends). */
export const EXT = 'io.github.jlu22003.sdk';

const TYPES = new Set(['color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number', 'shadow']);
const DIMENSION_UNITS = new Set(['px', 'rem']);
const DURATION_UNITS = new Set(['ms', 's']);
const NAME = /^[^$.{}]+$/;
const ALIAS = /^\{([^{}]+)\}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** Reads the core file and every mode file from `dir`. */
export async function loadTokenFiles(dir = TOKENS_DIR) {
  const read = async (file) => {
    try {
      return JSON.parse(await readFile(join(dir, file), 'utf8'));
    } catch (error) {
      throw new Error(`cannot read tokens/${file}: ${error.message}`, { cause: error });
    }
  };
  const modes = {};
  for (const mode of MODES) modes[mode.id] = await read(mode.file);
  return { core: await read(CORE_FILE), modes };
}

/**
 * Flattens a DTCG document into tokens: { path, type, value, description, extensions }.
 * `$type` inherits from the nearest group. Structural problems go to `errors`.
 */
export function flattenTokens(doc, file, errors = []) {
  const tokens = [];
  const walk = (node, path, inheritedType) => {
    const type = node.$type ?? inheritedType;
    if ('$value' in node) {
      const where = `${file}: ${path.join('.')}`;
      for (const key of Object.keys(node)) {
        if (key.startsWith('$')) {
          if (!['$value', '$type', '$description', '$extensions', '$deprecated'].includes(key)) errors.push(`${where}: unknown reserved key ${key}`);
        } else {
          errors.push(`${where}: a token cannot contain the child "${key}"`);
        }
      }
      if (!type) errors.push(`${where}: no $type on the token or any parent group`);
      else if (!TYPES.has(type)) errors.push(`${where}: unsupported $type "${type}"`);
      tokens.push({
        path,
        type,
        value: node.$value,
        description: node.$description ?? null,
        extensions: node.$extensions?.[EXT] ?? {},
      });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      const where = `${file}: ${[...path, key].join('.')}`;
      if (!NAME.test(key)) errors.push(`${where}: invalid name (no $, ".", "{" or "}")`);
      else if (!isObject(child)) errors.push(`${where}: expected a token or group object`);
      else walk(child, [...path, key], type);
    }
  };
  walk(doc, [], undefined);
  return tokens;
}

const dimensionError = (value, units) => {
  if (!isObject(value) || !isNumber(value.value) || !units.has(value.unit)) {
    return `expected { value: number, unit: ${[...units].join('|')} }`;
  }
  return null;
};

function colorError(value) {
  if (!isObject(value) || value.colorSpace !== 'srgb') return 'expected an srgb color object';
  const { components, alpha = 1, hex } = value;
  if (!Array.isArray(components) || components.length !== 3 || !components.every((c) => isNumber(c) && c >= 0 && c <= 1)) {
    return 'expected 3 components in [0, 1]';
  }
  if (!isNumber(alpha) || alpha < 0 || alpha > 1) return 'expected alpha in [0, 1]';
  if (hex !== undefined) {
    if (!HEX.test(hex)) return `invalid hex "${hex}"`;
    const fromHex = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if (components.some((c, i) => Math.round(c * 255) !== fromHex[i])) return `components do not match hex ${hex}`;
  }
  return null;
}

/** Returns a message when `value` (already resolved) does not fit `type`, else null. */
export function valueError(type, value) {
  switch (type) {
    case 'color':
      return colorError(value);
    case 'dimension':
      return dimensionError(value, DIMENSION_UNITS);
    case 'duration':
      return dimensionError(value, DURATION_UNITS);
    case 'number':
      return isNumber(value) ? null : 'expected a number';
    case 'fontWeight':
      return isNumber(value) && value >= 1 && value <= 1000 ? null : 'expected a number in [1, 1000]';
    case 'fontFamily':
      return typeof value === 'string' || (Array.isArray(value) && value.length && value.every((v) => typeof v === 'string'))
        ? null : 'expected a string or a non-empty array of strings';
    case 'cubicBezier':
      return Array.isArray(value) && value.length === 4 && value.every(isNumber) && value[0] >= 0 && value[0] <= 1 && value[2] >= 0 && value[2] <= 1
        ? null : 'expected [x1, y1, x2, y2] with x in [0, 1]';
    case 'shadow': {
      const layers = Array.isArray(value) ? value : [value];
      for (const layer of layers) {
        if (!isObject(layer)) return 'expected a shadow object';
        const problem = colorError(layer.color)
          ?? ['offsetX', 'offsetY', 'blur', 'spread'].map((k) => dimensionError(layer[k], DIMENSION_UNITS)).find(Boolean);
        if (problem) return `shadow: ${problem}`;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Resolves `{group.token}` aliases in `tokens` against `scope` (a Map of path → token).
 * Aliases may be a whole `$value` or a property of a composite value. Returns resolved tokens;
 * an aliased token keeps its reference in `alias`.
 */
export function resolveTokens(tokens, scope, file, errors = []) {
  const deref = (value, seen, where) => {
    const match = typeof value === 'string' && ALIAS.exec(value);
    if (!match) return { value };
    const target = scope.get(match[1]);
    if (!target) {
      errors.push(`${where}: alias ${value} points to no token`);
      return { value: undefined };
    }
    if (seen.has(match[1])) {
      errors.push(`${where}: alias cycle through ${match[1]}`);
      return { value: undefined };
    }
    return { value: deref(target.value, new Set([...seen, match[1]]), where).value, type: target.type, ref: match[1] };
  };
  return tokens.map((token) => {
    const name = token.path.join('.');
    const where = `${file}: ${name}`;
    const whole = deref(token.value, new Set([name]), where);
    if (whole.type && whole.type !== token.type) errors.push(`${where}: alias ${token.value} is a ${whole.type}, not a ${token.type}`);
    let value = whole.value;
    if (whole.ref === undefined && isObject(value)) {
      value = Object.fromEntries(Object.entries(value).map(([key, part]) => [key, deref(part, new Set([name]), where).value]));
    }
    if (value !== undefined && token.type) {
      const problem = valueError(token.type, value);
      if (problem) errors.push(`${where}: ${problem}`);
    }
    for (const [key, extra] of Object.entries(token.extensions)) {
      if (key === 'reducedMotion' && token.type && valueError(token.type, extra)) {
        errors.push(`${where}: reducedMotion: ${valueError(token.type, extra)}`);
      }
    }
    return { ...token, name, value, alias: whole.ref ?? null };
  });
}

const byName = (tokens) => new Map(tokens.map((token) => [token.path.join('.'), token]));

/**
 * Builds the token model from loaded files: { core, modes: { light, dark, ... }, errors }.
 * Mode tokens may alias core tokens and other tokens of the same mode.
 */
export function buildModel(files) {
  const errors = [];
  const coreRaw = flattenTokens(files.core, CORE_FILE, errors);
  const coreScope = byName(coreRaw);
  const core = resolveTokens(coreRaw, coreScope, CORE_FILE, errors);

  const modes = {};
  let reference = null;
  for (const mode of MODES) {
    const raw = flattenTokens(files.modes[mode.id] ?? {}, mode.file, errors);
    for (const token of raw) {
      if (coreScope.has(token.path.join('.'))) errors.push(`${mode.file}: ${token.path.join('.')} is already a core token`);
    }
    const scope = new Map([...coreScope, ...byName(raw)]);
    modes[mode.id] = resolveTokens(raw, scope, mode.file, errors);

    // Every mode defines the same tokens with the same types (COL-07).
    const signature = new Map(raw.map((token) => [token.path.join('.'), token.type]));
    if (!reference) {
      reference = { file: mode.file, signature };
    } else {
      for (const [name, type] of reference.signature) {
        if (!signature.has(name)) errors.push(`${mode.file}: missing ${name} (defined in ${reference.file})`);
        else if (signature.get(name) !== type) errors.push(`${mode.file}: ${name} is a ${signature.get(name)}, not a ${type} as in ${reference.file}`);
      }
      for (const name of signature.keys()) {
        if (!reference.signature.has(name)) errors.push(`${mode.file}: ${name} is not in ${reference.file}`);
      }
    }
  }
  return { core, modes, errors };
}

/** Loads and builds the model for the tokens in `dir`. */
export async function loadModel(dir = TOKENS_DIR) {
  return buildModel(await loadTokenFiles(dir));
}

/** Converts a dimension to px, at a 16px root for rem. For tests and px-based emitters (C). */
export function toPx(dimension, rootPx = 16) {
  return dimension.unit === 'rem' ? dimension.value * rootPx : dimension.value;
}

/** Converts a duration to ms. */
export const toMs = (duration) => (duration.unit === 's' ? duration.value * 1000 : duration.value);
