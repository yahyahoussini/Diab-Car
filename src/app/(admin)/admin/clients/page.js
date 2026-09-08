import Link from 'next/link';
import { getAdminBase, getAdminSession, requireAdmin } from '@/lib/auth/server';
import { canManagePricing } from '@/lib/auth/session';
import { listCustomerDuplicates, listCustomers, listReservations } from '@/lib/data';
import { formatDate, formatPhone } from '@/lib/format';
import MergeDuplicates from '@/components/admin/MergeDuplicates';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

/**
 * The client list (plan 7.1).
 *
 * Duplicates are surfaced at the top rather than hidden behind a tool, because
 * the moment they matter is the moment someone is looking a client up and finds
 * half their history. Postgres decides what counts as a duplicate — the last
 * nine digits of the number, `phone_key()` in migration 0011 — so the list and
 * the merge agree on which rows are the same human.
 */
export default async function ClientsPage({ searchParams }) {
  await requireAdmin();
  const session = await getAdminSession();
  const base = await getAdminBase();
  const sp = await searchParams;

  const q = (typeof sp?.q === 'string' ? sp.q : '').trim().toLowerCase();
  const page = Math.max(1, Number(sp?.page) || 1);

  const [customers, reservations, duplicates] = await Promise.all([
    listCustomers().catch(() => []),
    listReservations({ limit: 1000 }).catch(() => []),
    listCustomerDuplicates().catch(() => []),
  ]);

  const counts = new Map();
  for (const r of reservations) counts.set(r.customerId, (counts.get(r.customerId) || 0) + 1);

  const filtered = q
    ? customers.filter((c) =>
        [c.firstName, c.lastName, c.phone, c.email].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
      )
    : customers;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Clients</h1>
        <p className="text-sm text-text-muted">
          <span className="tnum">{filtered.length}</span> fiche{filtered.length > 1 ? 's' : ''}
        </p>
      </div>

      <form method="get" className="mt-5 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Nom, téléphone, e-mail…"
          data-testid="clients-search"
          className="w-full max-w-sm rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
        <button type="submit" className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
          Chercher
        </button>
      </form>

      {duplicates.length > 0 ? (
        <div className="mt-6">
          <MergeDuplicates groups={duplicates} canMerge={canManagePricing(session?.role)} base={base} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">Aucun client pour cette recherche.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm" data-testid="clients-table">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                <Th>Nom</Th>
                <Th>Téléphone</Th>
                <Th>E-mail</Th>
                <Th>Langue</Th>
                <Th className="text-end">Locations</Th>
                <Th>Depuis</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border transition-colors hover:bg-surface-2">
                  <Td>
                    <Link href={`${base}/clients/${c.id}`} className="font-semibold text-text hover:underline">
                      {`${c.firstName} ${c.lastName}`.trim() || '—'}
                    </Link>
                  </Td>
                  <Td className="text-text-2">
                    <bdi className="font-latin-sans">{formatPhone(c.phone)}</bdi>
                  </Td>
                  <Td className="text-text-2">{c.email || '—'}</Td>
                  <Td className="text-text-2">{c.locale || 'fr'}</Td>
                  <Td className="tnum text-end text-text-2">{counts.get(c.id) || 0}</Td>
                  <Td className="tnum text-text-muted">{c.createdAt ? formatDate(c.createdAt, 'fr') : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex flex-wrap items-center gap-2" aria-label="Pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (p > 1) params.set('page', String(p));
            const s = params.toString();
            return (
              <Link
                key={p}
                href={`${base}/clients${s ? `?${s}` : ''}`}
                aria-current={p === page ? 'page' : undefined}
                className={`tnum rounded-md px-3 py-1.5 text-sm ${p === page ? 'bg-text text-bg' : 'border border-border text-text-2 hover:text-text'}`}
              >
                {p}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

const Th = ({ children, className = '' }) => <th className={`px-3 py-2 text-start font-semibold ${className}`}>{children}</th>;
const Td = ({ children, className = '' }) => <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
