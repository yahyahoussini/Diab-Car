'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/server';
import { createBlock, deleteBlock } from '@/lib/data';

/**
 * Taking a car out of availability (plan 6.1, 7.3).
 *
 * A block is the honest way to say "this unit cannot be rented" — maintenance,
 * cleaning, a transfer, the owner's own use. Postgres refuses one that lands on
 * a live reservation and names the reservation in the error, so this action's
 * only job is to turn that refusal into a sentence an operator can act on.
 *
 * Like the reservation actions, it RETURNS the outcome instead of throwing: a
 * conflict is information, not a crash.
 */

const KINDS = ['maintenance', 'cleaning', 'transfer', 'private', 'other'];

const schema = z.object({
  unitId: z.uuid().or(z.string().min(1).max(64)),
  startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'not a date'),
  endAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'not a date'),
  kind: z.enum(KINDS).default('maintenance'),
  reason: z.string().trim().min(1).max(200),
});

export async function createBlockAction(input) {
  await requireAdmin();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.code;
    return { ok: false, error: 'VALIDATION', fieldErrors };
  }
  const d = parsed.data;
  if (Date.parse(d.endAt) <= Date.parse(d.startAt)) return { ok: false, error: 'BAD_DATES' };

  try {
    const block = await createBlock(d);
    revalidatePath('/admin/calendrier');
    revalidatePath('/admin/blocs');
    return { ok: true, block };
  } catch (error) {
    if (error?.code === 'BLOCK_CONFLICTS_RESERVATION') {
      /* The trigger puts the conflicting reservation in DETAIL; the demo
         adapter hands back the same fields as an object. Either way the
         operator is told WHICH booking is in the way. */
      const detail = typeof error.detail === 'string' ? parseDetail(error.detail) : error.detail || {};
      return {
        ok: false,
        error: 'CONFLICT',
        reference: detail.reservationReference || null,
        from: detail.reservedFrom || null,
        to: detail.reservedTo || null,
      };
    }
    return { ok: false, error: 'SERVER' };
  }
}

export async function deleteBlockAction(id) {
  await requireAdmin();
  if (typeof id !== 'string' || !id) return { ok: false, error: 'VALIDATION' };
  await deleteBlock(id);
  revalidatePath('/admin/calendrier');
  revalidatePath('/admin/blocs');
  return { ok: true };
}

/** DETAIL is a human sentence; pull a reference out of it if one is there. */
function parseDetail(detail) {
  const reference = detail.match(/\bDC-[0-9]{6}-[A-Z0-9]{4}\b/)?.[0] || null;
  return { reservationReference: reference };
}
