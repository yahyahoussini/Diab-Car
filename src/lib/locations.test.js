/**
 * Unit tests for src/lib/locations.js.
 *
 * Bare Node, so the module under test is imported by relative path — it has no
 * imports of its own, which is what makes it testable this way.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { deliveryFeeOf, resolvePickup } from './locations.js';

describe('deliveryFeeOf — a zero in the legacy column is not a price', () => {
  /* The exact shape of the live table on 2026-09-09: the agency is a true 0,
     every place the owner has not priced yet is `fee = 0` (the starter
     column's default) with `delivery_fee_mad` still null. Read naively, all
     eight answered « gratuit ». */
  const LIVE = [
    { key: 'agence-zerktouni', kind: 'agency', fee: 0, deliveryFeeMad: 0 },
    { key: 'aeroport-mohammed-v', kind: 'airport', fee: 0, deliveryFeeMad: null },
    { key: 'ain-diab', kind: 'district', fee: 0, deliveryFeeMad: null },
  ];

  test('an unpriced place is « sur devis », not free', () => {
    assert.equal(deliveryFeeOf(LIVE[1]), null);
    assert.equal(deliveryFeeOf(LIVE[2]), null);
  });

  test('the agency really is free, and says so', () => {
    assert.equal(deliveryFeeOf(LIVE[0]), 0);
  });

  test('the admin figure wins, including when it is zero', () => {
    assert.equal(deliveryFeeOf({ fee: 300, deliveryFeeMad: 0 }), 0);
    assert.equal(deliveryFeeOf({ fee: 0, deliveryFeeMad: 300 }), 300);
  });

  test('a real legacy fee is still honoured until the column is dropped', () => {
    assert.equal(deliveryFeeOf({ fee: 250, deliveryFeeMad: null }), 250);
  });

  test('reads the snake_case column too, so a raw row works', () => {
    assert.equal(deliveryFeeOf({ fee: 0, delivery_fee_mad: 400 }), 400);
    assert.equal(deliveryFeeOf({ fee: 0, delivery_fee_mad: null }), null);
  });

  /* The helper is read on two shapes: the RAW row inside the adapter, and the
     already-aliased location everywhere downstream. Missing `deliveryFee` here
     made an explicit free place look unset and charged it the city default. */
  test('reads the resolved camelCase alias, including an explicit free 0', () => {
    assert.equal(deliveryFeeOf({ deliveryFee: 0 }), 0);
    assert.equal(deliveryFeeOf({ deliveryFee: 300, deliveryFeeMad: null, fee: 0 }), 300);
    assert.equal(deliveryFeeOf({ deliveryFee: null, deliveryFeeMad: null, fee: 0 }), null);
  });

  test('a row with nothing at all is sur devis rather than 0', () => {
    assert.equal(deliveryFeeOf({}), null);
    assert.equal(deliveryFeeOf(undefined), null);
  });
});

describe('resolvePickup', () => {
  const locations = [
    { id: 'l1', key: 'agence-zerktouni', slug: 'agence-zerktouni', kind: 'agency' },
    { id: 'l2', key: 'aeroport-mohammed-v', slug: 'aeroport-mohammed-v', kind: 'airport' },
    { id: 'l3', key: 'ain-diab', slug: 'ain-diab', kind: 'district' },
  ];

  test('a location key resolves to its row and its fee category', () => {
    assert.equal(resolvePickup(locations, 'aeroport-mohammed-v').feeKey, 'airport');
    assert.equal(resolvePickup(locations, 'ain-diab').feeKey, 'address');
    assert.equal(resolvePickup(locations, 'agence-zerktouni').location.id, 'l1');
  });

  test('an unknown value is the agency, never an invented delivery charge', () => {
    assert.equal(resolvePickup(locations, 'nowhere').feeKey, 'agency');
    assert.equal(resolvePickup(locations, undefined).feeKey, 'agency');
  });

  test('"somewhere else" is priced as a delivery to an address', () => {
    assert.equal(resolvePickup(locations, 'autre-adresse').feeKey, 'address');
  });
});
