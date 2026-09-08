'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireRole } from '@/lib/auth/server';
import { mergeCustomers, setCustomerNotes } from '@/lib/data';

/**
 * The customer file (plan 7.1).
 *
 * Two writes, both of them RPCs: a note, and the merge. The merge is the one
 * that matters — it moves reservations and then DELETES a row, so it runs as a
 * single transaction in Postgres with the operator's reason attached, and it
 * is written to the journal by id, never by name or number.
 *
 * Merging is owner/manager only. An agent can read a file and add a note; they
 * cannot make a customer disappear.
 */

const mergeSchema = z.object({
  keepId: z.uuid().or(z.string().min(1).max(64)),
  dropId: z.uuid().or(z.string().min(1).max(64)),
  reason: z.string().trim().min(1).max(200),
});

export async function mergeCustomersAction(input) {
  await requireRole(['owner', 'manager']);

  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION' };

  const result = await mergeCustomers(parsed.data);
  if (result?.ok) {
    revalidatePath('/admin/clients');
    revalidatePath('/admin/reservations');
  }
  return result;
}

const notesSchema = z.object({
  id: z.uuid().or(z.string().min(1).max(64)),
  notes: z.string().max(2000).optional().default(''),
});

export async function saveCustomerNotes(input) {
  await requireAdmin();

  const parsed = notesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION' };

  const result = await setCustomerNotes(parsed.data);
  if (result?.ok) revalidatePath(`/admin/clients/${parsed.data.id}`);
  return result;
}
