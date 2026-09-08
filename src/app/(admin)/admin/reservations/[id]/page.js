import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminBase, getAdminSession, requireAdmin } from '@/lib/auth/server';
import { canManagePricing } from '@/lib/auth/session';
import { getReservation, getVehicleById, listAuditLog, listCustomers, listEvents, listLocations, listUnits, unitsFreeForReservation } from '@/lib/data';
import { formatDateTime, formatMAD, formatPhone } from '@/lib/format';
import { bookingConfirmedMessage, whatsappLink } from '@/lib/whatsapp';
import { STATUS_LABEL, STATUS_TONE, nextStates } from '@/lib/reservation-states';
import ReservationActions from '@/components/admin/ReservationActions';

export const dynamic = 'force-dynamic';

/**
 * One reservation, in the three columns an operator thinks in (plan 7.1):
 * who · which car · how much.
 */
export default async function ReservationDetail({ params }) {
  await requireAdmin();
  const session = await getAdminSession();
  const base = await getAdminBase();
  const { id } = await params;

  const reservation = await getReservation(id).catch(() => null);
  if (!reservation) notFound();

  const [vehicle, customers, units, locations, freeUnits, audit, events] = await Promise.all([
    reservation.vehicleId ? getVehicleById(reservation.vehicleId, { asStaff: true }).catch(() => null) : null,
    listCustomers().catch(() => []),
    listUnits({ vehicleId: reservation.vehicleId }).catch(() => []),
    listLocations().catch(() => []),
    unitsFreeForReservation(reservation.id).catch(() => []),
    listAuditLog({ table: 'reservations', rowId: reservation.id, limit: 50 }).catch(() => []),
    listEvents({ reservationId: reservation.id, limit: 50 }).catch(() => []),
  ]);

  const customer = customers.find((c) => c.id === reservation.customerId) || null;
  const unit = units.find((u) => u.id === reservation.unitId) || null;
  const q = reservation.quote || {};
  const placeName = (locId) => {
    const l = locations.find((x) => x.id === locId);
    return l?.name?.fr || l?.key || null;
  };

  const timeline = buildTimeline(audit, events);

  const wa = customer?.phone
    ? whatsappLink(
        customer.phone,
        bookingConfirmedMessage(customer.locale || 'fr', {
          reference: reservation.reference,
          vehicleName: vehicle ? `${vehicle.brand} ${vehicle.model}` : undefined,
          from: formatDateTime(reservation.startAt, customer.locale || 'fr'),
          to: formatDateTime(reservation.endAt, customer.locale || 'fr'),
          pickup: placeName(reservation.pickupLocationId),
          dropoff: placeName(reservation.dropoffLocationId),
          total: q.total != null ? formatMAD(q.total, 'fr') : undefined,
        }),
      )
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`${base}/reservations`} className="text-sm text-text-muted hover:text-text">
        ← Réservations
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-latin-sans text-2xl font-semibold text-text">{reservation.reference}</h1>
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[reservation.status] || 'bg-surface-2 text-text-2'}`}>{STATUS_LABEL[reservation.status] || reservation.status}</span>
        <span className="text-sm text-text-muted">{reservation.source}</span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* ---- client ---- */}
        <section className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Client</h2>
          {customer ? (
            <dl className="mt-4 space-y-2 text-sm">
              <Row
                label="Nom"
                value={
                  <Link href={`${base}/clients/${customer.id}`} className="font-semibold text-text hover:underline" data-testid="customer-link">
                    {`${customer.firstName} ${customer.lastName}`.trim()}
                  </Link>
                }
              />
              <Row label="Téléphone" value={<bdi className="font-latin-sans">{formatPhone(customer.phone)}</bdi>} />
              <Row label="E-mail" value={customer.email || '—'} />
              <Row label="Langue" value={customer.locale || 'fr'} />
            </dl>
          ) : (
            <p className="mt-4 text-sm text-text-muted">Aucun client rattaché.</p>
          )}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" data-testid="reservation-whatsapp" className="mt-5 inline-block rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
              WhatsApp (dans sa langue)
            </a>
          ) : null}
        </section>

        {/* ---- véhicule / unité ---- */}
        <section className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Véhicule</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Modèle" value={vehicle ? `${vehicle.brand} ${vehicle.model}` : '—'} />
            <Row label="Unité" value={unit ? <span className="font-latin-sans">{unit.plate}</span> : 'non assignée'} />
            <Row label="Départ" value={<span className="tnum">{formatDateTime(reservation.startAt, 'fr')}</span>} />
            <Row label="Retour" value={<span className="tnum">{formatDateTime(reservation.endAt, 'fr')}</span>} />
            <Row label="Prise en charge" value={placeName(reservation.pickupLocationId) || '—'} />
            <Row label="Restitution" value={placeName(reservation.dropoffLocationId) || '—'} />
          </dl>
        </section>

        {/* ---- argent ---- */}
        <section className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Argent</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {q.days ? <Row label="Location" value={<span className="tnum">{formatMAD(q.basePerDay, 'fr')} × {q.days}</span>} /> : null}
            {q.discountAmount ? <Row label="Remise" value={<span className="tnum">− {formatMAD(q.discountAmount, 'fr')}</span>} /> : null}
            {q.extrasTotal ? <Row label="Options" value={<span className="tnum">{formatMAD(q.extrasTotal, 'fr')}</span>} /> : null}
            {q.deliveryFee ? <Row label="Livraison" value={<span className="tnum">{formatMAD(q.deliveryFee, 'fr')}</span>} /> : null}
            <Row label="Total" value={<span className="tnum font-semibold text-text">{q.total != null ? formatMAD(q.total, 'fr') : '—'}</span>} />
            <Row label="Caution" value={<span className="tnum">{q.deposit != null ? formatMAD(q.deposit, 'fr') : '—'}</span>} />
          </dl>
          {q.overridden ? (
            <p className="mt-4 rounded border border-warning bg-warning-soft/30 p-2 text-xs text-text-2">
              Prix modifié — motif : « {q.overrideReason} ». Devis d’origine conservé.
            </p>
          ) : null}
          <p className="mt-4 text-xs text-text-muted">Encaissement à la prise en charge. Aucun paiement en ligne.</p>
        </section>
      </div>

      {/* ---- actions ---- */}
      <section className="mt-8 rounded-lg border border-border bg-surface-1 p-5">
        <ReservationActions
          reservation={{
            id: reservation.id,
            reference: reservation.reference,
            status: reservation.status,
            unitId: reservation.unitId,
            startAt: reservation.startAt,
            endAt: reservation.endAt,
            quote: { total: q.total ?? null },
          }}
          allowed={nextStates(reservation.status)}
          freeUnits={freeUnits}
          canPrice={canManagePricing(session?.role)}
        />
      </section>

      {/* ---- timeline ---- */}
      <section className="mt-8">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Historique</h2>
        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Aucune écriture enregistrée pour cette réservation.</p>
        ) : (
          <ol className="mt-3 space-y-1" data-testid="reservation-history">
            {timeline.map((t) => (
              <li key={t.key} className="flex flex-wrap items-baseline gap-x-3 rounded-md px-3 py-2 text-sm odd:bg-surface-1">
                <span className="tnum shrink-0 text-xs text-text-muted">{formatDateTime(t.at, 'fr')}</span>
                <span className="shrink-0 text-xs font-bold uppercase text-text-2">{t.kind}</span>
                <span className="text-text-2">{t.text}</span>
                {t.reason ? <span className="text-xs text-text-muted">« {t.reason} »</span> : null}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-text-muted">
          Journal (qui a écrit quoi) et faits terrain (départ, retour, état des lieux) sur une seule ligne de temps.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-end text-text-2">{value}</dd>
    </div>
  );
}

const EVENT_LABEL = {
  PURCHASED: 'achat',
  STATUS_CHANGED: 'statut',
  PICKUP: 'départ',
  RETURN: 'retour',
  INSPECTION: 'état des lieux',
  DAMAGE_REPORTED: 'dommage signalé',
  CLEANING_STARTED: 'nettoyage commencé',
  CLEANING_COMPLETED: 'nettoyage terminé',
  MAINTENANCE_STARTED: 'entretien commencé',
  MAINTENANCE_COMPLETED: 'entretien terminé',
  DOCUMENT_UPDATED: 'document mis à jour',
  TRANSFER_STARTED: 'transfert commencé',
  TRANSFER_COMPLETED: 'transfert terminé',
  NOTE: 'note',
};

/**
 * Two sources, one story: `audit_log` says who changed which field, and
 * `vehicle_events` says what happened to the car. An operator settling a
 * dispute needs both in the order they occurred, not two lists to reconcile.
 */
function buildTimeline(audit, events) {
  const rows = [
    ...audit.map((a) => ({
      key: `a-${a.id}`,
      at: a.at,
      kind: a.action === 'INSERT' ? 'création' : 'journal',
      text: describeChange(a),
      reason: a.reason || null,
    })),
    ...events.map((e) => ({
      key: `e-${e.id}`,
      at: e.at,
      kind: EVENT_LABEL[e.type] || e.type,
      text: describeEvent(e),
      reason: e.reason || null,
    })),
  ];
  return rows.sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 40);
}

function describeEvent(e) {
  const bits = [];
  if (e.mileageKm != null) bits.push(`${e.mileageKm} km`);
  if (e.fuelPct != null) bits.push(`carburant ${e.fuelPct}%`);
  if (Array.isArray(e.photos) && e.photos.length) bits.push(`${e.photos.length} photo(s)`);
  if (e.notes) bits.push(e.notes);
  return bits.join(' · ') || '—';
}

/** The one or two fields that actually moved — not a row dump. */
function describeChange(entry) {
  const before = entry.before || {};
  const after = entry.after || {};
  const changed = Object.keys(after)
    .filter((k) => k !== 'updated_at')
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (changed.length === 0) return 'création';
  return changed.slice(0, 3).map((k) => `${k}: ${short(before[k])} → ${short(after[k])}`).join(' · ');
}

function short(v) {
  if (v === undefined || v === null) return '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}
