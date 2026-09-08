import Link from 'next/link';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { listCustomers, listReservations, listVehicles } from '@/lib/data';
import { formatDateTime, formatMAD } from '@/lib/format';
import { RESERVATION_STATUSES, STATUS_LABEL, STATUS_TONE } from '@/lib/reservation-states';

export const dynamic = 'force-dynamic';

/**
 * The reservations list (plan 7.1).
 *
 * Reads the REAL `reservations` table — the operational object the availability
 * engine, the funnel and the calendar all share. The admin used to list the
 * starter's legacy `bookings` table, which the funnel stopped writing to in
 * PROMPT 09, so this page was showing a frozen history of pre-engine leads.
 *
 * Filtering, search and paging are done here rather than in SQL because the
 * whole set is a few hundred rows for a 36-car fleet; a query per filter would
 * be more machinery than the problem deserves. If it ever stops being true,
 * the adapter is the place to push it down to.
 */

const STATUSES = RESERVATION_STATUSES;
const PAGE_SIZE = 25;

export default async function ReservationsPage({ searchParams }) {
  await requireAdmin();
  const base = await getAdminBase();
  const sp = await searchParams;

  const status = STATUSES.includes(sp?.status) ? sp.status : undefined;
  const q = (typeof sp?.q === 'string' ? sp.q : '').trim().toLowerCase();
  const page = Math.max(1, Number(sp?.page) || 1);

  const [all, vehicles, customers] = await Promise.all([
    listReservations({ status, limit: 500 }).catch(() => []),
    listVehicles({ asStaff: true,  asStaff: true }).catch(() => []),
    listCustomers().catch(() => []),
  ]);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  /* The global search box in the shell submits here. It looks in the places an
     operator actually knows a booking by: its reference, or the customer on
     the phone (name or number). */
  const matches = (r) => {
    if (!q) return true;
    const c = customerById.get(r.customerId);
    const v = vehicleById.get(r.vehicleId);
    return [r.reference, c?.firstName, c?.lastName, c?.phone, c?.email, v?.brand, v?.model]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q));
  };

  const filtered = all.filter(matches);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (patch) => {
    const params = new URLSearchParams();
    if (patch.status ?? status) params.set('status', patch.status ?? status);
    if (patch.q ?? q) params.set('q', patch.q ?? q);
    if (patch.page && patch.page > 1) params.set('page', String(patch.page));
    const s = params.toString();
    return `${base}/reservations${s ? `?${s}` : ''}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Réservations</h1>
        <Link href={`${base}/reservations/nouvelle`} className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-white">
          + Nouvelle
        </Link>
        <p className="text-sm text-text-muted">
          <span className="tnum">{filtered.length}</span> résultat{filtered.length > 1 ? 's' : ''}
          {q ? ` pour « ${q} »` : ''}
        </p>
      </div>

      {/* ---- status chips ---- */}
      <div className="mt-5 flex flex-wrap gap-2" data-testid="status-filters">
        <Chip href={href({ status: '', page: 1 })} active={!status}>
          Toutes
        </Chip>
        {STATUSES.map((s) => {
          const n = all.filter((r) => r.status === s).length;
          return (
            <Chip key={s} href={href({ status: s, page: 1 })} active={status === s}>
              {STATUS_LABEL[s]} <span className="tnum text-text-muted">{status ? '' : n}</span>
            </Chip>
          );
        })}
      </div>

      {/* ---- search ---- */}
      <form method="get" className="mt-4 flex gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Référence, nom, téléphone, véhicule…"
          data-testid="reservations-search"
          className="w-full max-w-sm rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
        <button type="submit" className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
          Chercher
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">Aucune réservation pour ces filtres.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm" data-testid="reservations-table">
            <thead>
              <tr className="border-b border-border text-start text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                <Th>Référence</Th>
                <Th>Statut</Th>
                <Th>Client</Th>
                <Th>Véhicule</Th>
                <Th>Dates</Th>
                <Th className="text-end">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = vehicleById.get(r.vehicleId);
                const c = customerById.get(r.customerId);
                return (
                  <tr key={r.id} className="border-b border-border transition-colors hover:bg-surface-2">
                    <Td>
                      <Link href={`${base}/reservations/${r.id}`} className="font-latin-sans font-semibold text-text hover:underline">
                        {r.reference}
                      </Link>
                    </Td>
                    <Td>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[r.status] || 'bg-surface-2 text-text-2'}`}>{STATUS_LABEL[r.status] || r.status}</span>
                    </Td>
                    <Td className="text-text-2">{c ? `${c.firstName} ${c.lastName}`.trim() : '—'}</Td>
                    <Td className="text-text-2">{v ? `${v.brand} ${v.model}` : '—'}</Td>
                    <Td className="tnum whitespace-nowrap text-text-2">
                      {formatDateTime(r.startAt, 'fr')} → {formatDateTime(r.endAt, 'fr')}
                    </Td>
                    <Td className="tnum text-end text-text">{r.quote?.total != null ? formatMAD(r.quote.total, 'fr') : '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center gap-2" aria-label="Pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={href({ page: p })}
              aria-current={p === page ? 'page' : undefined}
              className={`tnum rounded-md px-3 py-1.5 text-sm ${p === page ? 'bg-text text-bg' : 'border border-border text-text-2 hover:text-text'}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function Chip({ href, active, children }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'border-text bg-text text-bg' : 'border-border text-text-2 hover:border-border-strong hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}

const Th = ({ children, className = '' }) => <th className={`px-3 py-2 text-start font-semibold ${className}`}>{children}</th>;
const Td = ({ children, className = '' }) => <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
