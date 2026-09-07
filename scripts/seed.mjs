#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* scripts/seed.mjs — load Diab Car's real inputs into Supabase.       */
/*                                                                     */
/* Reads the intake files, not the demo seed:                          */
/*   docs/inputs/fleet.csv      -> vehicles + units (from units_count) */
/*   docs/inputs/locations.csv  -> locations                           */
/*   docs/inputs/faq.csv        -> faqs                                */
/*   docs/inputs/settings.json  -> settings (generated on first run    */
/*                                 from src/lib/data/seed.js, then     */
/*                                 edited by hand / by the admin)      */
/*                                                                     */
/* IDEMPOTENT: everything upserts on a natural key (slug / plate /     */
/* faq id), so running it twice changes nothing. Rows removed from a   */
/* CSV are NOT deleted — deleting fleet data is a decision, not a      */
/* side effect of a script.                                            */
/*                                                                     */
/* Needs the SERVICE ROLE key: it writes through RLS. Server-side      */
/* only, never a NEXT_PUBLIC_ variable.                                */
/*                                                                     */
/*   node scripts/seed.mjs [--dry] [--only=vehicles,locations,faqs]    */
/* ------------------------------------------------------------------ */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = path.join(ROOT, 'docs', 'inputs');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const wants = (name) => ONLY.length === 0 || ONLY.includes(name);

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Minimal RFC-4180 row splitter: handles the quoted fields in our inputs. */
function splitRow(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function readCsv(file) {
  const text = (await readFile(path.join(INPUTS, file), 'utf8')).replace(/^﻿/, '').trim();
  const [head, ...rows] = text.split(/\r?\n/);
  const cols = splitRow(head).map((c) => c.trim());
  return rows.filter(Boolean).map((r) => Object.fromEntries(splitRow(r).map((v, i) => [cols[i], v.trim()])));
}

const TODO = (v) => !v || v.toUpperCase() === 'TODO';
const num = (v) => (TODO(v) ? null : Number(v));
const int = (v, fallback = null) => (TODO(v) ? fallback : Number.parseInt(v, 10));
const bool = (v) => (TODO(v) ? null : ['yes', 'true', '1'].includes(String(v).toLowerCase()));
const i18n = (fr, en, ar, es) => ({ fr, en: en || fr, ar: ar || fr, es: es || fr });

/* ------------------------------------------------------------------ */
/* settings.json — generated once from the committed seed              */
/* ------------------------------------------------------------------ */

async function loadSettings() {
  const file = path.join(INPUTS, 'settings.json');
  if (!existsSync(file)) {
    const { seedSettings } = await import('../src/lib/data/seed.js');
    const template = {
      _README: [
        'Generated from src/lib/data/seed.js on the first `npm run db:seed`.',
        'This file is the source of truth for the settings row from now on:',
        'edit it here (or in the admin once prompt 12 lands) and re-run the seed.',
        'Values marked UNVERIFIED in docs/inputs/facts.md must be confirmed by',
        'Diab Car before launch (CLAUDE.md rule 11).',
      ],
      ...seedSettings,
    };
    await writeFile(file, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    console.log(`  created docs/inputs/settings.json from the committed seed — edit it, then re-run.`);
    return template;
  }
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  delete parsed._README;
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DRY && (!url || !key)) {
  console.error('\n  FAILED  set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  The service-role key is server-only. Put it in .env.local, never in a NEXT_PUBLIC_ variable.\n');
  process.exit(2);
}

const sb = DRY ? null : createClient(url, key, { auth: { persistSession: false } });
const snake = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), v]));

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) { console.log(`  ${table.padEnd(12)} nothing to write`); return []; }
  if (DRY) { console.log(`  ${table.padEnd(12)} ${String(rows.length).padStart(3)} rows (dry run)`); return []; }
  const { data, error } = await sb.from(table).upsert(rows.map(snake), onConflict ? { onConflict } : undefined).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table.padEnd(12)} ${String(data.length).padStart(3)} rows`);
  return data;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n  Diab Car — seeding ${DRY ? '(dry run)' : url}\n`);

  /* ---- settings ------------------------------------------------- */
  if (wants('settings')) {
    const s = await loadSettings();
    await upsert('settings', [{ ...s, id: 1 }], 'id');
  }

  /* ---- locations ------------------------------------------------ */
  let locations = [];
  if (wants('locations')) {
    const rows = await readCsv('locations.csv');
    locations = rows.map((r, i) => ({
      slug: r.slug,
      key: r.slug,
      kind: r.kind,
      city: r.city || 'Casablanca',
      name: i18n(r.name_fr, r.name_en, r.name_ar, r.name_es),
      address: r.address || null,
      lat: num(r.lat),
      lng: num(r.lng),
      /* TODO in the CSV means "not yet known" -> null -> the UI says
         "sur devis". Never 0, which would promise free delivery. */
      deliveryFee: num(r.delivery_fee_mad),
      deliveryFeeMad: num(r.delivery_fee_mad),
      hours: TODO(r.hours) ? null : { opens: r.hours.split('-')[0], closes: r.hours.split('-')[1] },
      is24h: bool(r.is_24h),
      sort: (i + 1) * 10,
      active: true,
    }));
    await upsert('locations', locations, 'slug');
  }

  /* ---- vehicles + units ----------------------------------------- */
  if (wants('vehicles')) {
    const rows = await readCsv('fleet.csv');
    const vehicles = rows.map((r, i) => ({
      slug: r.slug,
      brand: r.brand,
      model: r.model,
      year: int(r.year, null),
      category: r.category,
      transmission: r.transmission,
      fuel: r.fuel,
      seats: int(r.seats, 5),
      doors: int(r.doors, 5),
      luggage: int(r.luggage, 2),
      ac: bool(r.ac) ?? true,
      pricePerDay: num(r.price_low_season_mad),
      priceHighSeason: num(r.price_high_season_mad),
      /* Market-derived until Diab Car confirms each one (rule 11). */
      priceVerified: false,
      deposit: num(r.deposit_mad) ?? 0,
      mileageLimit: r.km_per_day === 'unlimited' ? null : int(r.km_per_day, null),
      minDays: int(r.min_days, 1),
      prepBufferMinutes: int(r.prep_buffer_minutes, 120),
      purposeTags: (r.purpose_tags || '').split(';').map((t) => t.trim()).filter(Boolean),
      unitsCount: int(r.units_count, 1),
      photoFolder: r.photo_folder || r.slug,
      isPublished: true,
      published: true,
      sortOrder: (i + 1) * 10,
    }));
    const saved = await upsert('vehicles', vehicles, 'slug');

    /* Units: one physical car per plate, or `units_count` placeholders when no
       plate is known yet. Upserted on plate so re-running never duplicates;
       placeholder plates are deterministic for the same reason. */
    if (!DRY) {
      const bySlug = Object.fromEntries(saved.map((v) => [v.slug, v.id]));
      const units = [];
      for (const r of rows) {
        const vehicleId = bySlug[r.slug];
        if (!vehicleId) continue;
        const plates = (r.plates || '').split(';').map((p) => p.trim()).filter(Boolean);
        const count = int(r.units_count, 1) || 1;
        for (let i = 0; i < count; i += 1) {
          units.push({
            vehicleId,
            /* No real plate yet -> a stable placeholder so the unit exists and
               availability can be counted. The admin replaces it (prompt 12). */
            plate: plates[i] || `TBD-${r.slug}-${i + 1}`,
            year: int(r.year, null),
            status: 'available',
          });
        }
      }
      await upsert('units', units, 'plate');
    }
  }

  /* ---- faqs ------------------------------------------------------ */
  if (wants('faqs')) {
    const rows = await readCsv('faq.csv');
    const answered = rows.filter((r) => !TODO(r.short_answer_fr) || !TODO(r.long_answer_fr));
    const faqs = rows.map((r, i) => ({
      slug: r.id,
      category: r.category || 'general',
      citySlug: r.city_slug || null,
      question: i18n(r.question_fr),
      shortAnswer: TODO(r.short_answer_fr) ? {} : i18n(r.short_answer_fr),
      longAnswer: TODO(r.long_answer_fr) ? {} : i18n(r.long_answer_fr),
      answer: TODO(r.long_answer_fr) ? {} : i18n(r.long_answer_fr),
      sort: (i + 1) * 10,
      sortOrder: (i + 1) * 10,
      /* An unanswered question must never reach the site (rule 11). */
      isPublished: !TODO(r.short_answer_fr) && !TODO(r.long_answer_fr),
      published: !TODO(r.short_answer_fr) && !TODO(r.long_answer_fr),
    }));
    await upsert('faqs', faqs, 'slug');
    if (answered.length < rows.length) {
      console.log(`  note: ${rows.length - answered.length}/${rows.length} FAQ rows are still TODO — seeded unpublished.`);
    }
  }

  /* ---- reviews --------------------------------------------------- */
  /* Sample reviews are seeded flagged, and the site only renders them in demo
     mode. Real Google reviews are imported from the admin (plan 8.4). */
  if (wants('reviews')) {
    const { seedReviews } = await import('../src/lib/data/seed.js');
    await upsert('reviews', seedReviews.map(({ id, ...r }) => ({ ...r, isSample: true, published: false })), undefined);
  }

  console.log('\n  Done. Run supabase/migrations/0007_verify.sql to check counts and RLS.\n');
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error.message}\n`);
  process.exit(1);
});
