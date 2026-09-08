import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminBase, getAdminSession, requireAdmin } from '@/lib/auth/server';
import { canManagePricing } from '@/lib/auth/session';
import { getUnitDossier, listLocations, listVehicles } from '@/lib/data';
import UnitDossier, { UNIT_STATUS_LABEL, UNIT_TONE } from '@/components/admin/UnitDossier';

export const dynamic = 'force-dynamic';

/**
 * The dossier of one car (plan 7.1).
 *
 * `unit_dossier()` brings the unit, its events, its reservations and its blocks
 * back in ONE staff-gated round trip (migration 0012) — four queries would have
 * been four chances for the page to contradict itself about the same car.
 *
 * The clock is read once, here, and handed down: a block is "en cours" or not
 * relative to a single instant, and a component that asked the clock again
 * mid-render would be impure (React Compiler) for no gain.
 */
export default async function UnitPage({ params, searchParams }) {
  await requireAdmin();
  const [session, base, { id }, sp] = await Promise.all([getAdminSession(), getAdminBase(), params, searchParams]);

  /* Read once, here, and handed down: "ce bloc est en cours" is true relative
     to a single instant, and two components asking the clock separately could
     disagree about the same row. react-hooks/purity guards CLIENT components,
     where an impure read makes two renders differ; this route is
     force-dynamic and rendered once per request (same reasoning as the
     dashboard). */
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const dossier = await getUnitDossier(id);
  if (!dossier?.unit) notFound();

  /* Only the Aperçu tab edits anything, but the selects it needs are cheap and
     the tab is the default one, so they are fetched with the dossier. */
  const [vehicles, locations] = await Promise.all([listVehicles({ asStaff: true,  asStaff: true }).catch(() => []), listLocations({ all: true }).catch(() => [])]);

  const unit = dossier.unit;
  const tab = typeof sp?.tab === 'string' ? sp.tab : 'apercu';
  const canEdit = canManagePricing(session?.role);

  return (
    <>
      <div className="mb-6">
        <Link href={`${base}/flotte/unites`} className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted hover:text-text">
          ← Unités
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-text">
            <bdi className="font-latin-sans">{unit.plate || 'Sans plaque'}</bdi>
          </h1>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${UNIT_TONE[unit.status] || UNIT_TONE.blocked}`}>
            {UNIT_STATUS_LABEL[unit.status] || unit.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          {unit.vehicle || 'Modèle inconnu'}
          {unit.color ? ` · ${unit.color}` : ''}
          {unit.year ? ` · ${unit.year}` : ''}
          {unit.location ? ` · ${unit.location}` : ''}
        </p>
      </div>

      <UnitDossier dossier={dossier} tab={tab} base={base} vehicles={vehicles} locations={locations} canEdit={canEdit} now={now} />
    </>
  );
}
