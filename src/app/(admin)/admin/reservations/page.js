import Link from 'next/link';
import { db, getVehicleById } from '@/lib/data';
import { BOOKING_STATUSES } from '@/lib/constants';
import { getAdminBase } from '@/lib/auth/server';
import { formatDateTime, formatMAD } from '@/lib/format';
import { AdminLink, PageTitle, STATUS_LABEL, StatusBadge, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function BookingsPage({ searchParams }) {
  const { status } = await searchParams;
  const base = await getAdminBase();
  const bookings = await (await db()).listBookings({ status: status || undefined });
  const vehicles = await Promise.all(bookings.map((b) => getVehicleById(b.vehicleId)));

  return (
    <>
      <PageTitle title="Réservations" description="Demandes reçues depuis le site. Confirmez sur WhatsApp puis mettez à jour le statut." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`${base}/reservations`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!status ? 'border-text bg-text text-bg' : 'border-border text-text-2'}`}>
          Toutes
        </Link>
        {BOOKING_STATUSES.map((s) => (
          <Link key={s} href={`${base}/reservations?status=${s}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === s ? 'border-text bg-text text-bg' : 'border-border text-text-2'}`}>
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>
      <Table head={['Référence', 'Client', 'Véhicule', 'Prise en charge', 'Restitution', 'Total', 'Statut', '']}>
        {bookings.map((b, i) => (
          <tr key={b.id} className="hover:bg-surface-2/50">
            <td className="px-4 py-3">
              <div className="font-latin-sans font-semibold">{b.reference}</div>
              <div className="text-xs text-text-muted">{formatDateTime(b.createdAt)}</div>
            </td>
            <td className="px-4 py-3">
              <div className="font-medium text-text">{b.customerName}</div>
              <div className="text-xs text-text-muted">
                {b.customerPhone} · {b.customerCountry} · {b.locale?.toUpperCase()}
              </div>
            </td>
            <td className="px-4 py-3">{vehicles[i] ? `${vehicles[i].brand} ${vehicles[i].model}` : '—'}</td>
            <td className="px-4 py-3 text-xs">
              {b.pickupLabel}
              <br />
              <span className="text-text-muted">{formatDateTime(b.startAt)}</span>
            </td>
            <td className="px-4 py-3 text-xs">
              {b.dropoffLabel}
              <br />
              <span className="text-text-muted">{formatDateTime(b.endAt)}</span>
            </td>
            <td className="px-4 py-3 tnum font-semibold">{formatMAD(b.totalMad)}</td>
            <td className="px-4 py-3">
              <StatusBadge status={b.status} />
            </td>
            <td className="px-4 py-3 text-end">
              <AdminLink href={`${base}/reservations/${b.id}`} variant="secondary" className="h-8 px-3 text-xs">
                Ouvrir
              </AdminLink>
            </td>
          </tr>
        ))}
        {!bookings.length ? (
          <tr>
            <td colSpan={8} className="px-4 py-10 text-center text-text-muted">
              Aucune réservation.
            </td>
          </tr>
        ) : null}
      </Table>
    </>
  );
}
