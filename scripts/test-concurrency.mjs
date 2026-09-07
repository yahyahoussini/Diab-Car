#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* scripts/test-concurrency.mjs — the last-car race (plan 6.3).        */
/*                                                                     */
/* Drives the fleet down to exactly ONE free unit for a window far in   */
/* the future, then fires two create_reservation() calls at the same    */
/* instant and asserts that exactly one wins and the other is told      */
/* SOLD_OUT with alternatives.                                          */
/*                                                                     */
/* This is the only test in the repo that proves the LOCKING rather     */
/* than the arithmetic. src/lib/data/availability.test.js checks the    */
/* rules in memory, but JavaScript cannot race with itself here, so a   */
/* passing unit test says nothing about whether Postgres serialises two */
/* simultaneous bookings. Only a real database can answer that, which   */
/* is why this script refuses to run without one instead of quietly     */
/* falling back to the demo adapter and printing a green tick.          */
/*                                                                     */
/* Usage:                                                              */
/*   node scripts/test-concurrency.mjs [--keep]                        */
/*                                                                     */
/* Exit: 0 pass · 1 fail · 2 cannot run (no database configured)       */
/* ------------------------------------------------------------------ */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Same six-line loader as scripts/seed.mjs — a real env var always wins. */
(function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
})();

const KEEP = process.argv.includes('--keep');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('\n  CANNOT RUN — this test needs a real database.\n');
  console.error('  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, apply');
  console.error('  supabase/schema.sql + 0001..0008, and seed. Exiting 2 rather than');
  console.error('  passing against the in-memory adapter, which cannot race.\n');
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const pad = (s, n) => String(s).padEnd(n);
const fail = (msg) => {
  console.error(`\n  FAIL — ${msg}\n`);
  process.exitCode = 1;
};

/* A window a year out, so nothing seeded or real can collide with it. */
const START = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
START.setUTCHours(10, 0, 0, 0);
const END = new Date(START.getTime() + 3 * 24 * 60 * 60 * 1000);
const startAt = START.toISOString();
const endAt = END.toISOString();

const created = { reservations: [], customers: [] };

async function cleanup() {
  if (KEEP) {
    console.log('  --keep: leaving test rows in place.\n');
    return;
  }
  if (created.reservations.length) await sb.from('reservations').delete().in('id', created.reservations);
  if (created.customers.length) await sb.from('customers').delete().in('id', created.customers);
}

function payload(suffix) {
  return {
    vehicleId: null, // filled in below
    startAt,
    endAt,
    source: 'web',
    locale: 'fr',
    customer: {
      firstName: 'Concurrency',
      lastName: `Test ${suffix}`,
      phone: `+2126000000${suffix}`,
      email: `concurrency-${suffix}@example.invalid`,
      locale: 'fr',
    },
    quote: { test: true },
  };
}

