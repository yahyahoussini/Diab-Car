#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/*  check:messages - 4-language message parity checker                 */
/*                                                                     */
/*  Zero dependency (node:fs + node:path + node:url only).             */
/*  Reads the canonical locale list from src/i18n/routing.js, loads    */
/*  messages/<locale>.json, flattens every tree to leaf key paths and  */
/*  compares each locale against the UNION of all paths, so drift is   */
/*  caught in both directions (a key that exists only in `es` is       */
/*  reported as MISSING from fr/en/ar, never silently ignored).        */
/*                                                                     */
/*  Hard failures (exit 1): unreadable file, JSON parse error,         */
/*  missing key, extra key, type mismatch, empty string value.         */
/*  Soft warning (exit 0): ICU placeholder drift versus the reference  */
/*  locale - some languages legitimately re-order or drop a token.     */
/*                                                                     */
/*  Usage: node scripts/check-messages.mjs [--json] [--help]           */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* Paths and constants                                                 */
/* ------------------------------------------------------------------ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MESSAGES_DIR = path.join(ROOT, 'messages');
const ROUTING_FILE = path.join(ROOT, 'src', 'i18n', 'routing.js');

const FALLBACK_LOCALES = ['fr', 'en', 'ar', 'es'];
const PREFERRED_REFERENCE = 'fr';
const MAX_LIST = 40;
const RULE_WIDTH = 70;

const BOM = 0xfeff;

/**
 * Zero-width and bidi control code points. JS `\s` already covers NBSP, BOM
 * and the line/paragraph separators; these are the extra invisibles that turn
 * up in Arabic copy and would ship as a blank on the page.
 */
const INVISIBLE = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x061c, 0x2066, 0x2067, 0x2068, 0x2069, BOM]);

/* ------------------------------------------------------------------ */
/* CLI + output plumbing                                               */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const wantsHelp = argv.includes('--help') || argv.includes('-h');
const asJson = argv.includes('--json');
const unknownArgs = argv.filter((arg) => !['--json', '--help', '-h'].includes(arg));

/** Every line is buffered and written once, so nothing is lost on exit. */
const lines = [];

/** @param {string} [line] */
function out(line = '') {
  lines.push(line);
}

function flush() {
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
  lines.length = 0;
}

const ESC = String.fromCharCode(27);
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && !asJson;
const paint = (code) => (text) => (useColor ? `${ESC}[${code}m${text}${ESC}[0m` : String(text));
const bold = paint('1');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');
const dim = paint('2');

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * True when a string carries no visible glyph (empty, whitespace only, or
 * nothing but invisible marks). An empty translation ships as a blank on the
 * page, so this is a hard failure, not a warning.
 * @param {string} text
 */
function isBlank(text) {
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (INVISIBLE.has(ch.codePointAt(0))) continue;
    return false;
  }
  return true;
}

/**
 * JS type label used for the type-mismatch comparison.
 * @param {unknown} value
 * @returns {'string'|'number'|'boolean'|'array'|'object'|'null'|string}
 */
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Turn a character offset into a 1-based line/column pair for parse errors.
 * @param {string} text
 * @param {number} position
 */
function lineColumn(text, position) {
  const upTo = text.slice(0, Math.max(0, position));
  const line = upTo.split('\n').length;
  const column = position - upTo.lastIndexOf('\n');
  return { line, column };
}

/* ------------------------------------------------------------------ */
/* Locale list                                                         */
/* ------------------------------------------------------------------ */

/**
 * Read the canonical locale list from src/i18n/routing.js as text.
 * That file imports from next-intl, so it is parsed with a regex rather than
 * imported - the checker must run without the app's module graph.
 * @returns {{ locales: string[], source: string }}
 */
