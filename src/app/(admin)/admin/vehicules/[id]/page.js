import { redirect } from 'next/navigation';
import { getAdminBase } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/**
 * The old model editor. Same id, new address (plan 7.1) — including the
 * `new` sentinel the previous form used, which is `nouveau` in French now
 * that every other admin route is.
 */
export default async function VehicleRedirect({ params }) {
  const base = await getAdminBase();
  const { id } = await params;
  redirect(`${base}/flotte/${id === 'new' ? 'nouveau' : id}`);
}
