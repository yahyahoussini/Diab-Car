import Link from 'next/link';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { listExtras, listLocations, listVehicles } from '@/lib/data';
import ReservationCreateForm from '@/components/admin/ReservationCreateForm';

export const dynamic = 'force-dynamic';

/** A booking taken at the counter or on the phone (plan 7.1). */
export default async function NewReservationPage() {
  await requireAdmin();
  const base = await getAdminBase();

  const [vehicles, locations, extras] = await Promise.all([
    listVehicles({ asStaff: true, published: true }).catch(() => []),
    listLocations().catch(() => []),
    listExtras().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`${base}/reservations`} className="text-sm text-text-muted hover:text-text">
        ← Réservations
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-text">Nouvelle réservation</h1>
      <p className="mt-1 text-sm text-text-muted">
        Même moteur que le site : la disponibilité est décidée par la base, pas par ce formulaire.
      </p>

      <div className="mt-8">
        <ReservationCreateForm vehicles={vehicles} locations={locations} extras={extras} base={base} />
      </div>
    </div>
  );
}
