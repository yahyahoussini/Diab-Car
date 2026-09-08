'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/server';
import { completePickup, completeReturn } from '@/lib/data';

/**
 * Départ and retour — the two writes that close the rental loop (plan 7.1).
 *
 * Both are one RPC (`complete_pickup` / `complete_return`, migration 0012):
 * the event, the reservation status, the unit status, the damages and — on a
 * return — the cleaning block that takes the car off sale all commit together
 * or not at all. Nothing here re-implements any of that; this file checks who
 * is asking, refuses anything the form should never have sent, and hands the
 * database answer back for the checklist to render.
 *
 * `requireAdmin`, not `requireRole(['owner','manager'])`, on purpose: plan 7.2
 * gives an `agent` the pickup and return checklists explicitly. The payment
 * block below records what was taken at the counter, which is bookkeeping, not
 * pricing — an agent may write it, and `can_manage_pricing()` still guards the
 * tariffs and the price override elsewhere.
 */

/* Ids are uuids in Supabase and readable strings in the demo store, so the
   shape is validated but the flavour is not (same union as customers.js). */
const idish = z.uuid().or(z.string().trim().min(1).max(64));

/* A Storage object key we produced ourselves in `@/lib/images/browser` —
   `<reservationId>/<kind>-<token>.<ext>`. Anything with a `..` segment, a
   scheme or a space never came from there. */
const storagePath = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'CHEMIN_INVALIDE')
  .refine((p) => !p.includes('..'), 'CHEMIN_INVALIDE');

const photos = z.array(storagePath).max(24).optional().default([]);

/* The condition map's vocabulary. It is repeated here rather than imported
   from ConditionMap because that file is `'use client'` — a server module
   importing it would receive a client reference, not the array — and a
   `'use server'` file may only export async functions, so the constant cannot
   live here either. If a zone is added there, add it here. */
const ZONES = [
  'capot', 'pare-brise', 'toit', 'coffre',
  'aile-avant-gauche', 'aile-avant-droite',
  'porte-avant-gauche', 'porte-avant-droite',
  'porte-arriere-gauche', 'porte-arriere-droite',
  'aile-arriere-gauche', 'aile-arriere-droite',
  'pare-chocs-avant', 'pare-chocs-arriere',
  'roue-avant-gauche', 'roue-avant-droite',
  'roue-arriere-gauche', 'roue-arriere-droite',
  'interieur',
];

const damage = z.object({
  zone: z.enum(ZONES),
  type: z.enum(['rayure', 'bosse', 'eclat', 'fissure', 'manquant', 'sale', 'autre']),
  severity: z.enum(['mineur', 'moyen', 'majeur']),
  notes: z.string().trim().max(500).optional().default(''),
  photos: z.array(storagePath).max(8).optional().default([]),
});

/* `condition` is the map's summary, stored as jsonb next to the event so the
   dossier can draw the car again without replaying every damage row.
   The key schema is a plain string with a membership check rather than
   `z.record(z.enum(ZONES), …)`, because a record keyed by an enum is
   EXHAUSTIVE in zod 4 — it would demand all nineteen zones on a car with one
   scratch. */
const condition = z
  .object({
    zones: z
      .record(
        z.string().trim().min(1).max(40),
        z.object({ count: z.number().int().min(0).max(20), severity: z.enum(['mineur', 'moyen', 'majeur']) }),
      )
      .refine((zones) => Object.keys(zones).every((k) => ZONES.includes(k)), 'ZONE_INCONNUE')
      .optional()
      .default({}),
  })
  .optional()
  .default({ zones: {} });

/* 999 999 km is past any Moroccan fleet car's life; a 7-digit typo is a typo. */
const mileage = z.number().int().min(0).max(999999).nullable().optional().default(null);
const fuel = z.number().int().min(0).max(100).nullable().optional().default(null);

const shared = {
  id: idish,
  mileageKm: mileage,
  fuelPct: fuel,
  condition,
  damages: z.array(damage).max(30).optional().default([]),
  photos,
  signaturePath: storagePath.nullable().optional().default(null),
  notes: z.string().trim().max(2000).optional().default(''),
  locationId: idish.nullable().optional().default(null),
  reason: z.string().trim().min(1).max(200),
};

/**
 * What was actually taken at the counter — not a quote (plan 9.5: Diab Car
 * takes no money online, so this row is the only record that the customer
 * paid anything at all, and the deposit is what gets given back).
 */
const payment = z.object({
  method: z.enum(['especes', 'tpe']),
  amountReceived: z.number().min(0).max(1000000),
  deposit: z.object({
    amount: z.number().min(0).max(1000000),
    method: z.enum(['especes', 'tpe', 'aucune']),
  }),
});

const pickupSchema = z.object({
  ...shared,
  identityChecked: z.boolean(),
  documentsChecked: z.boolean(),
  unitChecked: z.boolean(),
  payment,
});

const returnSchema = z.object({ ...shared });

/* The public site reads availability from `blocks`, and a return writes one.
   Everything under the root layout is revalidated on a return for that reason
   alone — a car that came back must stop being bookable within the second. */
const ADMIN_PATHS = ['/admin/operations/departs', '/admin/operations/retours', '/admin/reservations', '/admin/flotte', '/admin'];

function revalidateAdmin() {
  for (const path of ADMIN_PATHS) revalidatePath(path);
}

/** Turn a zod failure into something the checklist can point at. */
function invalid(parsed) {
  const fieldErrors = {};
  for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.') || 'form'] = issue.code;
  return { ok: false, error: 'VALIDATION', fieldErrors };
}

/**
 * Remise des clés. Returns the RPC outcome verbatim — including the refusals
 * (`CHECKS_INCOMPLETE`, `UNIT_REQUIRED`, `ILLEGAL_TRANSITION`), which are
 * information for the operator and never exceptions.
 */
export async function submitPickup(input) {
  await requireAdmin();

  const parsed = pickupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);

  const { id, ...payload } = parsed.data;
  const result = await completePickup({ id, payload });

  if (result?.ok) {
    revalidateAdmin();
    revalidatePath(`/admin/reservations/${id}`);
  }
  return result;
}

/**
 * Restitution. On success the car is in `cleaning` behind a cleaning block and
 * is no longer for sale until somebody marks the unit prête — the answer
 * carries `cleaningBlock` and `cleaningMinutes` so the checklist can say so
 * instead of the operator finding out from an angry customer.
 */
export async function submitReturn(input) {
  await requireAdmin();

  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);

  const { id, ...payload } = parsed.data;
  const result = await completeReturn({ id, payload });

  if (result?.ok) {
    revalidateAdmin();
    revalidatePath(`/admin/reservations/${id}`);
    /* Public availability just moved. */
    revalidatePath('/', 'layout');
  }
  return result;
}
