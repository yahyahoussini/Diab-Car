import { redirect } from 'next/navigation';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/**
 * `/avis` moved under `/contenu` when the admin was rebuilt to the section 7
 * information architecture (plan 3, admin URL map).
 *
 * The old path stays as a redirect rather than becoming a 404: it is in the
 * browser history, the autocomplete and probably a bookmark of everyone who
 * used the starter admin, and a dead link there costs an operator a minute at
 * the counter for no reason.
 */
export default async function AvisRedirectPage() {
  await requireAdmin();
  const base = await getAdminBase();
  redirect(`${base}/contenu/avis`);
}
