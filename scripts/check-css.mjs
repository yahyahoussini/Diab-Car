#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/*  check:css - does the stylesheet actually parse?                    */
/*                                                                     */
/*  Written after a real bug. src/styles/globals.css carried this:     */
/*                                                                     */
/*    [dir="rtl"] .motion-safe:animate-[button-sweep_1.1s_var(...)] {  */
/*      animation-direction: reverse;                                  */
/*    }                                                                */
/*                                                                     */
/*  A Tailwind class name written straight into a selector, unescaped. */
/*  CSS reads `:animate-` as a pseudo-class and `[button-sweep_1.1s…]` */
/*  as an attribute selector, so the rule is not merely wrong - it is  */
/*  not CSS. `next build` demoted it to a warning nobody reads and     */
/*  dropped the rule; `next dev` refused the stylesheet with a full    */
/*  error overlay. In between, the RTL mirroring it existed to perform */
/*  had never once applied (plan 4.12).                                */
/*                                                                     */
/*  Lightning CSS is what Turbopack parses CSS with, and it already    */
/*  ships inside Tailwind v4 - so this costs no dependency and fails   */
/*  on exactly what the build would have shrugged at.                  */
/*                                                                     */
/*  Tailwind's own at-rules (@theme, @utility, @custom-variant,        */
/*  @apply, @source, @plugin, @variant) are compiled away before       */
/*  Lightning CSS sees them in the real pipeline, so parsing the raw   */
/*  source reports them as unknown. Those are expected and ignored;    */
/*  anything else is a defect.                                         */
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

/** At-rules Tailwind owns and removes before the CSS reaches a parser. */
const TAILWIND_AT_RULES = new Set(['theme', 'utility', 'custom-variant', 'variant', 'apply', 'source', 'plugin', 'config', 'reference']);

const UNKNOWN_AT_RULE = /^Unknown at rule: @([\w-]+)$/;

const asJson = process.argv.includes('--json');

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/check-css.mjs [--json]\n\nParses every stylesheet with Lightning CSS and fails on any\nwarning that is not one of Tailwind\'s own at-rules.');
  process.exit(0);
}

const problems = [];

for (const rel of SHEETS) {
  const file = path.join(ROOT, rel);
  let code;
  try {
    code = readFileSync(file);
  } catch (error) {
    problems.push({ file: rel, line: 0, message: `unreadable: ${error.message}` });
    continue;
  }

  let result;
  try {
    /* errorRecovery keeps parsing after the first bad rule, so one typo
       does not hide the next one. */
    result = transform({ filename: rel, code, errorRecovery: true });
  } catch (error) {
    /* A syntax error Lightning CSS cannot recover from at all. */
    problems.push({ file: rel, line: error.loc?.line ?? 0, message: error.message });
    continue;
  }

  for (const warning of result.warnings ?? []) {
    const match = UNKNOWN_AT_RULE.exec(warning.message);
    if (match && TAILWIND_AT_RULES.has(match[1])) continue;
    problems.push({ file: rel, line: warning.loc?.line ?? 0, message: warning.message });
  }
}

if (asJson) {
  console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  process.exit(problems.length === 0 ? 0 : 1);
}

const sheets = SHEETS.length;
if (problems.length === 0) {
  console.log(`\nRESULT: PASS - ${sheets} stylesheet${sheets > 1 ? 's' : ''} parsed by Lightning CSS with no unexpected warning.\n`);
  process.exit(0);
}

console.error(`\n${problems.length} CSS problem${problems.length > 1 ? 's' : ''}:\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}`);
  console.error(`    ${p.message}\n`);
}
console.error('A selector that does not parse is silently dropped by `next build`');
console.error('and rejected outright by `next dev`. Escape Tailwind class names');
console.error('(\\:, \\[, \\], \\.) or, better, give the element a real class.\n');
console.error('RESULT: FAIL\n');
process.exit(1);
