/**
 * Unit tests for the pricing engine (src/lib/pricing.js).
 *
 * Run by `npm test`, i.e. `node --test` over the src test glob. These files are
 * loaded by bare Node, not by Next.js, so the module under test is imported with
 * a RELATIVE path: the `@/…` alias from jsconfig.json does not exist outside the
 * bundler.
 * pricing.js is alias-free and side-effect-free, which is what makes it testable
 * this way.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { countDays, makeReference, quote, tierDiscount } from './pricing.js';

/* ------------------------------------------------------------------ */
/* Fixtures — a small, realistic Casablanca fleet + settings.          */
/* ------------------------------------------------------------------ */
const VEHICLE = { pricePerDay: 350, deposit: 5000 };

const TIERS = [
  { minDays: 3, discountPct: 5 },
  { minDays: 7, discountPct: 10 },
  { minDays: 30, discountPct: 20 },
];

const EXTRAS = [
  { key: 'gps', type: 'per_day', price: 50, name: 'GPS' },
  { key: 'child_seat', type: 'per_rental', price: 120, name: 'Child seat' },
  { key: 'old_gps', type: 'per_day', price: 99, name: 'Old GPS', active: false },
];

/* ------------------------------------------------------------------ */
/* countDays — a started 24h period counts, with a 1h grace.           */
/* ------------------------------------------------------------------ */
describe('countDays', () => {
  test('counts whole rental days across a range', () => {
    assert.equal(countDays('2026-04-10T10:00:00Z', '2026-04-13T10:00:00Z'), 3);
    assert.equal(countDays('2026-04-10T10:00:00Z', '2026-04-11T10:00:00Z'), 1);
  });

  test('grants a one-hour grace period before billing an extra day', () => {
    // +25h is still one day, +25h01 tips into the second day.
    assert.equal(countDays('2026-04-10T10:00:00Z', '2026-04-11T11:00:00Z'), 1);
    assert.equal(countDays('2026-04-10T10:00:00Z', '2026-04-11T11:01:00Z'), 2);
  });

  test('bills a minimum of one day for any forward range', () => {
    assert.equal(countDays('2026-04-10T10:00:00Z', '2026-04-10T12:00:00Z'), 1);
  });

  test('returns 0 for same-instant, reversed or unparsable ranges', () => {
    assert.equal(countDays('2026-04-10T10:00:00Z', '2026-04-10T10:00:00Z'), 0);
    assert.equal(countDays('2026-04-13T10:00:00Z', '2026-04-10T10:00:00Z'), 0);
    assert.equal(countDays('not-a-date', '2026-04-13T10:00:00Z'), 0);
  });
});

/* ------------------------------------------------------------------ */
/* tierDiscount — highest applicable long-stay tier wins.              */
/* ------------------------------------------------------------------ */
describe('tierDiscount', () => {
  test('picks the highest tier the duration reaches', () => {
    assert.equal(tierDiscount(2, TIERS), 0);
    assert.equal(tierDiscount(3, TIERS), 5);
    assert.equal(tierDiscount(45, TIERS), 20);
    assert.equal(tierDiscount(5, []), 0);
  });

  test('does not mutate the caller tier list', () => {
    const input = [...TIERS];
    tierDiscount(45, input);
    assert.deepEqual(
      input.map((t) => t.minDays),
      [3, 7, 30],
    );
  });
});

