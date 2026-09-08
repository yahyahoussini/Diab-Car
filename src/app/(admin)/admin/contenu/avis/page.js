import { requireAdmin } from '@/lib/auth/server';
import { listReviews, listVehicles } from '@/lib/data';
import ReviewEditor from '@/components/admin/ReviewEditor';
import { PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Avis' };

/**
 * Reviews (plan 7.1, 8.4).
 *
 * `asStaff` for the same reason as the FAQ page: the RLS policy hides both the
 * unpublished rows and every `is_sample` row from anonymous reads, so through
 * the public client this page would show a shorter list than the table holds —
 * and the sample rows it is here to help retire would be invisible.
 */
export default async function ReviewsPage() {
  await requireAdmin();

  const [reviews, vehicles] = await Promise.all([
    listReviews({ asStaff: true }).catch(() => []),
    listVehicles({ asStaff: true,  asStaff: true }).catch(() => []),
  ]);

  return (
    <>
      <PageTitle
        title="Avis clients"
        description="Des avis réels uniquement : copiés depuis la fiche Google ou recueillis à l’agence. Jamais rédigés, jamais achetés."
      />
      <ReviewEditor reviews={reviews} vehicles={vehicles} />
    </>
  );
}
