/**
 * The availability rules (plan 6.3), tested against the in-memory mirror.
 *
 * These assertions describe behaviour that must hold in BOTH implementations —
 * src/lib/data/demo-availability.js and supabase/migrations/0008. The demo is
 * what runs here because Postgres is not available to a unit test, but every
 * case below was written from the SQL, and a change to one without the other
 * should break this file.
 *
 * What this file does NOT prove: that Postgres serialises two simultaneous
 * bookings. JavaScript has no true concurrency here, so a passing test says
 * the ARITHMETIC is right, not the locking. scripts/test-concurrency.mjs
 * against a real database is what proves the locking.
 */

import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { alternatives, bookingWindow, freeUnits, nextAvailable } from './demo-availability.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A fixed clock: these tests must not drift with the wall clock. */
const T0 = Date.parse('2026-10-01T10:00:00.000Z');
const iso = (t) => new Date(t).toISOString();

let store;

beforeEach(() => {
  store = {
    vehicles: [
      { id: 'v1', slug: 'logan', brand: 'Dacia', model: 'Logan', category: 'economy', pricePerDay: 220, prepBufferMinutes: 120, minDays: 1, published: true },
      { id: 'v2', slug: 'accent', brand: 'Hyundai', model: 'Accent', category: 'economy', pricePerDay: 260, prepBufferMinutes: 120, minDays: 1, published: true },
      { id: 'v3', slug: 'tucson', brand: 'Hyundai', model: 'Tucson', category: 'suv', pricePerDay: 500, prepBufferMinutes: 120, minDays: 1, published: true },
      { id: 'v4', slug: 'hidden', brand: 'X', model: 'Y', category: 'economy', pricePerDay: 100, prepBufferMinutes: 120, minDays: 1, published: false },
    ],
    units: [
      { id: 'u1', vehicleId: 'v1', status: 'available' },
      { id: 'u2', vehicleId: 'v1', status: 'available' },
      { id: 'u3', vehicleId: 'v2', status: 'available' },
      { id: 'u4', vehicleId: 'v3', status: 'available' },
      { id: 'u5', vehicleId: 'v4', status: 'available' },
    ],
    reservations: [],
    blocks: [],
    holds: [],
    customers: [],
  };
});

describe('the prep buffer', () => {
  test('widens the requested window on both ends', () => {
    const [s, e] = bookingWindow({ prepBufferMinutes: 120 }, iso(T0), iso(T0 + DAY));
    assert.equal(s, T0 - 2 * HOUR);
    assert.equal(e, T0 + DAY + 2 * HOUR);
  });

  test('keeps a car off the market for the buffer either side of a booking', () => {
    store.reservations.push({ id: 'r1', vehicleId: 'v1', unitId: 'u1', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + DAY) });

    /* Booked 10:00 Oct 1 -> 10:00 Oct 2, buffer 2h each side on BOTH the stored
       period and the request. A request starting 3h after the return still
       collides, because 2 + 2 = 4 hours of clearance is what the exclusion
       constraint enforces. Availability has to agree with the constraint or it
       promises cars the database then refuses. */
    assert.equal(freeUnits(store, 'v1', iso(T0 + DAY + 3 * HOUR), iso(T0 + 2 * DAY)), 1, 'the second unit is still free');

    store.reservations.push({ id: 'r2', vehicleId: 'v1', unitId: 'u2', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + DAY) });
    assert.equal(freeUnits(store, 'v1', iso(T0 + DAY + 3 * HOUR), iso(T0 + 2 * DAY)), 0, 'both units are inside the buffer');

    /* Five hours clear of the return, both units are back. */
    assert.equal(freeUnits(store, 'v1', iso(T0 + DAY + 5 * HOUR), iso(T0 + 2 * DAY)), 2);
  });
});

