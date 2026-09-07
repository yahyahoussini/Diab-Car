'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { bookVehicle, getSettings, getVehicleBySlug, listExtras, listLocations, listSeasons } from '@/lib/data';
import { makeReference, quote } from '@/lib/pricing';
import { sendBookingEmails } from '@/lib/email';
import { toISO } from '@/lib/format';

const SESSION_COOKIE = 'dc_hold_session';

const schema = z.object({
  vehicle: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ft: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tt: z.string().regex(/^\d{2}:\d{2}$/),
  pickup: z.enum(['agency', 'airport', 'station', 'address']),
  dropoff: z.enum(['agency', 'airport', 'station', 'address']),
  pickupAddress: z.string().max(200).optional().default(''),
  dropoffAddress: z.string().max(200).optional().default(''),
  flightNumber: z.string().max(20).optional().default(''),
  extras: z.array(z.string()).optional().default([]),
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim().regex(/^\+?[\d\s().-]{8,20}$/),
  email: z.email(),
  country: z.string().length(2),
  age: z.coerce.number().int().min(18).max(90),
  notes: z.string().max(1000).optional().default(''),
  consent: z.literal(true),
  locale: z.enum(['fr', 'en', 'ar', 'es']).default('fr'),
  /* Present when the funnel took a hold. Optional so a direct POST still works. */
  holdId: z.string().optional(),
});

/**
 * Create a reservation (plan 6.3, 6.4).
 *
 * Rewritten onto `create_reservation()`: the decision about whether a car is
 * free is made inside Postgres, under a row lock on the vehicle, not here.
 * This action's job is to validate the human input, compute the money once,
 * and hand a payload to the database.
 *
 * Two things that must not drift:
 *
 *   - the quote is recomputed server-side from the catalogue and SNAPSHOTTED
 *     into reservations.quote. The client's preview is never trusted, and the
 *     stored copy is what the confirmation, the e-mail and the admin all read,
 *     so a later price change cannot rewrite an agreed price (rule 4).
 *   - a SOLD_OUT answer comes back with alternatives already chosen by the
 *     database. It is a normal outcome, not an error: between opening the page
 *     and pressing confirm, someone else can legitimately take the last car.
 */
export async function submitBooking(input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.code;
    return { ok: false, error: 'validation', fieldErrors };
  }
  const d = parsed.data;

  const [vehicle, settings, seasons, extras, locations] = await Promise.all([
    getVehicleBySlug(d.vehicle),
    getSettings(),
    listSeasons(),
    listExtras(),
    listLocations(),
  ]);
  if (!vehicle || vehicle.published === false) return { ok: false, error: 'vehicle' };

  const startAt = toISO(d.from, d.ft);
  const endAt = toISO(d.to, d.tt);
  if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'dates', fieldErrors: { to: 'dates' } };
  if (new Date(startAt) < new Date(Date.now() - 60 * 60 * 1000)) return { ok: false, error: 'past', fieldErrors: { from: 'past' } };

  const minAge = vehicle.minAge || settings?.minAge || 21;
  if (d.age < minAge) return { ok: false, error: 'age', fieldErrors: { age: 'age' }, minAge };

  const q = quote({
    vehicle,
    startAt,
    endAt,
    seasons,
    extras,
    selectedExtras: d.extras.map((key) => ({ key, qty: 1 })),
    settings,
    pickupKey: d.pickup,
    dropoffKey: d.dropoff,
  });

  if (q.days < (vehicle.minDays || 1)) {
    return { ok: false, error: 'min_days', minDays: vehicle.minDays || 1, days: q.days };
  }

  const label = (key, address) => {
    const loc = locations.find((l) => l.key === key);
    const base = loc?.name?.[d.locale] || loc?.name?.fr || key;
    return key === 'address' && address ? `${base}: ${address}` : base;
  };
  const locationId = (key) => locations.find((l) => l.key === key)?.id || null;

  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value || null;
  const [firstName, ...rest] = d.name.trim().split(/\s+/);

  const result = await bookVehicle({
    reference: makeReference(),
    vehicleId: vehicle.id,
    vehicleSlug: vehicle.slug,
    startAt,
    endAt,
    pickupLocationId: locationId(d.pickup),
    dropoffLocationId: locationId(d.dropoff),
    holdId: d.holdId || null,
    sessionToken,
    source: 'web',
    locale: d.locale,
    notes: d.notes,
    customer: {
      firstName,
      lastName: rest.join(' ') || '-',
      phone: d.phone.replace(/[\s().-]/g, ''),
      email: d.email.toLowerCase(),
      locale: d.locale,
    },
    /* The snapshot. Everything the customer was shown, frozen. */
    quote: {
      ...q,
      currency: 'MAD',
      pickup: { key: d.pickup, label: label(d.pickup, d.pickupAddress) },
      dropoff: { key: d.dropoff, label: label(d.dropoff, d.dropoffAddress) },
      flightNumber: d.flightNumber || null,
      driverAge: d.age,
      customerCountry: d.country.toUpperCase(),
      quotedAt: new Date().toISOString(),
    },
  });

  if (!result?.ok) {
    if (result?.error === 'SOLD_OUT') {
      return {
        ok: false,
        error: 'sold_out',
        nextAvailableAt: result.nextAvailableAt || null,
        alternatives: result.alternatives || [],
      };
    }
    return { ok: false, error: result?.error === 'NOT_FOUND' ? 'vehicle' : 'server' };
  }

  const reference = result.reservation.reference;

  /* The reservation exists whether or not the mail goes out; a mail failure
     must not tell the customer their booking did not happen. */
  try {
    await sendBookingEmails({
      booking: {
        reference,
        startAt,
        endAt,
        locale: d.locale,
        customerName: d.name,
        customerPhone: d.phone,
        customerEmail: d.email,
        pickupLabel: label(d.pickup, d.pickupAddress),
        dropoffLabel: label(d.dropoff, d.dropoffAddress),
        totalMad: q.total,
        priceBreakdown: q,
      },
      vehicle,
      settings,
    });
  } catch {
    /* Swallowed on purpose — see above. */
  }

  return { ok: true, reference, unitsFree: result.unitsFree };
}
