import { db, getVehicleById } from '@/lib/data';
import { getAdminBase } from '@/lib/auth/server';
import { formatDateTime, formatMAD } from '@/lib/format';
import { AdminLink, Card, PageTitle, Stat, StatusBadge, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const base = await getAdminBase();
  const d = await db();
  const [stats, recent] = await Promise.all([d.getStats(), d.listBookings({ limit: 8 })]);
  const vehicles = await Promise.all(recent.map((b) => getVehicleById(b.vehicleId)));

  return (
    <>
      <PageTitle title="Tableau de bord" description="Vue d’ensemble de l’activité Diab Car." actions={<AdminLink href={`${base}/vehicules/new`}>+ Ajouter un véhicule</AdminLink>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Demandes en attente" value={stats.pending} hint="À confirmer sur WhatsApp" tone={stats.pending ? 'accent' : undefined} />
        <Stat label="Locations confirmées / en cours" value={stats.active} />
        <Stat label="Réservations ce mois" value={stats.monthBookings} hint={`CA estimé : ${formatMAD(stats.revenueMad)}`} />
        <Stat label="Flotte publiée" value={`${stats.fleetPublished} / ${stats.fleetTotal}`} />
      </div>

      <Card title="Dernières demandes" className="mt-6">
        <Table head={['Référence', 'Client', 'Véhicule', 'Dates', 'Total', 'Statut', '']}>
          {recent.map((b, i) => (
            <tr key={b.id} className="hover:bg-surface-2/50">
              <td className="px-4 py-3 font-latin-sans font-semibold">{b.reference}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-text">{b.customerName}</div>
                <div className="text-xs text-text-muted">{b.customerPhone}</div>
              </td>
              <td className="px-4 py-3">{vehicles[i] ? `${vehicles[i].brand} ${vehicles[i].model}` : '—'}</td>
              <td className="px-4 py-3 text-xs text-text-2">
                {formatDateTime(b.startAt)}
                <br />
                {formatDateTime(b.endAt)}
              </td>
              <td className="px-4 py-3 tnum">{formatMAD(b.totalMad)}</td>
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
        </Table>
      </Card>
    </>
  );
}
