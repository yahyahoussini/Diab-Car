import { requireAdmin } from '@/lib/auth/server';
import { listFaqs, listVehicles } from '@/lib/data';
import FaqEditor from '@/components/admin/FaqEditor';
import { PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'FAQ' };

/**
 * The answer database (plan 7.1, 8.5).
 *
 * `asStaff` is not optional here. The RLS policy on `faqs` reads
 * `published = true OR is_staff()`, and the anonymous client is not staff — so
 * a page that forgot the flag would show an empty editor on a table full of
 * drafts, which is exactly the row an editor exists to work on.
 */
export default async function FaqPage() {
  await requireAdmin();

  const [faqs, vehicles] = await Promise.all([
    listFaqs({ asStaff: true }).catch(() => []),
    listVehicles({ asStaff: true,  asStaff: true }).catch(() => []),
  ]);

  return (
    <>
      <PageTitle
        title="FAQ"
        description="Une ligne = un fait vérifié. La réponse courte est le bloc que Google et les moteurs IA reprennent ; la réponse longue est le détail de la page FAQ."
      />
      <FaqEditor faqs={faqs} vehicles={vehicles} />
    </>
  );
}