describe('what occupies a car', () => {
  test('a pending reservation holds the car — no online payment means pending is real', () => {
    store.reservations.push({ id: 'r1', vehicleId: 'v2', unitId: null, status: 'pending', startAt: iso(T0), endAt: iso(T0 + DAY) });
    assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 0);
  });

  test('cancelled, no-show and closed reservations release it', () => {
    for (const status of ['cancelled', 'no_show', 'closed', 'returned']) {
      store.reservations = [{ id: 'r1', vehicleId: 'v2', unitId: 'u3', status, startAt: iso(T0), endAt: iso(T0 + DAY) }];
      assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 1, `${status} must not hold the car`);
    }
  });

  test('an unassigned reservation is subtracted at the model level', () => {
    store.reservations.push({ id: 'r1', vehicleId: 'v1', unitId: null, status: 'pending', startAt: iso(T0), endAt: iso(T0 + DAY) });
    assert.equal(freeUnits(store, 'v1', iso(T0), iso(T0 + DAY)), 1, 'one of the two Logans is spoken for');
  });

  test('a live hold takes a car; an expired or released one does not', () => {
    store.holds.push({ id: 'h1', vehicleId: 'v2', startAt: iso(T0), endAt: iso(T0 + DAY), expiresAt: iso(Date.now() + 5 * 60 * 1000) });
    assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 0);

    store.holds[0].expiresAt = iso(Date.now() - 1000);
    assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 1, 'an expired hold never blocks a booking, swept or not');

    store.holds[0].expiresAt = iso(Date.now() + 5 * 60 * 1000);
    store.holds[0].releasedAt = iso(Date.now());
    assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 1);
  });

  test('a unit in maintenance, blocked or out of service is not counted at all', () => {
    for (const status of ['maintenance', 'blocked', 'out_of_service']) {
      store.units = [{ id: 'u3', vehicleId: 'v2', status }];
      assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 0, `${status} is not bookable`);
    }
  });

  test('a unit out on rent today is still bookable for a later window', () => {
    store.units = [{ id: 'u3', vehicleId: 'v2', status: 'rented' }];
    assert.equal(freeUnits(store, 'v2', iso(T0 + 30 * DAY), iso(T0 + 31 * DAY)), 1, 'status describes now, the period test handles the future');
  });

  test('a unit that is both blocked and reserved is subtracted once, not twice', () => {
    store.units = [{ id: 'u3', vehicleId: 'v2', status: 'available' }];
    store.reservations.push({ id: 'r1', vehicleId: 'v2', unitId: 'u3', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + DAY) });
    store.blocks.push({ id: 'b1', unitId: 'u3', startAt: iso(T0), endAt: iso(T0 + DAY) });

    /* Double-subtracting would give -1, and a negative free count would make
       "sold out" look identical to "we lost track". */
    assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 0);
  });

  test('never returns a negative count', () => {
    store.units = [{ id: 'u3', vehicleId: 'v2', status: 'available' }];
    store.reservations.push(
      { id: 'r1', vehicleId: 'v2', unitId: null, status: 'pending', startAt: iso(T0), endAt: iso(T0 + DAY) },
      { id: 'r2', vehicleId: 'v2', unitId: null, status: 'pending', startAt: iso(T0), endAt: iso(T0 + DAY) },
    );
    assert.equal(freeUnits(store, 'v2', iso(T0), iso(T0 + DAY)), 0);
  });
});

describe('next_available', () => {
  test('returns the requested moment when the car is already free', () => {
    assert.equal(nextAvailable(store, 'v1', iso(T0)), iso(T0));
  });

  test('returns the end of the blocking period once the buffer has cleared', () => {
    store.units = [{ id: 'u3', vehicleId: 'v2', status: 'available' }];
    store.reservations.push({ id: 'r1', vehicleId: 'v2', unitId: 'u3', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + 3 * DAY) });

    /* Return at 10:00 Oct 4. The stored period already ends at 12:00 (buffer
       out), and the next request is widened backwards by another 2h, so the
       first genuinely bookable moment is 14:00 — two buffers clear of the
       return, which is exactly the clearance the exclusion constraint wants. */
    const next = nextAvailable(store, 'v2', iso(T0));
    assert.equal(next, iso(T0 + 3 * DAY + 4 * HOUR));
    assert.ok(freeUnits(store, 'v2', next, iso(Date.parse(next) + DAY)) > 0, 'and the date it returns is genuinely bookable');
  });

  test('returns null rather than inventing a date beyond the horizon', () => {
    store.units = [{ id: 'u3', vehicleId: 'v2', status: 'available' }];
    store.reservations.push({ id: 'r1', vehicleId: 'v2', unitId: 'u3', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + 200 * DAY) });
    assert.equal(nextAvailable(store, 'v2', iso(T0)), null, 'past 90 days the honest answer is "call us"');
  });
});

describe('alternatives', () => {
  beforeEach(() => {
    store.reservations.push(
      { id: 'r1', vehicleId: 'v1', unitId: 'u1', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + DAY) },
      { id: 'r2', vehicleId: 'v1', unitId: 'u2', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + DAY) },
    );
  });

  test('offers free cars in the same category, cheapest first', () => {
    const alts = alternatives(store, 'v1', iso(T0), iso(T0 + DAY));
    assert.deepEqual(alts.map((a) => a.slug), ['accent']);
  });

  test('never offers an unpublished car, a different category, or itself', () => {
    const alts = alternatives(store, 'v1', iso(T0), iso(T0 + DAY));
    assert.ok(!alts.some((a) => a.slug === 'hidden'), 'unpublished stays hidden');
    assert.ok(!alts.some((a) => a.slug === 'tucson'), 'an SUV is not an alternative to an economy car');
    assert.ok(!alts.some((a) => a.vehicleId === 'v1'), 'the sold-out car is not its own alternative');
  });

  test('offers nothing rather than something unavailable', () => {
    store.reservations.push({ id: 'r3', vehicleId: 'v2', unitId: 'u3', status: 'confirmed', startAt: iso(T0), endAt: iso(T0 + DAY) });
    assert.deepEqual(alternatives(store, 'v1', iso(T0), iso(T0 + DAY)), []);
  });
});
