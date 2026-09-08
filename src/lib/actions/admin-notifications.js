'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/server';
import { markNotificationRead } from '@/lib/data';

/**
 * Mark one notification read.
 *
 * Any staff member may: the bell is shared, and a row is a title and a link —
 * there is nothing here worth restricting by role (plan 7.4).
 */
export async function markRead(formData) {
  await requireAdmin();
  const id = String(formData.get('id') || '');
  if (!id) return;
  await markNotificationRead(id);
  revalidatePath('/admin/notifications');
}
