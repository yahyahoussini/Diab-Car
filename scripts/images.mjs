#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* scripts/images.mjs - build-time car image pipeline (plan 2.5).      */
/*                                                                     */
/* Reads the masters dropped in docs/inputs/photos/<slug>/<angle>.jpg  */
/* and writes responsive AVIF + WebP variants into                     */
/* public/images/cars/<slug>/, plus a 24px blurred placeholder and a   */
/* manifest that tells the app which angles actually exist.            */
/*                                                                     */
/* Why build-time and not an image service: plan 2.5 and 9.1 - the     */
/* variants are generated ONCE so the site stays free on any host and  */
/* costs zero CPU per request on Cloudflare Workers. sharp is a        */
/* devDependency and is never imported at runtime (CLAUDE.md rule 9).  */
/*                                                                     */
/* Usage:                                                              */
/*   node scripts/images.mjs [--force] [--clean] [--slug=<slug>]       */
/*                                                                     */
/* Exit: 0 ok (including "nothing to do") - 1 a master failed to       */
/*       process - 2 sharp missing or the input tree is unreadable.    */
/* ------------------------------------------------------------------ */

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(ROOT, 'docs', 'inputs', 'photos');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'cars');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');

/** The five angles plan 2.5 asks for, in the order the gallery uses them. */
const ANGLES = ['front', 'side', 'rear', 'interior', 'dash'];

/** Delivery widths from plan 2.5. */
const WIDTHS = [480, 768, 1080, 1600, 2000];

/** Plan 2.5 budgets, checked and reported (not enforced - a warning is enough). */
const BUDGET = { heroMobileKb: 120, cardKb: 45 };

const MASTER_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const CLEAN = argv.includes('--clean');
const ONLY = (argv.find((a) => a.startsWith('--slug=')) || '').slice(7) || null;

