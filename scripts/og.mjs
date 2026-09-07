#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* scripts/og.mjs — static Open Graph cards, generated at build time.  */
/*                                                                     */
/* Plan 9.3: "OG images: static per page (generated at build) instead   */
/* of a runtime image route → zero CPU per request on Workers". Every   */
/* share of a vehicle page otherwise boots satori inside a Worker, and  */
/* the card never changes between deploys.                              */
/*                                                                     */
/* HOW: by asking the running site for each card and saving the bytes,  */
/* rather than importing the renderer. src/lib/og.js is JSX, which bare */
/* Node cannot parse, and adding a JSX transform to this script would   */
/* mean a new dependency for one build step (CLAUDE.md rule 9). Driving */
/* the real route also guarantees the static card is byte-identical to  */
/* the dynamic one — there is no second implementation to drift.        */
/*                                                                     */
/* Writes public/og/<locale>/<slug>.png plus a manifest that            */
/* src/lib/seo.js imports statically, so nothing reads the filesystem   */
/* at runtime. The dynamic route stays for every page with no           */
/* pre-rendered card.                                                   */
/*                                                                     */
/* Usage:                                                              */
/*   npm run build && npx next start &                                  */
/*   node scripts/og.mjs [--base=http://localhost:3000] [--force]       */
/*                                                                     */
/* Exit: 0 ok · 1 a card failed · 2 the site is not reachable           */
/* ------------------------------------------------------------------ */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'og');

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const BASE = (argv.find((a) => a.startsWith('--base=')) || '').slice(7) || 'http://localhost:3000';

const LOCALES = ['fr', 'en', 'ar', 'es'];
const DAY = { fr: 'jour', en: 'day', ar: 'يوم', es: 'día' };

const money = (n) => `${new Intl.NumberFormat('en', { useGrouping: true }).format(Math.round(n)).replace(/,/g, ' ')} MAD`;

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { seedVehicles } = await import('../src/lib/data/seed.js');
  const messages = Object.fromEntries(
    await Promise.all(LOCALES.map(async (l) => [l, JSON.parse(await readFile(path.join(ROOT, 'messages', `${l}.json`), 'utf8'))])),
  );

  /* Fail fast and clearly if the site is not up — a half-written manifest is
     worse than none. */
  try {
    const ping = await fetch(`${BASE}/api/health`);
    if (!ping.ok) throw new Error(`health check returned ${ping.status}`);
  } catch (error) {
    console.error(`\n  CANNOT REACH ${BASE} (${error.message}).`);
    console.error('  Start the site first:  npm run build && npx next start\n');
    process.exit(2);
  }

  const published = seedVehicles.filter((v) => v.published !== false);
  console.log(`\n  Diab Car — static OG cards from ${BASE}\n  ${'-'.repeat(64)}`);

  const manifest = {};
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const locale of LOCALES) {
    await mkdir(path.join(OUT, locale), { recursive: true });
    manifest[locale] = [];

    for (const v of published) {
      const file = path.join(OUT, locale, `${v.slug}.png`);

      if (!FORCE && (await exists(file))) {
        manifest[locale].push(v.slug);
        skipped += 1;
        continue;
      }

      const q = new URLSearchParams({
        title: `${v.brand} ${v.model} ${v.year}`,
        subtitle: (v.description && (v.description[locale] || v.description.fr)) || '',
        kicker: messages[locale].common?.categories?.[v.category] || v.category,
        car: v.image || 'suv-premium',
        price: `${money(v.pricePerDay)} / ${DAY[locale]}`,
      });

      try {
        const res = await fetch(`${BASE}/${locale}/og?${q}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1000) throw new Error(`suspiciously small (${buf.length} B)`);

        await writeFile(file, buf);
        manifest[locale].push(v.slug);
        written += 1;
        console.log(`  ${`${locale}/${v.slug}.png`.padEnd(48)}${Math.round(buf.length / 102.4) / 10} kB`);
      } catch (error) {
        failed += 1;
        console.error(`  ${`${locale}/${v.slug}.png`.padEnd(48)}FAILED — ${error.message}`);
      }
    }
  }

  await writeFile(
    path.join(OUT, 'manifest.json'),
    `${JSON.stringify({ generatedBy: 'scripts/og.mjs', locales: LOCALES, vehicles: manifest }, null, 2)}\n`,
    'utf8',
  );

  console.log(`  ${'-'.repeat(64)}`);
  console.log(`  ${written} written, ${skipped} already present, ${failed} failed.`);
  console.log('  Manifest at public/og/manifest.json — rebuild so seo.js picks it up.\n');

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error?.message || error}\n`);
  process.exit(1);
});