function readLocales() {
  let source = '';
  try {
    source = readFileSync(ROUTING_FILE, 'utf8');
  } catch {
    return { locales: FALLBACK_LOCALES.slice(), source: 'fallback (src/i18n/routing.js unreadable)' };
  }
  const block = source.match(/export\s+const\s+locales\s*=\s*\[([\s\S]*?)\]/);
  if (!block) {
    return { locales: FALLBACK_LOCALES.slice(), source: 'fallback (no `export const locales` array found)' };
  }
  const found = [];
  for (const hit of block[1].matchAll(/['"`]\s*([A-Za-z][A-Za-z0-9_-]*)\s*['"`]/g)) {
    if (!found.includes(hit[1])) found.push(hit[1]);
  }
  if (!found.length) {
    return { locales: FALLBACK_LOCALES.slice(), source: 'fallback (empty `locales` array)' };
  }
  return { locales: found, source: 'src/i18n/routing.js' };
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Load and parse one messages file. A missing or unparseable file is a hard
 * error, reported with the file name and the JSON parse position.
 * @param {string} locale
 * @returns {{ locale: string, file: string, data?: object, error?: string }}
 */
function loadLocale(locale) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    const code =
      err && err.code === 'ENOENT' ? 'file not found' : `unreadable (${err && err.code ? err.code : 'unknown error'})`;
    return { locale, file: relative, error: `${relative}: ${code}` };
  }
  if (text.charCodeAt(0) === BOM) text = text.slice(1);
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { locale, file: relative, error: `${relative}: top-level value must be an object` };
    }
    return { locale, file: relative, data };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    const hit = message.match(/position\s+(\d+)/);
    let where = '';
    if (hit) {
      const { line, column } = lineColumn(text, Number(hit[1]));
      where = ` at position ${hit[1]} (line ${line}, column ${column})`;
    }
    return { locale, file: relative, error: `${relative}: invalid JSON${where} - ${message}` };
  }
}

/* ------------------------------------------------------------------ */
/* Flattening                                                          */
/* ------------------------------------------------------------------ */

/**
 * Extract the ICU placeholder names of a message.
 *
 * Documented approximation: only DEPTH-0 argument names are collected, so
 * `{count, plural, one {# jour} other {# jours}} x {price}` yields
 * {count, price} and the inner bodies of plural/select blocks are skipped -
 * which is what we want, because plural categories legitimately differ per
 * language (Arabic adds zero/two/few/many). ICU quoting is honoured: `''` is
 * a literal apostrophe, and `'{'` / `'}'` / `'#'` open a quoted literal
 * section running to the next lone apostrophe. Placeholders nested INSIDE a
 * plural/select body are not collected - an accepted blind spot that keeps
 * this checker free of a full ICU parser.
 *
 * @param {string} text
 * @returns {Set<string>} placeholder names
 */
