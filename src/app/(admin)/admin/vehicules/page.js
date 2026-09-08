import { redirect } from 'next/navigation';
import { getAdminBase } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/**
 * `/vehicules` is the old address of the model list.
 *
 * Kept as a redirect rather than deleted: it is in the shell's keyboard
 * shortcuts, in bookmarks and in six months of the agency's habits, and a 404
 * for a page that simply moved is a support call. The catalogue now lives at
 * /flotte, next to the units it belongs with (plan 7.1).
 */
export default async function VehiclesRedirect() {
  const base = await getAdminBase();
  redirect(`${base}/flotte`);
}
