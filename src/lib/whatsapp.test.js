/**
 * Unit tests for the WhatsApp deep-link builder (src/lib/whatsapp.js).
 *
 * Loaded by bare Node (`node --test`), not by Next.js, so the module under test
 * is imported with a RELATIVE path — the `@/…` alias only exists in the bundler.
 * whatsapp.js is alias-free and side-effect-free, which is what makes it
 * testable here; it is also the only pure module that carries all four locales,
 * so it doubles as the 4-language regression guard (fr / en / ar / es + fallback).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { bookingFollowUpMessage, genericMessage, vehicleInquiryMessage, whatsappLink } from './whatsapp.js';

const RENTAL = { vehicleName: 'Dacia Logan', from: '2026-04-10', to: '2026-04-13', pickup: 'Aeroport Mohammed V' };
const REFERENCE = 'DC-260410-K7QM';

/* ------------------------------------------------------------------ */
/* whatsappLink — wa.me wants bare digits, message percent-encoded.    */
/* ------------------------------------------------------------------ */
describe('whatsappLink', () => {
  test('strips every non-digit from the number', () => {
    assert.equal(whatsappLink('+212 6 59 77 55 82'), 'https://wa.me/212659775582');
  });

  test('percent-encodes the prefilled message', () => {
    assert.equal(
      whatsappLink('+212659775582', 'Hello Diab Car, I have a question.'),
      'https://wa.me/212659775582?text=Hello%20Diab%20Car%2C%20I%20have%20a%20question.',
    );
  });

  test('omits the query string when there is no message and tolerates a missing number', () => {
    assert.equal(whatsappLink('+212659775582', ''), 'https://wa.me/212659775582');
    assert.equal(whatsappLink(), 'https://wa.me/');
  });
});

/* ------------------------------------------------------------------ */
/* vehicleInquiryMessage — one sentence per locale, fr is the fallback.*/
/* ------------------------------------------------------------------ */
describe('vehicleInquiryMessage', () => {
  test('builds the French sentence with dates and pick-up point', () => {
    assert.equal(
      vehicleInquiryMessage('fr', RENTAL),
      'Bonjour Diab Car, je souhaite réserver la Dacia Logan 2026-04-10 → 2026-04-13, prise en charge : Aeroport Mohammed V. Est-elle disponible ?',
    );
  });

  test('builds the English and Spanish sentences', () => {
    assert.equal(
      vehicleInquiryMessage('en', RENTAL),
      'Hello Diab Car, I would like to book the Dacia Logan 2026-04-10 → 2026-04-13, pick-up: Aeroport Mohammed V. Is it available?',
    );
    assert.equal(
      vehicleInquiryMessage('es', RENTAL),
      'Hola Diab Car, me gustaría reservar el Dacia Logan 2026-04-10 → 2026-04-13, recogida: Aeroport Mohammed V. ¿Está disponible?',
    );
  });

  test('greets in Arabic and keeps the vehicle name untranslated', () => {
    const ar = vehicleInquiryMessage('ar', RENTAL);
    assert.equal(ar.startsWith('مرحباً دياب كار،'), true);
    assert.equal(ar.includes('Dacia Logan'), true);
  });

  test('drops the date range unless both ends are known, and the pick-up when absent', () => {
    assert.equal(vehicleInquiryMessage('fr', { vehicleName: 'Dacia Logan' }), 'Bonjour Diab Car, je souhaite réserver la Dacia Logan. Est-elle disponible ?');
    assert.equal(vehicleInquiryMessage('fr', { vehicleName: 'Dacia Logan', from: '2026-04-10' }), 'Bonjour Diab Car, je souhaite réserver la Dacia Logan. Est-elle disponible ?');
  });

  test('falls back to French for an unknown locale', () => {
    assert.equal(vehicleInquiryMessage('de', RENTAL), vehicleInquiryMessage('fr', RENTAL));
  });
});

/* ------------------------------------------------------------------ */
/* genericMessage / bookingFollowUpMessage                             */
/* ------------------------------------------------------------------ */
describe('genericMessage', () => {
  test('is localized, with French as the fallback', () => {
    assert.equal(genericMessage('en'), 'Hello Diab Car, I have a question about a car rental in Casablanca.');
    assert.equal(genericMessage('zz'), 'Bonjour Diab Car, j’ai une question concernant une location de voiture à Casablanca.');
  });
});

describe('bookingFollowUpMessage', () => {
  test('quotes the booking reference in the requested locale', () => {
    assert.equal(bookingFollowUpMessage('es', REFERENCE), `Hola Diab Car, acabo de enviar la solicitud de reserva ${REFERENCE}. ¿Pueden confirmar la disponibilidad?`);
  });

  test('falls back to French and still quotes the reference', () => {
    assert.equal(bookingFollowUpMessage('nl', REFERENCE), `Bonjour Diab Car, je viens d’envoyer la demande de réservation ${REFERENCE}. Pouvez-vous confirmer la disponibilité ?`);
  });
});

/* ------------------------------------------------------------------ */
/* Regression: STATUS issue 4 — calling this with no rental produced   */
/* "je souhaite réserver la undefined", because a `= {}` default only  */
/* fires when the whole argument is missing, not when a field is.      */
/* Also covers the price line added for the vehicle page (plan 4.6).   */
/* ------------------------------------------------------------------ */
describe('vehicleInquiryMessage — missing data and price', () => {
  test('never interpolates undefined when no vehicle is given', () => {
    for (const locale of ['fr', 'en', 'ar', 'es']) {
      const msg = vehicleInquiryMessage(locale);
      assert.ok(!msg.includes('undefined'), `${locale} must not say "undefined": ${msg}`);
      assert.ok(msg.length > 20, `${locale} must still be a real sentence`);
    }
    /* And the article does not survive without a model to attach it to. */
    assert.ok(!vehicleInquiryMessage('fr').includes('la une voiture'));
    assert.ok(!vehicleInquiryMessage('es').includes('el un coche'));
  });

  test('carries the quoted price so staff can answer without re-quoting', () => {
    const msg = vehicleInquiryMessage('fr', { vehicleName: 'Dacia Logan', price: '660 MAD' });
    assert.match(msg, /prix affiché : 660 MAD/);
    assert.match(vehicleInquiryMessage('en', { vehicleName: 'Dacia Logan', price: '660 MAD' }), /price shown: 660 MAD/);
  });

  test('omits the price clause entirely when there is no quote', () => {
    const msg = vehicleInquiryMessage('fr', { vehicleName: 'Dacia Logan' });
    assert.ok(!msg.includes('prix affiché'));
  });
});
