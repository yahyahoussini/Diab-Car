/**
 * Adapter parity (CLAUDE.md rule 12, plan 6.1).
 *
 * The demo adapter and the Supabase adapter are two implementations of one
 * interface. `npm run dev` runs on the first and production runs on the
 * second, so anything the two do differently is a bug that only shows up
 * after deploy — the worst place to find one.
 *
 * These tests exist because that class of bug already bit once: getSettings()
 * read the `settings` TABLE, which migration 0005 makes staff-only, so the
 * live site would have lost its phone number, hours and trust facts while
 * demo mode kept working perfectly.
 *
 * The Supabase adapter is checked by reading its source rather than importing
 * it: it pulls in `@/lib/supabase/server`, which imports `next/headers`, and
 * that module does not exist outside the Next runtime. A structural check is
 * enough for what is being asserted here — that the two surfaces match, and
 * that the public read targets the view.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { demoAdapter } from './demo-adapter.js';
import { getStore } from './demo-store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const supabaseSource = readFileSync(path.join(HERE, 'supabase-adapter.js'), 'utf8');

/** Method names declared on the exported adapter object (two-space indent). */
function declaredMethods(source) {
  return [...source.matchAll(/^ {2}async ([A-Za-z0-9_]+)\(/gm)].map((m) => m[1]).sort();
}

describe('adapter parity', () => {
  test('both adapters expose exactly the same methods', () => {
    const demo = Object.keys(demoAdapter).filter((k) => typeof demoAdapter[k] === 'function').sort();
    const supa = declaredMethods(supabaseSource);

    assert.ok(supa.length > 20, `sanity: expected to parse many methods, got ${supa.length}`);

    const missingInSupabase = demo.filter((m) => !supa.includes(m));
    const missingInDemo = supa.filter((m) => !demo.includes(m));

    assert.deepEqual(missingInSupabase, [], `demo has methods the Supabase adapter lacks: ${missingInSupabase.join(', ')}`);
    assert.deepEqual(missingInDemo, [], `Supabase adapter has methods demo lacks: ${missingInDemo.join(', ')}`);
  });
});

describe('settings: public vs internal', () => {
  /* The whitelist in supabase/migrations/0005 (`public_settings`) is what anon
     may read. Anything not on it must not come back from getSettings() in
     EITHER adapter, or a page that reads it works in dev and breaks in prod. */
  const INTERNAL = ['indexNowKey'];

  test('the Supabase adapter reads the VIEW, not the settings table', () => {
    const body = supabaseSource.slice(supabaseSource.indexOf('async getSettings()'), supabaseSource.indexOf('async getSettingsAdmin()'));
    assert.match(body, /from\('public_settings'\)/, 'getSettings() must query public_settings — the table is staff-only under RLS (0005)');
    assert.doesNotMatch(body, /from\('settings'\)/, 'querying the settings table as anon returns zero rows and silently empties the site');
  });

  test('the admin read goes through the session client', () => {
    const body = supabaseSource.slice(supabaseSource.indexOf('async getSettingsAdmin()'), supabaseSource.indexOf('async updateSettings('));
    assert.match(body, /writeClient\(\)/, 'the full row is staff-only, so RLS has to see the signed-in role');
    assert.match(body, /from\('settings'\)/, 'the admin needs the real row, including internal fields');
  });

  test('demo getSettings() withholds internal fields', async () => {
    const s = await demoAdapter.getSettings();
    for (const k of INTERNAL) {
      assert.ok(!(k in s), `${k} must not reach a public page — it is not in the public_settings view`);
    }
  });

  test('demo getSettingsAdmin() returns the full row', async () => {
    const full = await demoAdapter.getSettingsAdmin();
    for (const k of INTERNAL) {
      assert.ok(k in full, `${k} must be readable by staff, or the admin cannot edit it`);
    }
  });

  /* Rule 11 with teeth. In Postgres the public_settings VIEW nulls any claim
     that is not ticked as verified (0012), so no component can leak one even
     by accident. The demo adapter mirrors that gate; if it ever stops, dev
     would show a rating production hides. */
  test('an unverified claim never reaches a public read', async () => {
    const s = await demoAdapter.getSettings();
    assert.equal(s.googleRating, null, 'a rating nobody verified must not render');
    assert.equal(s.googleReviewCount, null, 'a review count nobody verified must not render');
    assert.equal(s.foundedYear, null, '« depuis 2013 » is a claim until someone checks it (plan 12.10)');
    assert.ok(!('verifiedClaims' in s), 'the flags themselves are internal');
  });

  test('ticking the box is what publishes the number', async () => {
    const store = getStore();
    const before = store.settings.verifiedClaims;
    store.settings.verifiedClaims = { googleRating: true, reviewCount: true, foundedYear: false };
    store.settings.googleRating = 4.8;
    store.settings.googleReviewCount = 214;
    try {
      const s = await demoAdapter.getSettings();
      assert.equal(s.googleRating, 4.8);
      assert.equal(s.googleReviewCount, 214);
      assert.equal(s.foundedYear, null, 'one verified claim must not carry the others');
    } finally {
      store.settings.verifiedClaims = before;
    }
  });
  test('public settings still carry what the site actually renders', async () => {
    const s = await demoAdapter.getSettings();
    /* Read by the header, the footer and the trust section. If the view ever
       drops one of these, the site goes quiet rather than erroring — which is
       exactly why it is asserted here. */
    for (const k of ['name', 'phonePrimary', 'email', 'addressLine', 'city']) {
      assert.ok(k in s, `${k} is rendered on every page and must survive the public/internal split`);
    }
    /* gaId IS public: a GA4 measurement ID ships in the HTML of every page
       that loads the tag, and the cookie banner reads it from settings. */
    assert.ok('gaId' in s, 'gaId is public by construction and the cookie banner needs it');
  });
});
