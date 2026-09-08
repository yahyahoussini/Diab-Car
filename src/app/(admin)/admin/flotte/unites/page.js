import Link from 'next/link';
import { getAdminBase, getAdminSession, requireAdmin } from '@/lib/auth/server';
import { canManagePricing } from '@/lib/auth/session';
import { listLocations, listUnits, listVehicles } from '@/lib/data';
import { t } from '@/lib/constants';
import { PageTitle, Table } from '@/components/admin/ui';
import UnitEditor, { MarkReadyButton } from '@/components/admin/UnitEditor';
import { NEEDS_READY, UNIT_DOT, UNIT_STATUS_LABEL, UNIT_STATUS_OPTIONS, UNIT_STATUSES } from '@/components/admin/UnitDossier';

export const dynamic = 'force-dynamic';

/**
 * Every physical car, one row each (plan 7.1, 6.2).
 *
 * A model is what the site sells; a unit is what can only be in one place at a
 * time, and this is the only screen that shows all of them at once. Dense on
 * purpose (plan 7.3): a plate, a dot, and the number that says whether the car
 * can go out today.
 *
 * « Marquer prête » is inline rather than buried in the dossier because it is
 * the last step of the return loop — the operator is standing next to a clean
 * car, looking at this list, and one click has to be enough.
 *
 * Filtering happens in memory although `listUnits` can filter in Postgres: the
 * counts beside each status have to be counted over the WHOLE fleet or they
 * would only ever say "the filter you already applied". A few dozen cars is not
 * a reason to make eight queries.
 */
