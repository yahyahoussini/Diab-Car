'use server';

import { z } from 'zod';
import { createBooking, getSettings, getVehicleBySlug, listExtras, listLocations, listSeasons } from '@/lib/data';
import { makeReference, quote } from '@/lib/pricing';
import { sendBookingEmails } from '@/lib/email';
import { toISO } from '@/lib/format';

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
});

/**
 * Creates a booking request. Totals are recomputed server-side from the
 * catalogue — the client-side quote is only a preview.
 */
export async function submitBooking(input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.code;
    return { ok: false, error: 'validation', fieldErrors };
  }
  const d = parsed.data;

  const [vehicle, settings, seasons, extras, locations] = await Promise.all([getVehicleBySlug(d.vehicle), getSettings(), listSeasons(), listExtras(), listLocations()]);
  if (!vehicle || !vehicle.published) return { ok: false, error: 'vehicle' };

  const startAt = toISO(d.from, d.ft);
  const endAt = toISO(d.to, d.tt);
  if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'dates', fieldErrors: { to: 'dates' } };
  if (new Date(startAt) < new Date(Date.now() - 60 * 60 * 1000)) return { ok: false, error: 'past', fieldErrors: { from: 'past' } };
  const minAge = vehicle.minAge || settings?.minAge || 21;
  if (d.age < minAge) return { ok: false, error: 'age', fieldErrors: { age: 'age' }, minAge };

  const q = quote({ vehicle, startAt, endAt, seasons, extras, selectedExtras: d.extras.map((key) => ({ key, qty: 1 })), settings, pickupKey: d.pickup, dropoffKey: d.dropoff });
  const label = (key, address) => {
    const loc = locations.find((l) => l.key === key);
    const base = loc?.name?.[d.locale] || loc?.name?.fr || key;
    return key === 'address' && address ? `${base}: ${address}` : base;
  };

  const booking = await createBooking({
    reference: makeReference(),
    vehicleId: vehicle.id,
    status: 'pending',
    locale: d.locale,
    source: 'web',
    pickupKey: d.pickup,
    pickupLabel: label(d.pickup, d.pickupAddress),
    dropoffKey: d.dropoff,
    dropoffLabel: label(d.dropoff, d.dropoffAddress),
    startAt,
    endAt,
    days: q.days,
    flightNumber: d.flightNumber,
    extras: d.extras.map((key) => ({ key, qty: 1 })),
    customerName: d.name,
    customerPhone: d.phone.replace(/[\s().-]/g, ''),
    customerEmail: d.email.toLowerCase(),
    customerCountry: d.country.toUpperCase(),
    driverAge: d.age,
    notes: d.notes,
    priceBreakdown: q,
    totalMad: q.total,
  });

  await sendBookingEmails({ booking, vehicle, settings });
  return { ok: true, reference: booking.reference };
}