function extractPlaceholders(text) {
  const names = new Set();
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      if (text[i + 1] === "'") {
        i += 2;
        continue;
      }
      const next = text[i + 1];
      if (next === '{' || next === '}' || next === '#') {
        i += 2;
        while (i < text.length) {
          if (text[i] === "'") {
            if (text[i + 1] === "'") {
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) {
        let j = i + 1;
        let raw = '';
        while (j < text.length && text[j] !== '}' && text[j] !== ',' && text[j] !== '{') {
          raw += text[j];
          j += 1;
        }
        const name = raw.trim().split(/\s+/)[0] || '';
        if (/^[A-Za-z0-9_.-]+$/.test(name)) names.add(name);
      }
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) depth -= 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return names;
}

/**
 * Flatten a message tree to leaf key paths.
 * Object keys join with '.', array elements with '[i]'. An empty object or an
 * empty array is itself a leaf (type 'object' / 'array') so structural drift
 * between locales stays visible.
 *
 * @param {unknown} node
 * @param {string} prefix
 * @param {Map<string, { path: string, type: string, value: unknown, placeholders: Set<string>|null }>} sink
 */
function flatten(node, prefix, sink) {
  if (Array.isArray(node) && node.length) {
    node.forEach((item, index) => flatten(item, `${prefix}[${index}]`, sink));
    return;
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const keys = Object.keys(node);
    if (keys.length) {
      for (const key of keys) flatten(node[key], prefix ? `${prefix}.${key}` : key, sink);
      return;
    }
  }
  sink.set(prefix, {
    path: prefix,
    type: typeOf(node),
    value: node,
    placeholders: typeof node === 'string' ? extractPlaceholders(node) : null,
  });
}

/**
 * @param {object} tree
 * @returns {Map<string, { path: string, type: string, value: unknown, placeholders: Set<string>|null }>}
 */
function flattenTree(tree) {
  const sink = new Map();
  flatten(tree, '', sink);
  return sink;
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

/**
 * Union of every key path: reference order first, then the paths introduced
 * by the other locales, in locale order. Comparing against the union (not
 * against fr alone) is what makes a key that exists only in `es` show up as
 * MISSING everywhere else instead of vanishing from the report.
 *
 * @param {string[]} locales
 * @param {string} reference
 * @param {Map<string, Map<string, any>>} flat
 * @returns {string[]}
 */
function buildUnion(locales, reference, flat) {
  const order = [];
  const seen = new Set();
  const push = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    order.push(key);
  };
  for (const key of flat.get(reference).keys()) push(key);
  for (const locale of locales) {
    if (locale === reference) continue;
    for (const key of flat.get(locale).keys()) push(key);
  }
  return order;
}

/**
 * Compare one locale against the union of key paths and against the
 * reference locale.
 *
 * @param {string} locale
 * @param {{ flat: Map<string, Map<string, any>>, referenceFlat: Map<string, any>, unionOrder: string[], reference: string }} ctx
 */
function analyse(locale, ctx) {
  const { flat, referenceFlat, unionOrder, reference } = ctx;
  const own = flat.get(locale);
  const isReference = locale === reference;
  const missing = [];
  const extra = [];
  const typeMismatches = [];
  const empty = [];
  const placeholderDrift = [];

  for (const key of unionOrder) {
    if (!own.has(key)) missing.push(key);
  }

  for (const [key, leaf] of own) {
    if (!isReference && !referenceFlat.has(key)) extra.push(key);
    if (leaf.type === 'string' && isBlank(leaf.value)) empty.push(key);

    const referenceLeaf = referenceFlat.get(key);
    if (isReference || !referenceLeaf) continue;

    if (referenceLeaf.type !== leaf.type) {
      typeMismatches.push({ path: key, expected: referenceLeaf.type, actual: leaf.type });
      continue;
    }
    if (leaf.type !== 'string') continue;

    const expected = referenceLeaf.placeholders;
    const actual = leaf.placeholders;
    const lost = [...expected].filter((name) => !actual.has(name)).sort();
    const added = [...actual].filter((name) => !expected.has(name)).sort();
    if (lost.length || added.length) {
      placeholderDrift.push({
        path: key,
        expected: [...expected].sort(),
        actual: [...actual].sort(),
        missing: lost,
        extra: added,
      });
    }
  }

  return { locale, leafCount: own.size, missing, extra, typeMismatches, empty, placeholderDrift };
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

function printHelp() {
  out('check-messages - 4-language message parity checker');
  out('');
  out('  node scripts/check-messages.mjs [--json]');
  out('');
  out('  --json   machine-readable report on stdout (same exit code)');
  out('  --help   this text');
  out('');
  out('  exit 0 = every locale has the same leaf keys, same types, no empty value');
  out('  exit 1 = missing / extra key, type mismatch, empty value, unreadable file');
  out('  ICU placeholder drift is a WARNING and never changes the exit code.');
}

/**
 * Print a capped detail list. The header always states the REAL total, so a
 * truncated list can never be mistaken for the whole story.
 * @param {string} title
 * @param {any[]} items
 * @param {(item: any) => string} render
 * @param {(text: string) => string} colour
 */
function printList(title, items, render, colour) {
  if (!items.length) return;
  out(`  ${colour(`${title} (${items.length})`)}`);
  for (const item of items.slice(0, MAX_LIST)) out(`    - ${render(item)}`);
  if (items.length > MAX_LIST) {
    out(dim(`    ... and ${items.length - MAX_LIST} more (total ${items.length})`));
  }
}

/**
 * @param {{ locales: string[], localeSource: string, reference: string, results: any[], totals: any,
 *          referenceLeafCount: number, unionKeyCount: number, failed: boolean }} report
 */
function printHumanReport(report) {
  const { locales, localeSource, reference, results, totals, referenceLeafCount, unionKeyCount, failed } = report;

  const columns = [
    { key: 'locale', label: 'locale', width: Math.max(8, ...locales.map((locale) => locale.length + 2)) },
    { key: 'leafCount', label: 'leaves', width: 7 },
    { key: 'missing', label: 'missing', width: 7 },
    { key: 'extra', label: 'extra', width: 5 },
    { key: 'typeMismatches', label: 'type', width: 5 },
    { key: 'empty', label: 'empty', width: 5 },
    { key: 'placeholderDrift', label: 'ph.warn', width: 7 },
  ];

  out(bold('Diab Car - message parity check'));
  out(dim(`locales: ${locales.join(', ')} (reference: ${reference}) - from ${localeSource}`));
  out(dim(`files:   messages/<locale>.json - union of all key paths: ${unionKeyCount}`));
  out('');
  out(
    `  ${columns
      .map((column) =>
        column.key === 'locale' ? column.label.padEnd(column.width) : column.label.padStart(column.width),
      )
      .join('  ')}`,
  );
  out(`  ${columns.map((column) => '-'.repeat(column.width)).join('  ')}`);

  for (const result of results) {
    const counts = {
      locale: result.locale + (result.locale === reference ? ' *' : ''),
      leafCount: result.leafCount,
      missing: result.missing.length,
      extra: result.extra.length,
      typeMismatches: result.typeMismatches.length,
      empty: result.empty.length,
      placeholderDrift: result.placeholderDrift.length,
    };
    const cells = columns.map((column) => {
      const raw = String(counts[column.key]);
      if (column.key === 'locale') return raw.padEnd(column.width);
      const padded = raw.padStart(column.width);
      if (raw === '0' || column.key === 'leafCount') return padded;
      return column.key === 'placeholderDrift' ? yellow(padded) : red(padded);
    });
    out(`  ${cells.join('  ')}`);
  }
  out(dim(`  * reference locale; "missing" for ${reference} means a key only the other locales have.`));

  const withErrors = results.filter(
    (result) => result.missing.length || result.extra.length || result.typeMismatches.length || result.empty.length,
  );

  if (withErrors.length) {
    out('');
    out(bold('ERRORS'));
    for (const result of withErrors) {
      out('');
      out(bold(`[${result.locale}] messages/${result.locale}.json`));
      printList('MISSING keys (in the union, absent here)', result.missing, (key) => key, red);
      printList(`EXTRA keys (here, absent from ${reference})`, result.extra, (key) => key, red);
      printList(
        `TYPE mismatches vs ${reference}`,
        result.typeMismatches,
        (item) => `${item.path}  [${reference}: ${item.expected}] -> [${result.locale}: ${item.actual}]`,
        red,
      );
      printList('EMPTY values (string with no visible glyph)', result.empty, (key) => key, red);
    }
  }

  const withWarnings = results.filter((result) => result.placeholderDrift.length);

  if (withWarnings.length) {
    out('');
    out(bold('WARNINGS (placeholders - never change the exit code)'));
    for (const result of withWarnings) {
      out('');
      out(bold(`[${result.locale}] ICU placeholder drift vs ${reference}`));
      printList(
        'PLACEHOLDER drift',
        result.placeholderDrift,
        (item) => {
          const parts = [];
          if (item.missing.length) parts.push(`missing {${item.missing.join('} {')}}`);
          if (item.extra.length) parts.push(`extra {${item.extra.join('} {')}}`);
          const expected = item.expected.join(', ') || '-';
          const actual = item.actual.join(', ') || '-';
          return `${item.path}  ${parts.join(', ')}  [${reference}: ${expected} | ${result.locale}: ${actual}]`;
        },
        yellow,
      );
    }
  }

  const rule = '='.repeat(RULE_WIDTH);
  out('');
  out(rule);
  if (failed) {
    out(
      red(
        `FAIL - ${totals.missing} missing, ${totals.extra} extra, ${totals.typeMismatches} type mismatch(es), ` +
          `${totals.empty} empty value(s) across ${locales.length} locales ` +
          `(reference ${reference}: ${referenceLeafCount} leaf keys)`,
      ),
    );
  } else {
    out(
      green(
        `PASS - ${locales.length} locales share the same ${referenceLeafCount} leaf keys ` +
          `(reference ${reference}), no empty value` +
          (totals.placeholderDrift ? `, ${totals.placeholderDrift} placeholder warning(s)` : ''),
      ),
    );
  }
  out(rule);
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

/** @returns {number} process exit code */
function main() {
  if (wantsHelp) {
    printHelp();
    return 0;
  }

  if (unknownArgs.length) {
    process.stderr.write(`check-messages: unknown argument(s): ${unknownArgs.join(', ')}\n`);
    process.stderr.write('check-messages: usage: node scripts/check-messages.mjs [--json] [--help]\n');
    return 1;
  }

  const { locales, source: localeSource } = readLocales();
  const reference = locales.includes(PREFERRED_REFERENCE) ? PREFERRED_REFERENCE : locales[0];

  const loaded = locales.map(loadLocale);
  const loadErrors = loaded.filter((entry) => entry.error).map((entry) => entry.error);

  if (loadErrors.length) {
    if (asJson) {
      out(
        JSON.stringify(
          {
            ok: false,
            referenceLocale: reference,
            locales,
            localeSource,
            referenceLeafCount: 0,
            unionKeyCount: 0,
            errors: loadErrors,
            results: [],
            totals: { missing: 0, extra: 0, typeMismatches: 0, empty: 0, placeholderDrift: 0 },
          },
          null,
          2,
        ),
      );
    } else {
      out(bold('Diab Car - message parity check'));
      out('');
      for (const message of loadErrors) out(`${red('ERROR')} ${message}`);
      out('');
      out(red(`FAIL - ${loadErrors.length} message file(s) could not be loaded`));
    }
    return 1;
  }

  /** @type {Map<string, Map<string, any>>} */
  const flat = new Map();
  for (const entry of loaded) flat.set(entry.locale, flattenTree(entry.data));

  const referenceFlat = flat.get(reference);
  const unionOrder = buildUnion(locales, reference, flat);
  const ctx = { flat, referenceFlat, unionOrder, reference };
  const results = locales.map((locale) => analyse(locale, ctx));

  const totals = results.reduce(
    (acc, result) => ({
      missing: acc.missing + result.missing.length,
      extra: acc.extra + result.extra.length,
      typeMismatches: acc.typeMismatches + result.typeMismatches.length,
      empty: acc.empty + result.empty.length,
      placeholderDrift: acc.placeholderDrift + result.placeholderDrift.length,
    }),
    { missing: 0, extra: 0, typeMismatches: 0, empty: 0, placeholderDrift: 0 },
  );

  // Placeholder drift is deliberately absent from this sum: it is a warning.
  const failed = totals.missing + totals.extra + totals.typeMismatches + totals.empty > 0;

  if (asJson) {
    out(
      JSON.stringify(
        {
          ok: !failed,
          referenceLocale: reference,
          locales,
          localeSource,
          referenceLeafCount: referenceFlat.size,
          unionKeyCount: unionOrder.length,
          errors: [],
          results,
          totals,
        },
        null,
        2,
      ),
    );
    return failed ? 1 : 0;
  }

  printHumanReport({
    locales,
    localeSource,
    reference,
    results,
    totals,
    referenceLeafCount: referenceFlat.size,
    unionKeyCount: unionOrder.length,
    failed,
  });

  return failed ? 1 : 0;
}

const code = main();
flush();
process.exitCode = code;