export default async function UnitsPage({ searchParams }) {
  await requireAdmin();
  const [session, base, sp] = await Promise.all([getAdminSession(), getAdminBase(), searchParams]);

  /* `units` RLS is has_role(['owner','manager']) — the same pair as pricing,
     which is what this helper names. An agent reads the fleet, never edits it. */
  const canEdit = canManagePricing(session?.role);

  const [units, vehicles, locations] = await Promise.all([
    listUnits({}).catch(() => []),
    listVehicles({ asStaff: true,  asStaff: true }).catch(() => []),
    listLocations({ all: true }).catch(() => []),
  ]);

  const status = UNIT_STATUSES.includes(sp?.statut) ? sp.statut : '';
  const model = typeof sp?.modele === 'string' ? sp.modele : '';
  const q = (typeof sp?.q === 'string' ? sp.q : '').trim().toLowerCase();

  const vehicleName = new Map(vehicles.map((v) => [v.id, `${v.brand} ${v.model}`.trim()]));
  const locationName = new Map(locations.map((l) => [l.id, t(l.name, 'fr') || l.key]));

  const counts = new Map();
  for (const u of units) counts.set(u.status, (counts.get(u.status) || 0) + 1);

  const rows = units
    .filter((u) => (status ? u.status === status : true))
    .filter((u) => (model ? u.vehicleId === model : true))
    .filter((u) => (q ? String(u.plate || '').toLowerCase().includes(q) : true))
    /* Cars waiting for a hand come first: the list is a to-do list before it is
       an inventory. Everything else keeps model-then-plate order so a plate is
       findable by eye. */
    .sort((a, b) => {
      const urgency = Number(NEEDS_READY.includes(b.status)) - Number(NEEDS_READY.includes(a.status));
      if (urgency !== 0) return urgency;
      const byModel = (vehicleName.get(a.vehicleId) || '').localeCompare(vehicleName.get(b.vehicleId) || '', 'fr');
      if (byModel !== 0) return byModel;
      return String(a.plate || '').localeCompare(String(b.plate || ''), 'fr');
    });

  const link = (patch) => {
    const params = new URLSearchParams();
    const next = { statut: status, modele: model, q, ...patch };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    return `${base}/flotte/unites${query ? `?${query}` : ''}`;
  };

  const filtered = Boolean(status || model || q);

  return (
    <>
      <PageTitle
        title="Unités"
        description={`${units.length} voiture${units.length > 1 ? 's' : ''} au parc · ${counts.get('available') || 0} disponible${(counts.get('available') || 0) > 1 ? 's' : ''}`}
      />

      {canEdit ? (
        <details className="card mb-6 p-5" data-testid="unit-new">
          <summary className="cursor-pointer text-sm font-semibold text-text">+ Nouvelle unité</summary>
          <p className="mt-2 text-xs text-text-muted">Une ligne par voiture physique : c’est le nombre d’unités qui décide de ce que le site peut vendre en même temps.</p>
          <div className="mt-5">
            <UnitEditor vehicles={vehicles} locations={locations} statuses={UNIT_STATUS_OPTIONS} canEdit />
          </div>
        </details>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <Link
          href={link({ statut: '' })}
          aria-current={status ? undefined : 'page'}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${status ? 'border-border text-text-2 hover:text-text' : 'border-border-strong text-text'}`}
        >
          Toutes <span className="tnum">{units.length}</span>
        </Link>
        {UNIT_STATUSES.filter((s) => counts.get(s)).map((s) => (
          <Link
            key={s}
            href={link({ statut: s === status ? '' : s })}
            aria-current={s === status ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              s === status ? 'border-border-strong text-text' : 'border-border text-text-2 hover:text-text'
            }`}
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${UNIT_DOT[s]}`} />
            {UNIT_STATUS_LABEL[s]} <span className="tnum">{counts.get(s)}</span>
          </Link>
        ))}
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        {status ? <input type="hidden" name="statut" value={status} /> : null}
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Modèle</span>
          <select name="modele" defaultValue={model} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text">
            <option value="">Tous les modèles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {vehicleName.get(v.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Plaque</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="12345-A-6"
            data-testid="units-search"
            className="w-56 rounded-lg border border-border bg-surface-1 px-3 py-2 font-latin-sans text-sm text-text placeholder:text-text-muted"
          />
        </label>
        <button type="submit" className="h-10 rounded-lg border border-border-strong px-4 text-sm font-semibold text-text">
          Filtrer
        </button>
        {filtered ? (
          <Link href={`${base}/flotte/unites`} className="h-10 rounded-lg px-2 text-sm leading-10 text-text-muted hover:text-text">
            Réinitialiser
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2" data-testid="units-empty">
          {units.length === 0
            ? 'Aucune unité au parc. Ajoutez la première voiture ci-dessus : tant qu’un modèle n’a pas d’unité, le site ne peut rien vendre.'
            : 'Aucune unité ne correspond à ce filtre.'}
        </p>
      ) : (
        <Table head={['Plaque', 'Modèle', 'Couleur', 'Année', 'Km', 'Carburant', 'Statut', 'Lieu', '']}>
          {rows.map((u) => (
            <tr key={u.id} className="transition-colors hover:bg-surface-2">
              <td className="px-4 py-3">
                <Link href={`${base}/flotte/unites/${u.id}`} className="font-latin-sans font-semibold text-text hover:underline">
                  {u.plate || u.id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-4 py-3 text-text-2">{vehicleName.get(u.vehicleId) || '—'}</td>
              <td className="px-4 py-3 text-text-2">{u.color || '—'}</td>
              <td className="tnum px-4 py-3 text-text-2">{u.year || '—'}</td>
              <td className="tnum px-4 py-3 text-text-2">{u.mileageKm != null ? formatKm(u.mileageKm) : '—'}</td>
              <td className="tnum px-4 py-3 text-text-2">{u.fuelPct != null ? `${u.fuelPct} %` : '—'}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2 whitespace-nowrap text-text-2">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${UNIT_DOT[u.status] || 'bg-text-muted'}`} />
                  {UNIT_STATUS_LABEL[u.status] || u.status}
                </span>
              </td>
              <td className="px-4 py-3 text-text-2">{locationName.get(u.currentLocationId) || '—'}</td>
              <td className="px-4 py-3 text-end">
                {NEEDS_READY.includes(u.status) ? <MarkReadyButton unitId={u.id} plate={u.plate} compact /> : null}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <p className="mt-4 text-xs text-text-muted">
        <span aria-hidden="true" className="me-1.5 inline-block h-2 w-2 rounded-full bg-red align-middle" /> action requise ·
        <span aria-hidden="true" className="mx-1.5 inline-block h-2 w-2 rounded-full bg-warning align-middle" /> à surveiller ·
        <span aria-hidden="true" className="mx-1.5 inline-block h-2 w-2 rounded-full bg-success align-middle" /> prête ·
        <span aria-hidden="true" className="mx-1.5 inline-block h-2 w-2 rounded-full bg-text-muted align-middle" /> inactive
      </p>
    </>
  );
}

/** Grouped Latin digits, thin no-break spaces — the same rule as src/lib/format.js. */
function formatKm(value) {
  return new Intl.NumberFormat('en-US').format(value).replace(/,/g, ' ');
}
