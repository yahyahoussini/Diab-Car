import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminBase, requirePricingRole } from '@/lib/auth/server';
import { dataMode, getVehicleById, listUnits, listVehiclePhotos } from '@/lib/data';
import { Card, PageTitle, Table } from '@/components/admin/ui';
import PhotoManager from '@/components/admin/PhotoManager';
import VehicleEditor from '@/components/admin/VehicleEditor';

export const dynamic = 'force-dynamic';

/**
 * One model: its sheet, its gallery, its plates (plan 7.1).
 *
 * Three parts on ONE page on purpose. The three questions an operator asks
 * about a car — is it right, does it look right, is there one to rent — are
 * asked together, and splitting them across tabs would mean three loads to
 * answer one question.
 *
 * The units are shown, never edited here: a plate's status is an operational
 * write with its own reason and its own page.
 */

/* Plan 7.3's dot vocabulary: green = ready, amber = needs attention, grey =
   inactive, neutral = normal. Nothing here is red — a car out with a customer
   is the business working, not an alarm. */
const UNIT_STATUS = {
  available: { label: 'Disponible', dot: 'bg-success' },
  reserved: { label: 'Réservée', dot: 'bg-text-2' },
  rented: { label: 'En location', dot: 'bg-text-2' },
  returned: { label: 'Rendue', dot: 'bg-warning' },
  cleaning: { label: 'Nettoyage', dot: 'bg-warning' },
  maintenance: { label: 'Maintenance', dot: 'bg-warning' },
  blocked: { label: 'Bloquée', dot: 'bg-warning' },
  out_of_service: { label: 'Hors service', dot: 'bg-text-muted' },
};

/** Latin digits, thin no-break grouping — the same shape as every other
    number in the admin (src/lib/format.js), for a value that is not money. */
const km = (value) => `${new Intl.NumberFormat('en-US').format(Number(value) || 0).replace(/,/g, ' ')} km`;

export default async function FleetModelPage({ params }) {
  await requirePricingRole();
  const base = await getAdminBase();
  const { id } = await params;

  /* The clock is read once, here, and passed down: a client component that
     called new Date() while rendering would be non-deterministic. */
  const currentYear = new Date().getFullYear();

  const isNew = id === 'nouveau';
  const vehicle = isNew ? null : await getVehicleById(id, { asStaff: true }).catch(() => null);
  if (!isNew && !vehicle) notFound();

  const [units, photos] = isNew
    ? [[], []]
    : await Promise.all([listUnits({ vehicleId: id }).catch(() => []), listVehiclePhotos({ vehicleId: id }).catch(() => [])]);

  const label = isNew ? 'Nouveau modèle' : `${vehicle.brand} ${vehicle.model} ${vehicle.year}`;

  return (
    <>
      <Link href={`${base}/flotte`} className="text-sm text-text-muted hover:text-text">
        ← Modèles
      </Link>

      <div className="mt-4">
        <PageTitle
          title={label}
          description={
            isNew
              ? 'Renseignez la fiche, puis enregistrez : les photos s’ajoutent ensuite.'
              : `/${vehicle.slug} · ${photos.length} photo(s) · ${units.length} unité(s)${vehicle.published ? '' : ' · brouillon'}`
          }
        />
      </div>

      <VehicleEditor vehicle={vehicle || {}} base={base} isNew={isNew} currentYear={currentYear} />

      <div className="mt-5 space-y-5">
        {isNew ? (
          <Card title="Photos">
            <p className="text-sm text-text-muted">
              Enregistrez d’abord le modèle : une photo doit être rattachée à une fiche existante.
            </p>
          </Card>
        ) : (
          <PhotoManager
            vehicleId={vehicle.id}
            slug={vehicle.slug}
            vehicleLabel={label}
            photos={photos}
            canUpload={dataMode() === 'supabase'}
          />
        )}

        <Card title="Unités">
          {isNew ? (
            <p className="text-sm text-text-muted">Les plaques s’ajoutent une fois le modèle enregistré.</p>
          ) : units.length === 0 ? (
            <p className="text-sm text-text-muted">
              Aucune unité pour ce modèle : il ne peut donc pas être loué, même publié.{' '}
              <Link href={`${base}/flotte/unites`} className="font-semibold text-text underline">
                Ajouter une unité
              </Link>
              .
            </p>
          ) : (
            <Table head={['Plaque', 'Statut', 'Km', 'Carburant', '']}>
              {units.map((u) => {
                const status = UNIT_STATUS[u.status] || { label: u.status, dot: 'bg-text-muted' };
                return (
                  <tr key={u.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <Link href={`${base}/flotte/unites/${u.id}`} className="font-latin-sans font-medium text-text hover:underline">
                        {u.plate || '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm text-text-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
                        {status.label}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-sm text-text-2">{km(u.mileageKm)}</td>
                    <td className="tnum px-4 py-3 text-sm text-text-2">{u.fuelPct === null || u.fuelPct === undefined ? '—' : `${u.fuelPct} %`}</td>
                    <td className="px-4 py-3 text-end">
                      <Link href={`${base}/flotte/unites/${u.id}`} className="text-xs font-semibold text-text-2 hover:text-text">
                        Dossier
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
