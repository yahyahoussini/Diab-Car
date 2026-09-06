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
