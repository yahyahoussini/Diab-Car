import { notFound } from 'next/navigation';
import { db } from '@/lib/data';
import { getAdminBase } from '@/lib/auth/server';
import { deleteVehicle } from '@/lib/actions/admin';
import VehicleForm from '@/components/admin/VehicleForm';
import { AdminLink, PageTitle, SubmitButton } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function VehicleEditPage({ params, searchParams }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const base = await getAdminBase();
  const isNew = id === 'new';
  const vehicle = isNew ? {} : await (await db()).getVehicleById(id);
  if (!vehicle) notFound();

  return (
    <>
      <PageTitle
        title={isNew ? 'Nouveau véhicule' : `${vehicle.brand} ${vehicle.model} ${vehicle.year}`}
        description={isNew ? 'Renseignez la fiche ; elle apparaît dans les 4 langues.' : `/${vehicle.slug}`}
        actions={
          <>
            <AdminLink href={`${base}/vehicules`} variant="secondary">
              ← Flotte
            </AdminLink>
            {!isNew ? (
              <form action={deleteVehicle}>
                <input type="hidden" name="id" value={vehicle.id} />
                <SubmitButton variant="danger">Supprimer</SubmitButton>
              </form>
            ) : null}
          </>
        }
      />
      <VehicleForm vehicle={vehicle} saved={saved === '1'} />
    </>
  );
}
