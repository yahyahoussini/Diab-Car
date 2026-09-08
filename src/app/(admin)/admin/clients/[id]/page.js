import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { getCustomerProfile } from '@/lib/data';
import { formatDate, formatDateTime, formatMAD, formatPhone } from '@/lib/format';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/reservation-states';
import CustomerNotes from '@/components/admin/CustomerNotes';

export const dynamic = 'force-dynamic';

/**
 * One client (plan 7.1).
 *
 * The whole file in a single RPC — `customer_profile()` in migration 0011 —
 * so the totals come from one snapshot of the reservations table rather than
 * from whatever rows the page happened to load. "Revenue" counts only rentals
 * that actually happened (active, returned, closed): a cancellation is not
 * money we earned, and showing it as such would be inventing a fact (rule 11).
 */
export default async function CustomerPage({ params }) {
  await requireAdmin();
  const base = await getAdminBase();
  const { id } = await params;

  const profile = await getCustomerProfile(id).catch(() => null);
  const customer = profile?.customer;
  if (!customer) notFound();

  const totals = profile.totals || {};
  const reservations = profile.reservations || [];
  const locale = customer.locale || 'fr';
  const wa = customer.phone ? whatsappLink(customer.phone, genericMessage(locale)) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`${base}/clients`} className="text-sm text-text-muted hover:text-text">
        ← Clients
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-text">{`${customer.firstName} ${customer.lastName}`.trim()}</h1>
      <p className="mt-1 text-sm text-text-muted">
        Client depuis <span className="tnum">{customer.createdAt ? formatDate(customer.createdAt, 'fr') : '—'}</span>
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Coordonnées</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Téléphone" value={<bdi className="font-latin-sans">{formatPhone(customer.phone)}</bdi>} />
            <Row label="WhatsApp" value={customer.whatsapp ? <bdi className="font-latin-sans">{formatPhone(customer.whatsapp)}</bdi> : '—'} />
            <Row label="E-mail" value={customer.email || '—'} />
            <Row label="Langue" value={locale} />
          </dl>
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" data-testid="customer-whatsapp" className="mt-5 inline-block rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
              WhatsApp (dans sa langue)
            </a>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-surface-1 p-5" data-testid="customer-totals">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Totaux</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Locations" value={<span className="tnum">{totals.count ?? 0}</span>} />
            <Row label="Jours loués" value={<span className="tnum">{Number(totals.days) || 0}</span>} />
            <Row label="Chiffre d’affaires" value={<span className="tnum font-semibold text-text">{formatMAD(Number(totals.revenue) || 0, 'fr')}</span>} />
            <Row label="Annulations / no-show" value={<span className="tnum">{totals.cancelled ?? 0}</span>} />
          </dl>
          <p className="mt-4 text-xs text-text-muted">Le chiffre d’affaires ne compte que les locations parties, rendues ou clôturées.</p>
        </section>

        <section className="rounded-lg border border-border bg-surface-1 p-5">
          <CustomerNotes id={customer.id} notes={customer.notes} />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Historique</h2>
        {reservations.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Aucune location pour ce client.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm" data-testid="customer-history">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  <th className="px-3 py-2 text-start font-semibold">Référence</th>
                  <th className="px-3 py-2 text-start font-semibold">Statut</th>
                  <th className="px-3 py-2 text-start font-semibold">Véhicule</th>
                  <th className="px-3 py-2 text-start font-semibold">Dates</th>
                  <th className="px-3 py-2 text-end font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="border-b border-border transition-colors hover:bg-surface-2">
                    <td className="px-3 py-2.5">
                      <Link href={`${base}/reservations/${r.id}`} className="font-latin-sans font-semibold text-text hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[r.status] || 'bg-surface-2 text-text-2'}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-2">{r.vehicle || '—'}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5 text-text-2">
                      {formatDateTime(r.startAt, 'fr')} → {formatDateTime(r.endAt, 'fr')}
                    </td>
                    <td className="tnum px-3 py-2.5 text-end text-text">{r.total != null ? formatMAD(Number(r.total), 'fr') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
