'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireRole } from '@/lib/auth/server';
import { markUnitReady, setUnitStatus, upsertUnit } from '@/lib/data';

/**
 * Writes on a physical car (plan 6.2, 7.1).
 *
 * Two shapes, mirroring the RPCs in migration 0012. `save_unit` THROWS a code
 * (PLATE_TAKEN, VEHICLE_REQUIRED, INVALID_VALUE) because a rejected form is a
 * fault the operator has to fix before anything happens; `set_unit_status` and
 * `mark_unit_ready` ANSWER (`{ok:false,error:'UNIT_OUT'}`) because "this car is
 * still out with a customer" is not an exception, it is the answer. Both come
 * back from here as one result object, so the client has exactly one thing to
 * render either way.
 *
 * Editing a unit is owner/manager only — `units` RLS is
 * `has_role(['owner','manager'])`, so an agent's write would be refused by
 * Postgres anyway; refusing it here just saves the round trip. Changing a
 * status and marking a car ready are open to every admin, because closing the
 * return loop is exactly the agent's job (plan 7.2).
 *
 * « Marquer prête » ends the cleaning block, and that block is the only thing
 * keeping the car off public sale — so the public tree is revalidated too, or
 * the site would go on saying « indisponible » about a car parked in the yard.
 */

/* Mirrors the `unit_status` enum (migration 0001). Postgres refuses anything
   else; this only stops the round trip. */
const STATUSES = ['available', 'reserved', 'rented', 'returned', 'cleaning', 'maintenance', 'blocked', 'out_of_service'];

/* Supabase ids are uuids; the demo store issues readable ones like
   `u-dacia-logan-1`, and the admin has to work against both (rule 12). */
const idSchema = z.uuid().or(z.string().trim().min(1).max(64));

const unitSchema = z.object({
  id: idSchema.optional(),
  vehicleId: idSchema,
  plate: z.string().trim().min(2).max(24),
  vin: z.string().trim().max(32).optional(),
  color: z.string().trim().max(40).optional(),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  mileageKm: z.coerce.number().int().min(0).max(2_000_000).default(0),
  fuelPct: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(STATUSES).default('available'),
  currentLocationId: idSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(200).optional(),
});

const statusSchema = z.object({
  unitId: idSchema,
  status: z.enum(STATUSES),
  reason: z.string().trim().min(1).max(200),
});

const readySchema = z.object({
  unitId: idSchema,
  reason: z.string().trim().max(200).optional(),
});

/**
 * An HTML form sends `''` for every field the operator left alone. Left as is,
 * `z.coerce.number()` would read that as 0 and quietly stamp the year 0 on a
 * car — so an untouched field becomes "absent" before validation, never zero.
 */
function withoutBlanks(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (value === '' || value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function firstField(error) {
  return error?.issues?.[0]?.path?.join('.') || null;
}

/**
 * A unit write moves a car in and out of the sellable fleet, so it touches the
 * fleet screens, the return queue, the dashboard counters — and the public
 * site, which is why the whole root layout goes with it.
 */
function revalidateUnit(id) {
  for (const path of ['/admin/flotte', '/admin/flotte/unites', '/admin/operations/retours', '/admin/calendrier', '/admin']) {
    revalidatePath(path);
  }
  if (id) revalidatePath(`/admin/flotte/unites/${id}`);
  revalidatePath('/', 'layout');
}

/** Create or update one physical car. Returns the saved row on success. */
export async function saveUnit(input) {
  await requireRole(['owner', 'manager']);

  const parsed = unitSchema.safeParse(withoutBlanks(input));
  if (!parsed.success) return { ok: false, error: 'VALIDATION', field: firstField(parsed.error) };

  const { reason, ...unit } = parsed.data;
  try {
    const saved = await upsertUnit(unit, reason || null);
    revalidateUnit(saved?.id || unit.id);
    return { ok: true, unit: saved };
  } catch (err) {
    /* `.code` is the RPC's own refusal (PLATE_TAKEN, VEHICLE_REQUIRED…). A
       missing code means the round trip itself failed, which is a different
       problem and should not be dressed up as a validation message. */
    return { ok: false, error: err?.code || 'SAVE_FAILED', detail: err?.detail || null };
  }
}

/** Take a car out of service, or put it back. Always with a reason. */
export async function changeUnitStatus(input) {
  await requireAdmin();

  /* Named separately from the rest of the validation because it is the one
     refusal the operator will meet: six weeks from now somebody asks why this
     car was off the road, and the answer has to already be written down. */
  if (!String(input?.reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION', field: firstField(parsed.error) };

  const result = await setUnitStatus(parsed.data);
  if (result?.ok) revalidateUnit(parsed.data.unitId);
  return result || { ok: false, error: 'NO_ANSWER' };
}

/** The last step of the return loop: cleaning closed, car back on sale. */
export async function readyUnit(input) {
  await requireAdmin();

  const parsed = readySchema.safeParse(withoutBlanks(input));
  if (!parsed.success) return { ok: false, error: 'VALIDATION', field: firstField(parsed.error) };

  const result = await markUnitReady(parsed.data);
  if (result?.ok) revalidateUnit(parsed.data.unitId);
  return result || { ok: false, error: 'NO_ANSWER' };
}
