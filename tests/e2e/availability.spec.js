/* ------------------------------------------------------------------ */
/* /api/availability and /api/quote (plan 6.4, 9.3).                   */
/*                                                                     */
/* These run against the demo adapter — the preview server has no      */
/* Supabase env — which is exactly why the demo mirror in              */
/* demo-availability.js has to match 0008: this suite is checking the  */
/* CONTRACT (shape, validation, cache headers, privacy) that both      */
/* backends must honour.                                               */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

/** A window well clear of anything seeded. */
function window(offsetDays = 30, lengthDays = 3) {
  const start = new Date(Date.now() + offsetDays * 86400000);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + lengthDays * 86400000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

const qs = (o) => new URLSearchParams(o).toString();

test.describe('GET /api/availability', () => {
  test('valid params return priced, availability-annotated vehicles', async ({ request }) => {
    const w = window();
    const res = await request.get(`/api/availability?${qs({ ...w, pickup: 'agency' })}`);

    expect(res.status()).toBe(200);
    /* Plan 9.3: an availability answer is true for the instant it was asked
       and must never be served from a cache. */
    expect(res.headers()['cache-control']).toContain('no-store');

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.vehicles)).toBe(true);
    expect(body.vehicles.length).toBeGreaterThan(0);
    expect(body.days).toBe(3);

    const v = body.vehicles[0];
    /* Rule 4: once dates are known, per day AND total for those dates. */
    for (const field of ['slug', 'basePerDay', 'perDayEffective', 'total', 'days', 'deposit', 'unitsFree', 'unitsTotal', 'available']) {
      expect(v, `missing ${field}`).toHaveProperty(field);
    }
    expect(v.days).toBe(3);
    expect(v.total).toBeGreaterThan(0);
    expect(typeof v.available).toBe('boolean');
  });

  test('never leaks anything internal about a unit or a customer', async ({ request }) => {
    const w = window();
    const res = await request.get(`/api/availability?${qs(w)}`);
    const body = await res.json();

    /* Plan 6.5: the public sees free / last one / none and a next date.
       Plates, unit statuses, customers and reservation ids stay inside. */
    const raw = JSON.stringify(body);
    for (const leak of ['plate', 'customer', 'phone', 'unitId', 'unit_id', 'reservation', 'maintenance', 'cleaning', 'sessionToken']) {
      expect(raw.toLowerCase(), `payload contains "${leak}"`).not.toContain(leak.toLowerCase());
    }
  });

  test('rejects a missing range', async ({ request }) => {
    const res = await request.get('/api/availability');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('validation');
    expect(body.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['startAt', 'endAt']));
  });

  test('rejects an end before the start', async ({ request }) => {
    const w = window();
    const res = await request.get(`/api/availability?${qs({ startAt: w.endAt, endAt: w.startAt })}`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation');
    expect(body.issues.some((i) => i.path === 'endAt')).toBe(true);
  });

  test('rejects a date that is not a date', async ({ request }) => {
    const bad = await request.get(`/api/availability?${qs({ startAt: 'yesterday-ish', endAt: 'tomorrow' })}`);
    expect(bad.status()).toBe(400);
  });

  test('accepts a location key and rejects one that is not slug-shaped', async ({ request }) => {
    const w = window();

    /* `pickup` carries a LOCATION KEY, not a fee category — that is what the
       booking module puts in the URL (see src/lib/locations.js). An unknown but
       well-formed key is accepted and priced as the agency rather than
       rejected, because refusing it would break a link the moment a location is
       renamed, and inventing a delivery fee for it would be worse. */
    const known = await request.get(`/api/availability?${qs({ ...w, pickup: 'aeroport-mohammed-v' })}`);
    expect(known.status()).toBe(200);
    expect((await known.json()).ok).toBe(true);

    const unknown = await request.get(`/api/availability?${qs({ ...w, pickup: 'somewhere-new' })}`);
    expect(unknown.status()).toBe(200);

    /* Not slug-shaped: still refused, so the parameter cannot carry anything
       surprising into the query. */
    const malformed = await request.get(`/api/availability?${qs({ ...w, pickup: 'Not A Slug!' })}`);
    expect(malformed.status()).toBe(400);
  });

  test('filters narrow the list without changing the contract', async ({ request }) => {
    const w = window();
    const all = await (await request.get(`/api/availability?${qs(w)}`)).json();
    const autos = await (await request.get(`/api/availability?${qs({ ...w, transmission: 'automatic' })}`)).json();

    expect(autos.ok).toBe(true);
    expect(autos.vehicles.length).toBeLessThanOrEqual(all.vehicles.length);
    expect(autos.vehicles.every((v) => v.transmission === 'automatic')).toBe(true);
  });
});

test.describe('GET /api/quote', () => {
  test('returns a full breakdown whose lines add up to the total', async ({ request }) => {
    const w = window();
    const list = await (await request.get(`/api/availability?${qs(w)}`)).json();
    const slug = list.vehicles[0].slug;

    const res = await request.get(`/api/quote?${qs({ ...w, vehicle: slug, pickup: 'airport', dropoff: 'agency' })}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('no-store');

    const body = await res.json();
    expect(body.ok).toBe(true);

    const q = body.quote;
    /* Rule 4: the breakdown shown before confirmation IS the agreement, so
       the arithmetic has to be checkable by the person reading it. */
    expect(q.subtotal - q.discountAmount + q.extrasTotal + q.deliveryFee + q.oneWayFee).toBe(q.total);
    expect(q.currency).toBe('MAD');
    expect(body.availability).toHaveProperty('unitsFree');
  });

  test('404s on an unknown vehicle and 400s on a bad range', async ({ request }) => {
    const w = window();
    expect((await request.get(`/api/quote?${qs({ ...w, vehicle: 'no-such-car-here' })}`)).status()).toBe(404);
    expect((await request.get(`/api/quote?${qs({ vehicle: 'anything' })}`)).status()).toBe(400);
  });
});

test.describe('/api/cron/expire-holds', () => {
  test('refuses an unauthenticated sweep', async ({ request }) => {
    const res = await request.get('/api/cron/expire-holds');
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });
});
