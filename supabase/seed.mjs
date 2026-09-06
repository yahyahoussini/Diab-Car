/**
 * Seeds a Supabase project with the demo content (settings, fleet, extras, FAQ,
 * articles). Run once after schema.sql:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed.mjs
 * Uses the service-role key (server-side only, never expose it in the browser).
 */
import { createClient } from '@supabase/supabase-js';
import { seedExtras, seedFaqs, seedLocations, seedPosts, seedSeasons, seedSettings, seedVehicles } from '../src/lib/data/seed.js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const snake = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), v]));
const strip = ({ id, ...rest }) => rest; // let Postgres generate uuids

async function upsert(table, rows, conflict) {
  const { error } = await sb.from(table).upsert(rows.map((r) => snake(conflict ? strip(r) : r)), conflict ? { onConflict: conflict } : undefined);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`✓ ${table}: ${rows.length}`);
}

await upsert('settings', [{ ...seedSettings, id: 1 }]);
await upsert('vehicles', seedVehicles, 'slug');
await upsert('seasons', seedSeasons.map(strip));
await upsert('extras', seedExtras, 'key');
await upsert('locations', seedLocations, 'key');
await upsert('faqs', seedFaqs.map(strip));
await upsert('posts', seedPosts, 'slug');
console.log('Done. Sample reviews and demo bookings are intentionally not seeded.');
