import { db } from '@/lib/data';
import { getAdminBase } from '@/lib/auth/server';
import { formatMAD } from '@/lib/format';
import { vehicleImage } from '@/lib/constants';
import { AdminLink, PageTitle, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const CAT = { economy: 'Citadine', compact: 'Compacte', sedan: 'Berline', suv: 'SUV', premium: 'Premium', luxury: 'Luxe', van: 'Van' };

export default async function VehiclesPage() {
  const base = await getAdminBase();
  const vehicles = await (await db()).listVehicles({});
  return (
    <>
      <PageTitle title="Flotte" description={`${vehicles.length} véhicules · ${vehicles.filter((v) => v.published).length} publiés`} actions={<AdminLink href={`${base}/vehicules/new`}>+ Ajouter un véhicule</AdminLink>} />
      <Table head={['', 'Véhicule', 'Catégorie', 'Prix / jour', 'Caution', 'Km', 'Statut', '']}>
        {vehicles.map((v) => (
          <tr key={v.id} className="hover:bg-surface-2/50">
            <td className="w-24 px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={vehicleImage(v)} alt="" width={96} height={46} className="plate rounded-lg p-1" />
            </td>
            <td className="px-4 py-3">
              <div className="font-medium text-text">
                {v.brand} {v.model} <span className="text-text-muted">{v.year}</span>
              </div>
              <div className="text-xs text-text-muted">
                /{v.slug} · {v.transmission === 'automatic' ? 'Auto' : 'Manuelle'} · {v.seats} pl.
              </div>
            </td>
            <td className="px-4 py-3">{CAT[v.category]}</td>
            <td className="px-4 py-3 tnum font-semibold text-accent">{formatMAD(v.pricePerDay)}</td>
            <td className="px-4 py-3 tnum">{formatMAD(v.deposit)}</td>
            <td className="px-4 py-3 text-xs">{v.mileageLimit ? `${v.mileageLimit} km/j` : 'Illimité'}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.published ? 'bg-success-soft text-success' : 'bg-surface-2 text-text-muted'}`}>{v.published ? 'Publié' : 'Brouillon'}</span>
              {v.featured ? <span className="ms-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">★</span> : null}
            </td>
            <td className="px-4 py-3 text-end">
              <AdminLink href={`${base}/vehicules/${v.id}`} variant="secondary" className="h-8 px-3 text-xs">
                Modifier
              </AdminLink>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
