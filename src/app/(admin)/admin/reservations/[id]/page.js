import { notFound } from 'next/navigation';
import { db, getVehicleById } from '@/lib/data';
import { getAdminBase } from '@/lib/auth/server';
import { formatDateTime, formatMAD } from '@/lib/format';
import { whatsappLink } from '@/lib/whatsapp';
import BookingStatusForm from '@/components/admin/BookingStatusForm';
import { AdminLink, Card, PageTitle, StatusBadge } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const CONFIRM_MSG = {
  fr: (b, v) => `Bonjour ${b.customerName}, Diab Car confirme votre réservation ${b.reference} : ${v} du ${formatDateTime(b.startAt, 'fr')} au ${formatDateTime(b.endAt, 'fr')}, prise en charge ${b.pickupLabel}. Total ${formatMAD(b.totalMad, 'fr')}, caution ${formatMAD(b.priceBreakdown?.deposit, 'fr')} (pré-autorisation). À bientôt !`,
  en: (b, v) => `Hello ${b.customerName}, Diab Car confirms your booking ${b.reference}: ${v} from ${formatDateTime(b.startAt, 'en')} to ${formatDateTime(b.endAt, 'en')}, pick-up ${b.pickupLabel}. Total ${formatMAD(b.totalMad, 'en')}, deposit ${formatMAD(b.priceBreakdown?.deposit, 'en')} (pre-authorisation). See you soon!`,
  ar: (b, v) => `مرحباً ${b.customerName}، تؤكد دياب كار حجزكم ${b.reference}: ${v} من ${formatDateTime(b.startAt, 'ar')} إلى ${formatDateTime(b.endAt, 'ar')}، الاستلام ${b.pickupLabel}. المجموع ${formatMAD(b.totalMad, 'ar')}، الضمانة ${formatMAD(b.priceBreakdown?.deposit, 'ar')} (حجز مسبق). إلى اللقاء!`,
  es: (b, v) => `Hola ${b.customerName}, Diab Car confirma su reserva ${b.reference}: ${v} del ${formatDateTime(b.startAt, 'es')} al ${formatDateTime(b.endAt, 'es')}, recogida ${b.pickupLabel}. Total ${formatMAD(b.totalMad, 'es')}, fianza ${formatMAD(b.priceBreakdown?.deposit, 'es')} (preautorización). ¡Hasta pronto!`,
};

export default async function BookingDetailPage({ params }) {
  const { id } = await params;
  const base = await getAdminBase();
  const b = await (await db()).getBooking(id);
  if (!b) notFound();
  const v = await getVehicleById(b.vehicleId);
  const vName = v ? `${v.brand} ${v.model} ${v.year}` : '—';
  const msg = (CONFIRM_MSG[b.locale] || CONFIRM_MSG.fr)(b, vName);
  const q = b.priceBreakdown || {};

  return (
    <>
      <PageTitle
        title={
          <>
            {b.reference} <StatusBadge status={b.status} />
          </>
        }
        description={`Reçue le ${formatDateTime(b.createdAt)} · source ${b.source} · langue ${b.locale?.toUpperCase()}`}
        actions={
          <>
            <AdminLink href={`${base}/reservations`} variant="secondary">
              ← Réservations
            </AdminLink>
            <a href={whatsappLink(b.customerPhone, msg)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-whatsapp px-4 text-sm font-semibold text-on-whatsapp">
              Confirmer sur WhatsApp
            </a>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Client" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Row k="Nom" v={b.customerName} />
            <Row k="Téléphone" v={<a href={`tel:${b.customerPhone}`} className="font-latin-sans text-accent">{b.customerPhone}</a>} />
            <Row k="E-mail" v={<a href={`mailto:${b.customerEmail}`} className="font-latin-sans text-accent">{b.customerEmail}</a>} />
            <Row k="Pays" v={b.customerCountry} />
            <Row k="Âge conducteur" v={b.driverAge} />
            {b.flightNumber ? <Row k="Vol" v={b.flightNumber} /> : null}
            {b.notes ? <Row k="Message client" v={b.notes} /> : null}
          </dl>
        </Card>
        <Card title="Location" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Row k="Véhicule" v={vName} />
            <Row k="Prise en charge" v={`${b.pickupLabel} — ${formatDateTime(b.startAt)}`} />
            <Row k="Restitution" v={`${b.dropoffLabel} — ${formatDateTime(b.endAt)}`} />
            <Row k="Durée" v={`${b.days} jour(s)`} />
            <Row k="Options" v={(b.extras || []).map((e) => e.key).join(', ') || '—'} />
          </dl>
          <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
            <Row k={`${q.days} × ${formatMAD(q.basePerDay)}`} v={formatMAD(q.subtotal)} />
            {q.discountAmount ? <Row k={`Remise −${q.discountPct} %`} v={`−${formatMAD(q.discountAmount)}`} /> : null}
            {q.extrasTotal ? <Row k="Options" v={formatMAD(q.extrasTotal)} /> : null}
            {q.deliveryFee || q.oneWayFee ? <Row k="Livraison" v={formatMAD((q.deliveryFee || 0) + (q.oneWayFee || 0))} /> : null}
            <Row k={<strong>Total</strong>} v={<strong className="text-accent">{formatMAD(b.totalMad)}</strong>} />
            <Row k="Caution" v={formatMAD(q.deposit)} />
          </dl>
        </Card>
        <Card title="Suivi" className="lg:col-span-1">
          <BookingStatusForm booking={b} />
        </Card>
      </div>
    </>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-muted">{k}</dt>
      <dd className="text-end text-text">{v}</dd>
    </div>
  );
}
