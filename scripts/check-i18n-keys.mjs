#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/*  check:i18n-keys - does every key the CODE asks for actually exist?  */
/*                                                                     */
/*  `check:messages` proves the four locales agree with each other. It  */
/*  cannot prove the code only asks for keys that exist, because it     */
/*  never reads the code — and that is a real gap, not a theoretical    */
/*  one: `/fr/faq` shipped an <h2> reading `faqPage.categories.         */
/*  documents`, the translation key itself, as the heading of a public  */
/*  section. Four green suites missed it.                              */
/*                                                                     */
/*  This walks the source, resolves each translator to its namespace    */
/*  and checks every literal key against messages/fr.json.             */
/*                                                                     */
/*  What it deliberately does NOT flag:                                */
/*   - template keys, `t(\`categories.${c}\`)` — the value comes from    */
/*     the database at runtime and cannot be known here. Those need a   */
/*     fallback in the component instead; the FAQ page has one now.     */
/*   - `t.has(...)` guards, which are the correct way to ask.           */
/*                                                                     */
/*  Usage: node scripts/check-i18n-keys.mjs [--json]                    */
/* ------------------------------------------------------------------ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ROOTS = ['src/app', 'src/components', 'src/lib'];

const messages = JSON.parse(readFileSync(path.join(ROOT, 'messages/fr.json'), 'utf8'));

const asJson = process.argv.includes('--json');

/** Does `a.b.c` resolve to a string in the message tree? */
function resolves(dotted) {
  let node = messages;
  for (const part of dotted.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return false;
    node = node[part];
  }
  return typeof node === 'string';
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.jsx?$/.test(p) && !/\.test\.js$/.test(p)) out.push(p);
  }
  return out;
}

/* `const t = await getTranslations({ locale, namespace: 'vehicle' })`
   `const t = useTranslations('common')` */
const SERVER_NS = /(?:const|let)\s+(\w+)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace:\s*['"]([^'"]+)['"]/g;
const CLIENT_NS = /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g;
/* A literal call: t('a.b'), t.raw('a.b'), t.has('a.b'), t.rich('a.b') */
const CALL = /\b(\w+)(?:\.(raw|has|rich|markup))?\(\s*'([^'\\]+)'/g;

const problems = [];
let checked = 0;

for (const rel of ROOTS) {
  const dir = path.join(ROOT, rel);
  let files;
  try {
    files = walk(dir);
  } catch {
    continue;
  }

  for (const file of files) {
    const src = readFileSync(file, 'utf8');

    /* Declarations WITH their position. The same name is routinely rebound in
       one file — `const t` is `seo.faq` inside generateMetadata and `faqPage`
       inside the component — so a call must resolve against the nearest
       PRECEDING declaration, not the last one in the file. Taking the last one
       made this script report eleven keys that all exist. */
    const declarations = [];
    for (const m of src.matchAll(SERVER_NS)) declarations.push({ at: m.index, name: m[1], ns: m[2] });
    for (const m of src.matchAll(CLIENT_NS)) declarations.push({ at: m.index, name: m[1], ns: m[2] });
    if (declarations.length === 0) continue;
    declarations.sort((a, b) => a.at - b.at);

    const namespaceAt = (name, index) => {
      let found = null;
      for (const d of declarations) {
        if (d.at > index) break;
        if (d.name === name) found = d.ns;
      }
      return found;
    };

    for (const m of src.matchAll(CALL)) {
      const [, name, method, key] = m;
      const ns = namespaceAt(name, m.index);
      if (!ns) continue;
      /* `has` is the guard, not a claim that the key exists. */
      if (method === 'has') continue;
      const dotted = `${ns}.${key}`;
      checked += 1;
      if (!resolves(dotted)) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), line, key: dotted });
      }
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ ok: problems.length === 0, checked, problems }, null, 2));
  process.exit(problems.length === 0 ? 0 : 1);
}

if (problems.length === 0) {
  console.log(`\nRESULT: PASS - ${checked} literal message keys, every one of them present in messages/fr.json.\n`);
  process.exit(0);
}

console.error(`\n${problems.length} message key(s) the code asks for and no locale defines:\n`);
for (const p of problems) console.error(`  ${p.file}:${p.line}\n    ${p.key}\n`);
console.error('next-intl renders the key path itself when it cannot resolve one,');
console.error('so each of these is a raw key on a real page.\n');
console.error('RESULT: FAIL\n');
process.exit(1);
