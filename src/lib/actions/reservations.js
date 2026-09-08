'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireRole } from '@/lib/auth/server';
import {
  assignReservationUnit,
  bookVehicle,
  getSettings,
  getVehicleBySlug,
  listExtras,
  listLocations,
  listSeasons,
  moveReservation,
  overrideReservationPrice,
  setReservationStatus,
} from '@/lib/data';
import { LOCATION_KEY_PATTERN, resolvePickup } from '@/lib/locations';
import { makeReference, quote } from '@/lib/pricing';
import { toISO } from '@/lib/format';

/**
 * Operational writes on a reservation (plan 7.1).
 *
 * Each is a thin wrapper: the STATE MACHINE, the conflict check and the audit
 * reason all live in Postgres (supabase/migrations/0010), because an admin, a
 * script and a future mobile client must all obey the same rules. These
 * functions only check who is asking and translate the answer for the UI.
 *
 * They RETURN their outcome rather than throwing, because a conflict is not an
 * exception — it is information the operator needs: which booking is in the
 * way, and between which dates.
 */

const REVALIDATE = ['/admin/reservations', '/admin/calendrier', '/admin'];

/* Rule 1: zod at the boundary. The RPCs cast their arguments, so a bad uuid
   or status would be refused anyway — but refused as a Postgres error, not as
   a sentence the operator can act on. */
const idish = z.uuid().or(z.string().min(1).max(64));
const isoish = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'not a date');
const statusSchema = z.object({
  id: idish,
  status: z.enum(['pending', 'confirmed', 'ready', 'active', 'returned', 'closed', 'cancelled', 'no_show']),
  reason: z.string().trim().max(200).optional().default(''),
});
const unitSchema = z.object({ id: idish, unitId: idish.nullable().optional().default(null), reason: z.string().trim().max(200).optional().default('') });
const moveSchema = z.object({ id: idish, startAt: isoish, endAt: isoish, reason: z.string().trim().max(200).optional().default('') });
const priceSchema = z.object({ id: idish, total: z.coerce.number().min(0).max(1000000), reason: z.string().trim().min(1).max(200) });

function invalid(parsed) {
  const fieldErrors = {};
  for (const issue of parsed.error.issues) fieldErrors[issue.path[0] || 'form'] = issue.code;
  return { ok: false, error: 'VALIDATION', fieldErrors };
}

function done() {
  for (const path of REVALIDATE) revalidatePath(path);
}

export async function changeStatus(input) {
  await requireAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { id, status, reason } = parsed.data;
  const result = await setReservationStatus({ id, status, reason });
  if (result?.ok) done();
  return result;
}

export async function assignUnit(input) {
  await requireAdmin();
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { id, unitId, reason } = parsed.data;
  const result = await assignReservationUnit({ id, unitId, reason });
  if (result?.ok) done();
  return result;
}

export async function moveDates(input) {
  await requireAdmin();
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { id, startAt, endAt, reason } = parsed.data;
  const result = await moveReservation({ id, startAt, endAt, reason });
  if (result?.ok) done();
  return result;
}

/**
 * Price override. Guarded twice on purpose: `requireRole` refuses an agent
 * before the round trip, and `can_manage_pricing()` refuses again inside the
 * function — the UI guard is convenience, the database guard is the rule
 * (plan 7.2).
 */
export async function overridePrice(input) {
  await requireRole(['owner', 'manager']);
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { id, total, reason } = parsed.data;
  const result = await overrideReservationPrice({ id, total, reason });
  if (result?.ok) done();
  return result;
}

/* ------------------------------------------------------------------ create */

const createSchema = z.object({
  vehicle: z.string().min(1).max(120),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ft: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tt: z.string().regex(/^\d{2}:\d{2}$/),
  pickup: z.string().regex(LOCATION_KEY_PATTERN),
  dropoff: z.string().regex(LOCATION_KEY_PATTERN),
  extras: z.array(z.string().max(40)).max(20).optional().default([]),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional().default(''),
  phone: z.string().trim().regex(/^\+?[\d\s().-]{8,20}$/),
  email: z.union([z.email(), z.literal('')]).optional().default(''),
  locale: z.enum(['fr', 'en', 'ar', 'es']).default('fr'),
  source: z.enum(['phone', 'whatsapp', 'walkin', 'admin']).default('walkin'),
  notes: z.string().max(1000).optional().default(''),
});

/**
 * A booking taken at the counter or on the phone (plan 7.1).
 *
 * It goes through `create_reservation()` — the SAME function the public funnel
 * uses. Staff do not get a side door around the exclusion constraint: if the
 * last car went thirty seconds ago, the counter is told so, with the dates and
 * the alternatives the database picked, exactly as a customer would be.
 *
 * The money is recomputed here from the catalogue and snapshotted, so a
 * counter booking and a web booking of the same car for the same dates carry
 * the same figures (rule 4).
 */
export async function createReservationByStaff(input) {
  await requireAdmin();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.code;
    return { ok: false, error: 'VALIDATION', fieldErrors };
  }
  const d = parsed.data;

  const startAt = toISO(d.from, d.ft);
  const endAt = toISO(d.to, d.tt);
  if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'BAD_DATES' };

  const [vehicle, settings, seasons, extras, locations] = await Promise.all([
    getVehicleBySlug(d.vehicle),
    getSettings(),
    listSeasons(),
    listExtras(),
    listLocations(),
  ]);
  if (!vehicle) return { ok: false, error: 'NOT_FOUND' };

  const q = quote({
    vehicle,
    startAt,
    endAt,
    seasons,
    extras,
    selectedExtras: d.extras.map((key) => ({ key, qty: 1 })),
    settings,
    pickupKey: resolvePickup(locations, d.pickup).feeKey,
    dropoffKey: resolvePickup(locations, d.dropoff).feeKey,
  });

  const label = (key) => {
    const { location } = resolvePickup(locations, key);
    return location?.name?.fr || key;
  };
  const locationId = (key) => resolvePickup(locations, key).location?.id || null;

  const result = await bookVehicle(
    {
      reference: makeReference(),
      vehicleId: vehicle.id,
      vehicleSlug: vehicle.slug,
      startAt,
      endAt,
      pickupLocationId: locationId(d.pickup),
      dropoffLocationId: locationId(d.dropoff),
      source: d.source,
      locale: d.locale,
      notes: d.notes,
      customer: {
        firstName: d.firstName,
        lastName: d.lastName || '-',
        phone: d.phone.replace(/[\s().-]/g, ''),
        email: (d.email || '').toLowerCase() || null,
        locale: d.locale,
      },
      quote: {
        ...q,
        currency: 'MAD',
        pickup: { key: d.pickup, label: label(d.pickup) },
        dropoff: { key: d.dropoff, label: label(d.dropoff) },
        quotedAt: new Date().toISOString(),
        takenBy: 'staff',
      },
    },
    { asStaff: true },
  );

  if (!result?.ok) {
    if (result?.error === 'SOLD_OUT') {
      return {
        ok: false,
        error: 'SOLD_OUT',
        nextAvailableAt: result.nextAvailableAt || null,
        alternatives: result.alternatives || [],
      };
    }
    return { ok: false, error: result?.error || 'SERVER' };
  }

  done();
  return { ok: true, id: result.reservation.id, reference: result.reservation.reference, total: q.total };
}
