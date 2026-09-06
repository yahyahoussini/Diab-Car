/**
 * src/lib/format.js — display formatting.
 *
 * This file imports "@/i18n/routing", so it only loads under bare Node
 * through the alias hook in scripts/test-register.mjs (see `npm test`).
 * It is therefore also the regression test for that hook.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, formatDate, formatDateTime, formatEUR, formatMAD, formatPhone, formatPhoneLocal, formatTime, slugify, toISO } from './format.js';

/** U+202F NARROW NO-BREAK SPACE — the grouping/unit separator used by format.js. */
const NNBSP = ' ';

/** Arabic-Indic and extended Arabic-Indic digits must never reach the page. */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;

describe('formatMAD', () => {
  test('groups with a narrow no-break space and appends MAD', () => {
    assert.equal(formatMAD(1250, 'fr'), `1${NNBSP}250${NNBSP}MAD`);
    assert.equal(formatMAD(650, 'fr'), `650${NNBSP}MAD`);
    assert.equal(formatMAD(1234567, 'en'), `1${NNBSP}234${NNBSP}567${NNBSP}MAD`);
  });

  test('uses the Arabic unit but keeps Latin digits', () => {
    const arabic = formatMAD(1250, 'ar');
    assert.equal(arabic, `1${NNBSP}250${NNBSP}درهم`);
    assert.ok(!NON_LATIN_DIGITS.test(arabic), 'prices stay in Latin digits in every locale');
  });

  test('withUnit:false drops the currency, and junk input rounds to 0', () => {
    assert.equal(formatMAD(1250, 'fr', { withUnit: false }), `1${NNBSP}250`);
    assert.equal(formatMAD(649.6, 'fr', { withUnit: false }), '650');
    assert.equal(formatMAD(undefined, 'fr', { withUnit: false }), '0');
    assert.equal(formatMAD('nope', 'fr', { withUnit: false }), '0');
  });
});

describe('formatEUR', () => {
  test('converts at the given rate and puts the sign where the locale wants it', () => {
    assert.equal(formatEUR(1080, 10.8, 'en'), '€100');
    assert.equal(formatEUR(1080, 10.8, 'fr'), `100${NNBSP}€`);
  });

  test('falls back to 10.8 when the rate is missing or zero', () => {
    assert.equal(formatEUR(1080, 0, 'en'), '€100');
    assert.equal(formatEUR(1080, undefined, 'en'), '€100');
  });
});

describe('date and time formatting (Africa/Casablanca, Latin digits)', () => {
  const iso = '2026-09-06T09:00:00Z'; // 10:00 in Casablanca (UTC+1)

  test('renders the Casablanca wall-clock time, 24h, in every locale', () => {
    for (const locale of ['fr', 'en', 'ar', 'es']) {
      assert.equal(formatTime(iso, locale), '10:00', `formatTime(${locale})`);
    }
  });

  test('keeps Latin digits and the right day in all four locales', () => {
    for (const locale of ['fr', 'en', 'ar', 'es']) {
      const rendered = formatDate(iso, locale);
      assert.ok(rendered.includes('2026'), `${locale}: year present in "${rendered}"`);
      assert.ok(rendered.includes('6'), `${locale}: day present in "${rendered}"`);
      assert.ok(!NON_LATIN_DIGITS.test(rendered), `${locale}: Latin digits only in "${rendered}"`);
    }
  });

  test('formatDateTime carries the time, formatDate does not', () => {
    assert.ok(formatDateTime(iso, 'fr').includes('10:00'));
    assert.ok(!formatDate(iso, 'fr').includes('10:00'));
  });

  test('an empty input renders nothing rather than "Invalid Date"', () => {
    assert.equal(formatDate('', 'fr'), '');
    assert.equal(formatDateTime(null, 'fr'), '');
    assert.equal(formatTime(undefined, 'fr'), '');
  });
});

describe('phone formatting', () => {
  test('splits a Moroccan E.164 number into international and local forms', () => {
    assert.equal(formatPhone('+212659775582'), '+212 6 59 77 55 82');
    assert.equal(formatPhoneLocal('+212659775582'), '06 59 77 55 82');
    assert.equal(formatPhone('+212 6 59 77 55 82'), '+212 6 59 77 55 82');
  });

  test('leaves anything that is not a Moroccan number untouched', () => {
    assert.equal(formatPhone('+33123456789'), '+33123456789');
    assert.equal(formatPhoneLocal(''), '');
  });
});

describe('date helpers', () => {
  test('toISO reads the date+time as Casablanca local (UTC+1)', () => {
    assert.equal(toISO('2026-09-06', '10:00'), '2026-09-06T09:00:00.000Z');
    assert.equal(toISO('2026-09-06'), '2026-09-06T09:00:00.000Z'); // default 10:00
    assert.equal(toISO(''), '');
  });

  test('addDays crosses month and leap-year boundaries', () => {
    assert.equal(addDays('2026-09-06', 3), '2026-09-09');
    assert.equal(addDays('2026-02-27', 3), '2026-03-02');
    assert.equal(addDays('2028-02-27', 3), '2028-03-01'); // 2028 is a leap year
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  });
});

describe('slugify', () => {
  test('strips accents, punctuation and edge dashes', () => {
    assert.equal(slugify('Location Voiture à Casablanca — SUV & 4x4'), 'location-voiture-a-casablanca-suv-4x4');
    assert.equal(slugify('  Aéroport Mohammed V  '), 'aeroport-mohammed-v');
    assert.equal(slugify(''), '');
  });
});