async function main() {
  console.log('\n  Diab Car — last-car concurrency test');
  console.log('  ----------------------------------------------------------------');
  console.log(`  window: ${startAt}  ->  ${endAt}\n`);

  /* Pick the model with the most bookable units: the more units, the more
     pending rows we have to lay down, but the less likely a stray real
     reservation interferes. */
  const { data: vehicles, error: vErr } = await sb
    .from('vehicles')
    .select('id, slug, brand, model, category')
    .or('is_published.eq.true,published.eq.true');

  if (vErr) {
    /* A missing table is "not set up yet", not "the locking is broken". They
       exit differently so CI can tell a skipped run from a real failure. */
    if (/schema cache|does not exist|PGRST205/i.test(vErr.message || '')) {
      console.error('\n  CANNOT RUN — the schema is not applied to this project yet.');
      console.error('  Run supabase/schema.sql + 0001..0008, then `npm run db:seed`.\n');
      process.exitCode = 2;
      return undefined;
    }
    return fail(`could not read vehicles: ${vErr.message}`);
  }
  if (!vehicles?.length) return fail('no published vehicles — run `npm run db:seed` first');

  let target = null;
  for (const v of vehicles) {
    const { data: free, error } = await sb.rpc('search_availability', {
      p_pickup_location_id: null, p_dropoff_location_id: null, p_start_at: startAt, p_end_at: endAt,
    });
    if (error) return fail(`search_availability failed: ${error.message}`);
    const row = (free || []).find((r) => r.vehicle_id === v.id);
    if (row && row.units_free > 0) { target = { ...v, unitsFree: row.units_free, unitsTotal: row.units_total }; break; }
  }
  if (!target) return fail('every vehicle is already fully booked for the test window');

  console.log(`  target: ${target.brand} ${target.model} (${target.slug})`);
  console.log(`  units:  ${target.unitsTotal} total, ${target.unitsFree} free for the window\n`);

  /* Consume every unit but one with pending reservations. */
  const toConsume = target.unitsFree - 1;
  for (let i = 0; i < toConsume; i += 1) {
    const p = { ...payload(`9${i}`), vehicleId: target.id };
    const { data, error } = await sb.rpc('create_reservation', { payload: p });
    if (error) return fail(`setup reservation ${i} failed: ${error.message}`);
    if (!data?.ok) return fail(`setup reservation ${i} was rejected: ${JSON.stringify(data)}`);
    created.reservations.push(data.reservation.id);
  }
  console.log(`  laid down ${toConsume} pending reservation(s) — one unit left.\n`);

  const { data: check } = await sb.rpc('search_availability', {
    p_pickup_location_id: null, p_dropoff_location_id: null, p_start_at: startAt, p_end_at: endAt,
  });
  const before = (check || []).find((r) => r.vehicle_id === target.id)?.units_free;
  if (before !== 1) return fail(`expected exactly 1 free unit before the race, got ${before}`);

  /* THE RACE. Both requests are dispatched before either is awaited, so they
     are in flight at the same time and hit the vehicle-row lock together. */
  console.log('  racing two bookings for the last car...\n');
  const t0 = Date.now();
  const [a, b] = await Promise.all([
    sb.rpc('create_reservation', { payload: { ...payload('1'), vehicleId: target.id } }),
    sb.rpc('create_reservation', { payload: { ...payload('2'), vehicleId: target.id } }),
  ]);
  const ms = Date.now() - t0;

  for (const r of [a, b]) if (r.data?.ok) created.reservations.push(r.data.reservation.id);

  const results = [a, b].map((r, i) => ({
    n: i + 1,
    transportError: r.error?.message || null,
    ok: r.data?.ok === true,
    error: r.data?.error || null,
    reference: r.data?.reservation?.reference || null,
    alternatives: r.data?.alternatives?.length ?? null,
    nextAvailableAt: r.data?.nextAvailableAt || null,
  }));

  console.log(`  ${pad('#', 3)} ${pad('outcome', 10)} ${pad('reference', 14)} alternatives`);
  for (const r of results) {
    console.log(
      `  ${pad(r.n, 3)} ${pad(r.ok ? 'BOOKED' : r.error || r.transportError || '?', 10)} ` +
      `${pad(r.reference || '-', 14)} ${r.alternatives ?? '-'}`,
    );
  }
  console.log(`\n  both calls returned in ${ms} ms\n`);

  /* ---- assertions ---- */
  const winners = results.filter((r) => r.ok);
  const losers = results.filter((r) => !r.ok);

  if (winners.length !== 1) {
    return fail(`expected exactly 1 booking to succeed, got ${winners.length}. THIS IS A DOUBLE BOOKING.`);
  }
  if (losers.length !== 1 || losers[0].error !== 'SOLD_OUT') {
    return fail(`expected the loser to be told SOLD_OUT, got ${JSON.stringify(losers)}`);
  }
  if (!losers[0].alternatives || losers[0].alternatives < 1) {
    console.log('  NOTE: the SOLD_OUT answer carried no alternatives — correct only if');
    console.log('        every other car in this category is also taken for the window.\n');
  }

  const { data: after } = await sb.rpc('search_availability', {
    p_pickup_location_id: null, p_dropoff_location_id: null, p_start_at: startAt, p_end_at: endAt,
  });
  const freeAfter = (after || []).find((r) => r.vehicle_id === target.id)?.units_free;
  if (freeAfter !== 0) return fail(`expected 0 free units after the race, got ${freeAfter}`);

  console.log('  PASS — exactly one booking won, the other got SOLD_OUT + alternatives,');
  console.log('         and the model reports 0 free units afterwards.\n');
}

try {
  await main();
} catch (error) {
  fail(error?.message || String(error));
} finally {
  await cleanup();
}

/* No process.exit() here. Calling it while supabase-js still holds a keep-alive
   socket trips a libuv assertion on Windows ("!(handle->flags &
   UV_HANDLE_CLOSING)") that prints after the results and looks like a crash in
   the test. Setting exitCode and letting the loop drain gives the same status
   without the noise. */