if (argv.includes('-h') || argv.includes('--help')) {
  console.log(`
  Car image pipeline (plan 2.5).

    node scripts/images.mjs [options]

    --force         re-encode even when the output is newer than the master
    --clean         delete public/images/cars/<slug>/ trees before encoding
    --slug=<slug>   process one vehicle folder only
`);
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const kb = (bytes) => Math.round(bytes / 102.4) / 10;
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** @param {string} dir */
async function dirEntries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Find the master file for one angle, whatever its extension.
 * @param {string} dir
 * @param {string} angle
 * @returns {Promise<string|null>}
 */
async function findMaster(dir, angle) {
  for (const ext of MASTER_EXT) {
    const candidate = path.join(dir, angle + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * True when the output is missing or older than its master.
 * @param {string} out
 * @param {number} srcMtime
 */
async function isStale(out, srcMtime) {
  if (FORCE) return true;
  try {
    const s = await stat(out);
    return s.mtimeMs < srcMtime;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Encode one angle                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {import('sharp').default} sharp
 * @param {string} master  absolute path to the source image
 * @param {string} outDir  absolute path to public/images/cars/<slug>
 * @param {string} angle
 * @returns {Promise<{angle:string,width:number,height:number,blur:string,widths:number[],bytes:Record<string,number>}>}
 */
async function encodeAngle(sharp, master, outDir, angle) {
  const srcStat = await stat(master);
  const image = sharp(master, { failOn: 'error' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error(`${rel(master)}: unreadable dimensions`);

  const aspect = meta.height / meta.width;
  /* Never upscale: a 1200px master must not be blown up to 2000. */
  const widths = WIDTHS.filter((w) => w <= meta.width);
  if (widths.length === 0) widths.push(meta.width);

  const bytes = {};
  for (const w of widths) {
    for (const [fmt, opts] of [
      ['avif', { quality: 55, effort: 4 }],
      ['webp', { quality: 76, effort: 4 }],
    ]) {
      const out = path.join(outDir, `${angle}-${w}.${fmt}`);
      if (await isStale(out, srcStat.mtimeMs)) {
        await sharp(master)
          .resize({ width: w, withoutEnlargement: true })
          [fmt](opts)
          .toFile(out);
      }
      bytes[`${w}.${fmt}`] = (await stat(out)).size;
    }
  }

  /* 24px blurred placeholder, inlined as a data URI by the manifest so the
     card can paint something before the real bytes land (no extra request). */
  const blurBuf = await sharp(master).resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  const blur = `data:image/webp;base64,${blurBuf.toString('base64')}`;

  return {
    angle,
    width: meta.width,
    height: Math.round(meta.width * aspect),
    widths,
    blur,
    bytes,
  };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (error) {
    console.error(`\n  FAILED  sharp is not installed (${error?.message || error}).`);
    console.error('  Fix: npm i -D sharp\n');
    process.exit(2);
  }

  if (!existsSync(SRC_DIR)) {
    console.error(`\n  FAILED  ${rel(SRC_DIR)} does not exist.\n`);
    process.exit(2);
  }

  const folders = (await dirEntries(SRC_DIR))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => (ONLY ? name === ONLY : true))
    .sort();

  console.log('');
  console.log('  Diab Car - car image pipeline (plan 2.5)');
  console.log('  ' + '-'.repeat(64));

  if (folders.length === 0) {
    console.log(`  No vehicle folders in ${rel(SRC_DIR)}.`);
    console.log('  Drop masters as docs/inputs/photos/<slug>/{front,side,rear,interior,dash}.jpg');
    console.log('  (>= 3000 px wide, same lens height and light - see the folder README).');
    console.log('  Until then every car falls back to its category silhouette, which is');
    console.log('  what plan 13 calls a stopgap, not a launch state.');
    /* Still write an (empty) manifest so the app never has to special-case a
       missing file, and so a photo-less checkout builds identically. */
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(MANIFEST, JSON.stringify({ generatedFrom: 'docs/inputs/photos', vehicles: {} }, null, 2) + '\n', 'utf8');
    console.log(`\n  Wrote an empty ${rel(MANIFEST)}.\n`);
    return 0;
  }

  /** @type {Record<string, Record<string, object>>} */
  const vehicles = {};
  let failures = 0;
  let written = 0;

  for (const slug of folders) {
    const srcFolder = path.join(SRC_DIR, slug);
    const outFolder = path.join(OUT_DIR, slug);
    if (CLEAN) await rm(outFolder, { recursive: true, force: true });
    await mkdir(outFolder, { recursive: true });

    /** @type {Record<string, object>} */
    const angles = {};
    for (const angle of ANGLES) {
      const master = await findMaster(srcFolder, angle);
      if (!master) continue;
      try {
        const result = await encodeAngle(sharp, master, outFolder, angle);
        angles[angle] = {
          width: result.width,
          height: result.height,
          widths: result.widths,
          blur: result.blur,
          src: `/images/cars/${slug}/${angle}`,
        };
        written += result.widths.length * 2;

        const card = result.bytes['480.avif'] ?? 0;
        const hero = result.bytes['768.avif'] ?? 0;
        const flags = [];
        if (card && kb(card) > BUDGET.cardKb) flags.push(`card ${kb(card)} kB > ${BUDGET.cardKb}`);
        if (hero && kb(hero) > BUDGET.heroMobileKb) flags.push(`hero ${kb(hero)} kB > ${BUDGET.heroMobileKb}`);
        console.log(
          `  ${slug}/${angle.padEnd(9)} ${String(result.widths.length * 2).padStart(2)} files  ` +
            `480.avif ${String(kb(card)).padStart(6)} kB${flags.length ? '   ! ' + flags.join(', ') : ''}`,
        );
      } catch (error) {
        failures += 1;
        console.error(`  ${slug}/${angle}: FAILED - ${error?.message || error}`);
      }
    }

    if (Object.keys(angles).length === 0) {
      console.log(`  ${slug}: no master found for any of ${ANGLES.join(', ')} - skipped`);
      continue;
    }
    vehicles[slug] = angles;
  }

  await writeFile(
    MANIFEST,
    JSON.stringify({ generatedFrom: 'docs/inputs/photos', widths: WIDTHS, angles: ANGLES, vehicles }, null, 2) + '\n',
    'utf8',
  );

  console.log('  ' + '-'.repeat(64));
  console.log(`  ${Object.keys(vehicles).length} vehicle(s), ${written} file(s), manifest at ${rel(MANIFEST)}`);
  if (failures) console.log(`  ${failures} angle(s) failed.`);
  console.log('');
  return failures ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\n  UNEXPECTED  ${error?.stack || error}\n`);
    process.exit(2);
  });