/* ------------------------------------------------------------------ */
/* quote — per-day price AND total, breakdown fully itemised.          */
/* ------------------------------------------------------------------ */
describe('quote', () => {
  test('returns the full breakdown for a plain 3-day rental', () => {
    const q = quote({
      vehicle: VEHICLE,
      startAt: '2026-04-10T10:00:00Z',
      endAt: '2026-04-13T10:00:00Z',
    });
    assert.deepEqual(q, {
      days: 3,
      basePerDay: 350,
      subtotal: 1050,
      seasonAdjustment: 0,
      discountPct: 0,
      discountAmount: 0,
      extras: [],
      extrasTotal: 0,
      deliveryFee: 0,
      deliveryOnRequest: false,
      oneWayFee: 0,
      total: 1050,
      deposit: 5000,
      perDayEffective: 350,
    });
  });

  test('zeroes every line when the range yields no days', () => {
    const q = quote({
      vehicle: VEHICLE,
      startAt: '2026-04-10T10:00:00Z',
      endAt: '2026-04-10T10:00:00Z',
    });
    assert.deepEqual(q, {
      days: 0,
      basePerDay: 350,
      subtotal: 0,
      seasonAdjustment: 0,
      discountPct: 0,
      discountAmount: 0,
      extras: [],
      extrasTotal: 0,
      deliveryFee: 0,
      oneWayFee: 0,
      total: 0,
      deposit: 5000,
      perDayEffective: 0,
    });
  });

  test('applies the season multiplier day by day, not to the whole range', () => {
    // 30 & 31 July at x1, 1 & 2 August at x1.3 => 400 + 400 + 520 + 520.
    const q = quote({
      vehicle: { pricePerDay: 400, deposit: 6000 },
      startAt: '2026-07-30T10:00:00Z',
      endAt: '2026-08-03T10:00:00Z',
      seasons: [{ startDate: '2026-08-01', endDate: '2026-08-31', multiplier: 1.3, active: true }],
    });
    assert.deepEqual(
      { days: q.days, subtotal: q.subtotal, seasonAdjustment: q.seasonAdjustment, total: q.total, perDayEffective: q.perDayEffective },
      { days: 4, subtotal: 1840, seasonAdjustment: 240, total: 1840, perDayEffective: 460 },
    );
  });

  test('ignores inactive seasons and days no season covers', () => {
    const inactive = quote({
      vehicle: { pricePerDay: 400 },
      startAt: '2026-07-30T10:00:00Z',
      endAt: '2026-08-03T10:00:00Z',
      seasons: [{ startDate: '2026-08-01', endDate: '2026-08-31', multiplier: 1.3, active: false }],
    });
    assert.deepEqual({ subtotal: inactive.subtotal, seasonAdjustment: inactive.seasonAdjustment }, { subtotal: 1600, seasonAdjustment: 0 });

    const noSeason = quote({
      vehicle: { pricePerDay: 400 },
      startAt: '2026-07-30T10:00:00Z',
      endAt: '2026-08-03T10:00:00Z',
      seasons: [{ startDate: '2026-12-01', endDate: '2026-12-31', multiplier: 1.5 }],
    });
    assert.equal(noSeason.subtotal, 1600);
  });

  test('rounds the season-adjusted subtotal to whole MAD', () => {
    // 333 x 1.15 = 382.95 -> 383.
    const q = quote({
      vehicle: { pricePerDay: 333 },
      startAt: '2026-08-05T10:00:00Z',
      endAt: '2026-08-06T10:00:00Z',
      seasons: [{ startDate: '2026-08-01', endDate: '2026-08-31', multiplier: 1.15 }],
    });
    assert.deepEqual({ subtotal: q.subtotal, seasonAdjustment: q.seasonAdjustment, perDayEffective: q.perDayEffective }, { subtotal: 383, seasonAdjustment: 50, perDayEffective: 383 });
  });

  test('prices per_day extras by duration, per_rental extras once, and drops unknown or inactive ones', () => {
    const q = quote({
      vehicle: VEHICLE,
      startAt: '2026-04-10T10:00:00Z',
      endAt: '2026-04-13T10:00:00Z',
      extras: EXTRAS,
      selectedExtras: [{ key: 'gps' }, { key: 'child_seat', qty: 2 }, { key: 'old_gps' }, { key: 'nope' }],
    });
    assert.deepEqual(q.extras, [
      { key: 'gps', qty: 1, type: 'per_day', unit: 50, total: 150, name: 'GPS' },
      { key: 'child_seat', qty: 2, type: 'per_rental', unit: 120, total: 240, name: 'Child seat' },
    ]);
    assert.deepEqual({ extrasTotal: q.extrasTotal, total: q.total, perDayEffective: q.perDayEffective }, { extrasTotal: 390, total: 1440, perDayEffective: 480 });
  });

  test('adds airport delivery and one-way fees on top of the discounted subtotal', () => {
    const q = quote({
      vehicle: { pricePerDay: 300, deposit: 4000 },
      startAt: '2026-04-01T10:00:00Z',
      endAt: '2026-04-08T10:00:00Z',
      settings: { pricingTiers: TIERS, airportDeliveryFee: 250, cityDeliveryFee: 150, oneWayFee: 400 },
      pickupKey: 'airport',
      dropoffKey: 'agency',
    });
    assert.deepEqual(
      { days: q.days, subtotal: q.subtotal, discountPct: q.discountPct, discountAmount: q.discountAmount, deliveryFee: q.deliveryFee, oneWayFee: q.oneWayFee, total: q.total, perDayEffective: q.perDayEffective },
      { days: 7, subtotal: 2100, discountPct: 10, discountAmount: 210, deliveryFee: 250, oneWayFee: 400, total: 2540, perDayEffective: 363 },
    );
  });

  test('charges city delivery for an address pickup and no one-way fee for a matching dropoff', () => {
    const settings = { airportDeliveryFee: 250, cityDeliveryFee: 150, oneWayFee: 400 };
    const address = quote({
      vehicle: VEHICLE,
      startAt: '2026-04-10T10:00:00Z',
      endAt: '2026-04-13T10:00:00Z',
      settings,
      pickupKey: 'address',
      dropoffKey: 'address',
    });
    assert.deepEqual({ deliveryFee: address.deliveryFee, oneWayFee: address.oneWayFee, total: address.total }, { deliveryFee: 150, oneWayFee: 0, total: 1200 });

    const station = quote({
      vehicle: VEHICLE,
      startAt: '2026-04-10T10:00:00Z',
      endAt: '2026-04-13T10:00:00Z',
      settings,
      pickupKey: 'station',
    });
    assert.deepEqual({ deliveryFee: station.deliveryFee, oneWayFee: station.oneWayFee }, { deliveryFee: 0, oneWayFee: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* makeReference — DC-YYMMDD-XXXX, unambiguous alphabet.               */
/* ------------------------------------------------------------------ */
describe('makeReference', () => {
  test('stamps the reference with the given date', () => {
    assert.match(makeReference(new Date('2026-04-10T12:00:00Z')), /^DC-260410-[A-HJ-NP-Z2-9]{4}$/);
  });

  test('never emits the ambiguous characters I, O, 0 or 1', () => {
    const refs = Array.from({ length: 200 }, () => makeReference(new Date('2026-04-10T12:00:00Z')).slice(-4));
    assert.equal(
      refs.every((suffix) => /^[A-HJ-NP-Z2-9]{4}$/.test(suffix)),
      true,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Deposit and the order of operations.                                */
/*                                                                     */
/* Added with the availability engine (PROMPT 06): the quote returned   */
/* here is snapshotted into reservations.quote and becomes the agreed   */
/* price, so the arithmetic below is a contract with the customer, not  */
/* an internal detail (CLAUDE.md rule 4).                              */
/* ------------------------------------------------------------------ */
describe('deposit', () => {
  test('is carried through untouched and is never discounted or prorated', () => {
    const short = quote({ vehicle: VEHICLE, startAt: '2026-05-01T10:00:00Z', endAt: '2026-05-02T10:00:00Z', settings: { pricingTiers: TIERS } });
    const long = quote({ vehicle: VEHICLE, startAt: '2026-05-01T10:00:00Z', endAt: '2026-06-10T10:00:00Z', settings: { pricingTiers: TIERS } });

    assert.equal(short.deposit, 5000);
    assert.equal(long.deposit, 5000, 'a 40-day rental at 20% off still holds the same deposit');
    assert.ok(long.discountPct > 0, 'sanity: the long rental really did earn a discount');
  });

  test('is not part of the total — it is held, not charged', () => {
    const q = quote({ vehicle: VEHICLE, startAt: '2026-05-01T10:00:00Z', endAt: '2026-05-04T10:00:00Z' });
    assert.equal(q.total, q.subtotal - q.discountAmount + q.extrasTotal + q.deliveryFee + q.oneWayFee);
    assert.ok(q.total < q.deposit + q.total, 'the deposit is reported separately from the total');
  });

  test('falls back to 0 rather than undefined when a vehicle carries no deposit', () => {
    const q = quote({ vehicle: { pricePerDay: 200 }, startAt: '2026-05-01T10:00:00Z', endAt: '2026-05-03T10:00:00Z' });
    assert.equal(q.deposit, 0);
  });
});

describe('order of operations', () => {
  test('the duration discount applies to the subtotal only — never to extras or fees', () => {
    const q = quote({
      vehicle: VEHICLE,
      startAt: '2026-05-01T10:00:00Z',
      endAt: '2026-05-08T10:00:00Z', // 7 days -> 10%
      extras: EXTRAS,
      selectedExtras: [{ key: 'child_seat', qty: 1 }],
      settings: { pricingTiers: TIERS, airportDeliveryFee: 200, oneWayFee: 300 },
      pickupKey: 'airport',
      dropoffKey: 'agency',
    });

    assert.equal(q.days, 7);
    assert.equal(q.discountPct, 10);
    assert.equal(q.subtotal, 2450);
    assert.equal(q.discountAmount, 245);
    assert.equal(q.extrasTotal, 120, 'a per_rental extra is charged once');
    assert.equal(q.deliveryFee, 200);
    assert.equal(q.oneWayFee, 300);
    /* 2450 - 245 + 120 + 200 + 300. If the discount ever reached the fees the
       total would be 2725 or lower, and the customer would be quoted less than
       the agency actually charges. */
    assert.equal(q.total, 2825);
  });

  test('perDayEffective divides the WHOLE total, one-off fees included', () => {
    const q = quote({
      vehicle: VEHICLE,
      startAt: '2026-05-01T10:00:00Z',
      endAt: '2026-05-08T10:00:00Z',
      extras: EXTRAS,
      selectedExtras: [{ key: 'child_seat', qty: 1 }],
      settings: { pricingTiers: TIERS, airportDeliveryFee: 200 },
      pickupKey: 'airport',
    });

    /* Pinned against the real formula, with fees present so the two candidate
       formulas actually differ — without extras and delivery this assertion
       would pass against either and prove nothing. */
    assert.equal(q.perDayEffective, Math.round(q.total / q.days));
    assert.notEqual(
      q.perDayEffective,
      Math.round((q.subtotal - q.discountAmount) / q.days),
      'sanity: the fees really are inside perDayEffective',
    );

    /* STATUS issue 5: this is an AVERAGE. Multiplying it back out does not
       have to reproduce the total, so the UI must never present it as a
       billable daily rate (CLAUDE.md rule 4). Pinned so nobody "fixes" it into
       a number that silently contradicts the total. */
    assert.equal(q.total, 2525); // 2450 - 245 + 120 + 200
    assert.equal(q.perDayEffective, 361); // 2525 / 7 = 360.71
    assert.notEqual(q.perDayEffective * q.days, q.total, '361 x 7 = 2527, not 2525 — an average, not a rate');
  });
});

describe('deposit by category (plan 7.1 Tarifs)', () => {
  const suv = { pricePerDay: 500, category: 'suv' };

  test('falls back to the category default when the car has none', () => {
    const q = quote({ vehicle: suv, startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-03T10:00:00Z',
      settings: { depositByCategory: { suv: 5000, economy: 2000 } } });
    assert.equal(q.deposit, 5000);
  });

  test("the car's own deposit always wins — a class change must not rewrite it", () => {
    const q = quote({ vehicle: { ...suv, deposit: 8000 }, startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-03T10:00:00Z',
      settings: { depositByCategory: { suv: 5000 } } });
    assert.equal(q.deposit, 8000);
  });

  test('no deposit configured anywhere shows 0, never an invented figure', () => {
    const q = quote({ vehicle: suv, startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-03T10:00:00Z', settings: {} });
    assert.equal(q.deposit, 0);
  });

  test('the zero-day early return carries the same deposit as a real quote', () => {
    const settings = { depositByCategory: { suv: 5000 } };
    const bad = quote({ vehicle: suv, startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-01T10:00:00Z', settings });
    assert.equal(bad.days, 0);
    assert.equal(bad.deposit, 5000);
  });
});

describe('delivery fee per place (plan 6.2)', () => {
  const settings = { airportDeliveryFee: 250, cityDeliveryFee: 150 };
  const win = { startAt: '2026-04-10T10:00:00Z', endAt: '2026-04-13T10:00:00Z' };

  test('the place own fee wins over the category default', () => {
    const q = quote({ vehicle: VEHICLE, ...win, settings, pickupKey: 'address',
      pickupLocation: { key: 'rabat', deliveryFee: 300 } });
    assert.equal(q.deliveryFee, 300);
    assert.equal(q.deliveryOnRequest, false);
  });

  test('a place with no fee falls back to its category default', () => {
    const q = quote({ vehicle: VEHICLE, ...win, settings, pickupKey: 'airport',
      pickupLocation: { key: 'aeroport-mohammed-v', deliveryFee: null } });
    assert.equal(q.deliveryFee, 250);
  });

  test('an explicit 0 is free, not unset', () => {
    const q = quote({ vehicle: VEHICLE, ...win, settings, pickupKey: 'address',
      pickupLocation: { key: 'agence', deliveryFee: 0 } });
    assert.equal(q.deliveryFee, 0);
    assert.equal(q.deliveryOnRequest, false);
  });

  test('nothing configured anywhere is sur devis, never an invented 0', () => {
    const q = quote({ vehicle: VEHICLE, ...win, settings: {}, pickupKey: 'airport',
      pickupLocation: { key: 'aeroport-mohammed-v', deliveryFee: null } });
    assert.equal(q.deliveryFee, 0, 'nothing is charged for a fee nobody set');
    assert.equal(q.deliveryOnRequest, true, 'and the page must say so rather than show 0 MAD');
  });

  /* The row shape PRODUCTION actually produces. Every test above hands
     `quote()` a hand-built object with a single `deliveryFee` key, and on that
     shape `deliveryFee ?? deliveryFeeMad` is `null ?? undefined` = undefined,
     which is correctly read as "unset". A row off the wire carries BOTH keys,
     both null — and then the coalesce yields null, `Number(null)` is 0, and an
     unpriced destination silently became a free one. Every green test in this
     file missed it because none of them used a real row. */
  test('a real row with both fee columns null is sur devis, not free', () => {
    const row = { key: 'ain-diab', kind: 'district', fee: 0, deliveryFee: null, deliveryFeeMad: null };
    const q = quote({ vehicle: VEHICLE, ...win, settings: {}, pickupKey: 'address', pickupLocation: row });
    assert.equal(q.deliveryOnRequest, true, 'an unpriced district must be quoted by hand');
    assert.equal(q.deliveryFee, 0, 'and nothing is charged for it');
  });

  test('a real row still takes its category default when one exists', () => {
    const row = { key: 'aeroport-mohammed-v', kind: 'airport', fee: 0, deliveryFee: null, deliveryFeeMad: null };
    const q = quote({ vehicle: VEHICLE, ...win, settings, pickupKey: 'airport', pickupLocation: row });
    assert.equal(q.deliveryFee, 250);
    assert.equal(q.deliveryOnRequest, false);
  });

  test('collecting at the agency is never a delivery, whatever the city default is', () => {
    const q = quote({ vehicle: VEHICLE, ...win, settings, pickupKey: 'agency' });
    assert.equal(q.deliveryFee, 0);
    assert.equal(q.deliveryOnRequest, false);
  });

  test('a station keeps costing nothing, as it did before places had fees', () => {
    const q = quote({ vehicle: VEHICLE, ...win, settings, pickupKey: 'station' });
    assert.equal(q.deliveryFee, 0, 'the city default must not leak onto an unpriced category');
  });

  test('the snake_case key from Postgres is accepted too', () => {
    const q = quote({ vehicle: VEHICLE, ...win, settings, pickupKey: 'address',
      pickupLocation: { key: 'marrakech', deliveryFeeMad: 500 } });
    assert.equal(q.deliveryFee, 500);
  });
});
