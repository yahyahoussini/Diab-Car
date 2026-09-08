#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/*  check:css - does the stylesheet actually parse, before AND after   */
/*  Tailwind has had its way with it?                                  */
/*                                                                     */
/*  Two stages, because two different bugs live in two different       */
/*  files that are really the same file.                               */
/*                                                                     */
/*  STAGE 1 - the source. A Tailwind class name written straight into  */
/*  a selector without escaping is not a wrong rule, it is not a rule: */
/*  CSS reads the colon as a pseudo-class and the brackets as an       */
/*  attribute selector. `next build` demotes that to a warning nobody  */
/*  reads and drops the rule; `next dev` refuses the sheet outright.   */
/*  In between, whatever the rule was for silently never happens.      */
/*                                                                     */
/*  STAGE 2 - what actually ships. Tailwind v4 scans EVERY file in the */
/*  project for things that look like class names, this script very    */
/*  much included, and emits a utility for each one it finds. Write a  */
/*  plausible-looking class name inside a code comment - in a .js, a   */
/*  .mjs, a .md, anywhere - and Tailwind will faithfully generate CSS  */
/*  for it. If the arbitrary value in that name is not valid CSS, the  */
/*  build fails on a rule no human ever wrote, pointing at a line in a */
/*  generated file that does not exist on disk.                        */
/*                                                                     */
/*  Stage 1 alone gave this repo a green light on a build that was     */
/*  about to fail, which is why stage 2 exists: it runs the real       */
/*  PostCSS + Tailwind pipeline and parses the output.                 */
/*                                                                     */
/*  Lightning CSS is the parser Turbopack itself uses and it already   */
/*  ships inside Tailwind v4, so neither stage costs a dependency.     */
/*                                                                     */
/*  Note to whoever edits this file: do not paste a real Tailwind      */
/*  class name into these comments. Describe it. That is the bug.      */
/*                                                                     */
/*  Usage: node scripts/check-css.mjs [--json] [--help]                */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** Every stylesheet the app ships. Add one here when a new one appears. */
const SHEETS = ['src/styles/globals.css'];

/** At-rules Tailwind owns and compiles away before a parser sees them. */
const TAILWIND_AT_RULES = new Set(['theme', 'utility', 'custom-variant', 'variant', 'apply', 'source', 'plugin', 'config', 'reference']);
const UNKNOWN_AT_RULE = /^Unknown at rule: @([\w-]+)$/;

const asJson = process.argv.includes('--json');

if (process.argv.includes('--help')) {
  console.log(
    'Usage: node scripts/check-css.mjs [--json]\n\n' +
      'Stage 1 parses each stylesheet as written.\n' +
      'Stage 2 runs the real Tailwind pipeline and parses what it emits,\n' +
      'which is where a stray class-shaped string in any project file lands.',
  );
  process.exit(0);
}

const problems = [];

/** Collect Lightning CSS complaints, minus the at-rules Tailwind owns. */
function parse(label, code, { allowTailwindAtRules }) {
  let result;
  try {
    /* errorRecovery keeps going after the first bad rule, so one typo does
       not hide the next one. */
    result = transform({ filename: label, code: Buffer.from(code), errorRecovery: true });
  } catch (error) {
    problems.push({ stage: label, line: error.loc?.line ?? 0, message: error.message });
    return;
  }
  for (const warning of result.warnings ?? []) {
    const match = UNKNOWN_AT_RULE.exec(warning.message);
    if (allowTailwindAtRules && match && TAILWIND_AT_RULES.has(match[1])) continue;
    problems.push({ stage: label, line: warning.loc?.line ?? 0, message: warning.message });
  }
}

/* ---------------------------------------------------- stage 1: the source */

const sources = new Map();
for (const rel of SHEETS) {
  let code;
  try {
    code = readFileSync(path.join(ROOT, rel), 'utf8');
  } catch (error) {
    problems.push({ stage: rel, line: 0, message: `unreadable: ${error.message}` });
    continue;
  }
  sources.set(rel, code);
  parse(rel, code, { allowTailwindAtRules: true });
}

/* ------------------------------------------------ stage 2: what is emitted */

let compiled = 0;
try {
  const { default: postcss } = await import('postcss');
  const { default: tailwindcss } = await import('@tailwindcss/postcss');

  for (const [rel, code] of sources) {
    const from = path.join(ROOT, rel);
    const result = await postcss([tailwindcss()]).process(code, { from });
    compiled += 1;
    /* Tailwind has resolved its own at-rules by now, so an unknown one here
       is a real unknown. */
    parse(`${rel} (generated)`, result.css, { allowTailwindAtRules: false });
  }
} catch (error) {
  problems.push({
    stage: 'tailwind',
    line: 0,
    message:
      `could not run the Tailwind pipeline (${error.message}). Stage 2 checks what actually ` +
      'ships; without it a stray class-shaped string anywhere in the project can still break the build.',
  });
}

/* ------------------------------------------------------------------ report */

if (asJson) {
  console.log(JSON.stringify({ ok: problems.length === 0, sheets: SHEETS.length, compiled, problems }, null, 2));
  process.exit(problems.length === 0 ? 0 : 1);
}

if (problems.length === 0) {
  console.log(`\nRESULT: PASS - ${SHEETS.length} stylesheet(s) parsed as written, and ${compiled} parsed again after Tailwind generated them.\n`);
  process.exit(0);
}

console.error(`\n${problems.length} CSS problem${problems.length > 1 ? 's' : ''}:\n`);
for (const p of problems) {
  console.error(`  ${p.stage}:${p.line}`);
  console.error(`    ${p.message}\n`);
}
console.error('A selector that does not parse is dropped by `next build` with a warning');
console.error('and rejected outright by `next dev`.');
console.error('');
console.error('If the problem is in a "(generated)" stage, the offending rule is one');
console.error('Tailwind invented from something that LOOKS like a class name somewhere');
console.error('in the project - very often inside a code comment. Search the repo for');
console.error('the arbitrary value quoted above and describe it in prose instead.\n');
console.error('RESULT: FAIL\n');
process.exit(1);
