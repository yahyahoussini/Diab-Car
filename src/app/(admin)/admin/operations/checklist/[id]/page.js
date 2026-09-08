import Link from 'next/link';
import { notFound } from 'next/navigation';
import PickupChecklist from '@/components/admin/PickupChecklist';
import ReturnChecklist from '@/components/admin/ReturnChecklist';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { dataMode, getReservation, getVehicleById, listCustomers, listEvents, listLocations, listUnits } from '@/lib/data';
import { formatDateTime, formatMAD, formatPhone } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/reservation-states';

export const dynamic = 'force-dynamic';

/**
 * The checklist itself — one URL, two modes (plan 7.1).
 *
 * `requireAdmin`, not `requirePricingRole`, even though the départ records
 * money: plan 7.2 gives an `agent` the pickup and return checklists by name.
 * Recording what was handed over at the counter is not setting a price.
 *
 * Everything that could stop this checklist is checked HERE and explained in
 * French, because the alternative is an operator filling in twenty fields and
 * being refused at the end. Postgres refuses the same three things again — it
 * has to, it is the authority (rule 5) — but nobody should meet that refusal
 * after doing the work.
 */
export default async function ChecklistPage({ params, searchParams }) {
  await requireAdmin();
  const base = await getAdminBase();
  const { id } = await params;
  const sp = await searchParams;
  const mode = sp?.mode === 'return' ? 'return' : 'pickup';

  const reservation = await getReservation(id).catch(() => null);
  if (!reservation) notFound();

  const [customers, vehicle, units, locations, events] = await Promise.all([
    listCustomers().catch(() => []),
    reservation.vehicleId ? getVehicleById(reservation.vehicleId, { asStaff: true }).catch(() => null) : null,
    listUnits({ vehicleId: reservation.vehicleId }).catch(() => []),
    listLocations().catch(() => []),
    listEvents({ reservationId: reservation.id, limit: 50 }).catch(() => []),
  ]);

  const customer = customers.find((c) => c.id === reservation.customerId) || null;
  const unit = units.find((u) => u.id === reservation.unitId) || null;
  const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : '—';
  const pickupEvent = events.find((e) => e.type === 'PICKUP') || null;

  const header = (
    <>
      <Link href={`${base}/operations/${mode === 'return' ? 'retours' : 'departs'}`} className="text-sm text-text-muted hover:text-text">
        ← {mode === 'return' ? 'Retours du jour' : 'Départs du jour'}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-text">{mode === 'return' ? 'Retour' : 'Départ'}</h1>
        <Link href={`${base}/reservations/${reservation.id}`} className="font-latin-sans text-lg font-semibold text-text-2 hover:text-text">
          {reservation.reference}
        </Link>
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[reservation.status] || 'bg-surface-2 text-text-2'}`}>
          {STATUS_LABEL[reservation.status] || reservation.status}
        </span>
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Client" value={customer ? `${customer.firstName} ${customer.lastName || ''}`.trim() : 'aucun'} />
        <Fact label="Téléphone" value={customer?.phone ? <bdi className="font-latin-sans">{formatPhone(customer.phone)}</bdi> : '—'} />
        <Fact label="Véhicule" value={`${vehicleName}${unit?.plate ? ` · ${unit.plate}` : ''}`} />
        <Fact
          label={mode === 'return' ? 'Retour prévu' : 'Départ prévu'}
          value={<span className="tnum">{formatDateTime(mode === 'return' ? reservation.endAt : reservation.startAt, 'fr')}</span>}
        />
      </dl>
    </>
  );

  /* ---- the three honest refusals ---- */

  if (!reservation.unitId || !unit) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Refusal title="Aucune unité assignée">
          <p>
            Une checklist porte sur une voiture précise — une plaque, pas un modèle. Assignez une unité à cette réservation, puis
            revenez ici.
          </p>
          <Link
            href={`${base}/reservations/${reservation.id}`}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red hover:bg-red-hover"
          >
            Assigner une unité
          </Link>
        </Refusal>
      </div>
    );
  }

  const pickupAllowed = ['confirmed', 'ready'];
  if (mode === 'pickup' && !pickupAllowed.includes(reservation.status)) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Refusal title={`Départ impossible depuis « ${STATUS_LABEL[reservation.status] || reservation.status} »`}>
          <p>
            Un départ ne s’enregistre que sur une réservation confirmée ou préparée. Celle-ci est « {STATUS_LABEL[reservation.status] || reservation.status} ».
          </p>
          {reservation.status === 'active' ? (
            <p className="mt-2">La voiture est déjà partie. C’est le retour qu’il faut faire.</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {reservation.status === 'active' ? (
              <Link
                href={`${base}/operations/checklist/${reservation.id}?mode=return`}
                className="inline-flex min-h-11 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red hover:bg-red-hover"
              >
                Faire le retour
              </Link>
            ) : null}
            <Link
              href={`${base}/reservations/${reservation.id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-5 text-sm font-semibold text-text"
            >
              Ouvrir la réservation
            </Link>
          </div>
        </Refusal>
      </div>
    );
  }

  if (mode === 'return' && reservation.status !== 'active') {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Refusal title={`Retour impossible depuis « ${STATUS_LABEL[reservation.status] || reservation.status} »`}>
          <p>Un retour ne s’enregistre que sur une réservation en cours, c’est-à-dire une voiture dont le départ a été fait.</p>
          {pickupAllowed.includes(reservation.status) ? (
            <p className="mt-2">Le départ n’a pas encore été enregistré.</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {pickupAllowed.includes(reservation.status) ? (
              <Link
                href={`${base}/operations/checklist/${reservation.id}?mode=pickup`}
                className="inline-flex min-h-11 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red hover:bg-red-hover"
              >
                Faire le départ
              </Link>
            ) : null}
            <Link
              href={`${base}/reservations/${reservation.id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-5 text-sm font-semibold text-text"
            >
              Ouvrir la réservation
            </Link>
          </div>
        </Refusal>
      </div>
    );
  }

  /* Storage lives in Supabase. With the demo adapter there is no bucket to
     write to, so the pickers say so instead of throwing on an unconfigured
     client (rule 12). */
  const storage = dataMode() === 'supabase';

  const shared = {
    base,
    customer,
    vehicleName,
    unit,
    locations,
    storage,
    reservation: {
      id: reservation.id,
      reference: reservation.reference,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      pickupLocationId: reservation.pickupLocationId || '',
      dropoffLocationId: reservation.dropoffLocationId || '',
      quote: { total: reservation.quote?.total ?? null, deposit: reservation.quote?.deposit ?? null },
    },
  };

  return (
    <div className="mx-auto max-w-4xl">
      {header}

      {mode === 'return' && reservation.quote?.total != null ? (
        <p className="mt-4 text-xs text-text-muted">
          Total de la réservation : <span className="tnum">{formatMAD(reservation.quote.total, 'fr')}</span> — encaissé au départ, rien
          n’est prélevé en ligne.
        </p>
      ) : null}

      <div className="mt-8">
        {mode === 'return' ? (
          <ReturnChecklist
            {...shared}
            pickup={
              pickupEvent
                ? { mileageKm: pickupEvent.mileageKm ?? null, fuelPct: pickupEvent.fuelPct ?? null, condition: pickupEvent.condition || null }
                : null
            }
          />
        ) : (
          <PickupChecklist {...shared} />
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-2">{value}</dd>
    </div>
  );
}

function Refusal({ title, children }) {
  return (
    <section className="mt-8 rounded-lg border border-warning bg-warning-soft p-6">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <div className="mt-2 text-sm text-text-2">{children}</div>
    </section>
  );
}
