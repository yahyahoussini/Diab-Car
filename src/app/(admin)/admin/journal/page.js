import { requirePageRole } from '@/lib/auth/server';
import { listAuditLog } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * The Journal (plan 7.1): the activity log, with before/after and the reason.
 *
 * Owner and manager only. `audit_log` stores whole row snapshots, so it
 * contains customer names and phone numbers that an agent has no reason to
 * browse in bulk — the RLS policy in 0005 says the same thing, and this guard
 * makes the UI agree instead of showing an empty page and looking broken.
 */
const TABLES = ['reservations', 'units', 'vehicles', 'blocks', 'settings'];

export default async function JournalPage({ searchParams }) {
  await requirePageRole(['owner', 'manager']);
  const sp = await searchParams;

  const table = TABLES.includes(sp?.table) ? sp.table : undefined;
  const since = typeof sp?.since === 'string' && sp.since ? new Date(sp.since).toISOString() : undefined;

  const rows = await listAuditLog({ table, since, limit: 120 }).catch(() => []);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold text-text">Journal</h1>
      <p className="mt-1 text-sm text-text-muted">
        Chaque écriture sur les réservations, les unités, les véhicules, les blocs et les paramètres, avec l’avant, l’après et le motif.
      </p>

      {/* Filters are a GET form: the URL stays the state, so a filtered view
          can be shared and the back button behaves. */}
      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Table</span>
          <select name="table" defaultValue={table || ''} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text">
            <option value="">Toutes</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Depuis</span>
          <input type="date" name="since" defaultValue={typeof sp?.since === 'string' ? sp.since : ''} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text" />
        </label>
        <button type="submit" className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-white">
          Filtrer
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">Aucune entrée pour ces filtres.</p>
      ) : (
        <ul className="mt-6 space-y-2" data-testid="journal-entries">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface-1">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="tnum shrink-0 text-xs text-text-muted">{stamp(r.at)}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ACTION_TONE[r.action] || 'bg-surface-2 text-text-2'}`}>{r.action}</span>
                  <span className="font-medium text-text">{r.tableName}</span>
                  <span className="truncate text-xs text-text-muted">{r.rowKey || r.rowId || ''}</span>
                  {r.reason ? <span className="ms-auto truncate text-xs text-text-2">« {r.reason} »</span> : null}
                </summary>

                <div className="border-t border-border px-4 py-3">
                  <Diff before={r.before} after={r.after} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTION_TONE = {
  INSERT: 'bg-success-soft text-success',
  UPDATE: 'bg-warning-soft text-warning',
  DELETE: 'bg-red-soft text-red-signal',
};

/**
 * Only the fields that actually changed. A whole-row dump would bury the one
 * line that matters — and `updated_at` moves on every write, so it is dropped
 * rather than reported as a change.
 */
function Diff({ before, after }) {
  const a = before || {};
  const b = after || {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => k !== 'updated_at')
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .sort();

  if (keys.length === 0) return <p className="text-xs text-text-muted">Aucun champ modifié.</p>;

  return (
    <dl className="grid gap-2 text-xs sm:grid-cols-[10rem_1fr]">
      {keys.map((k) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-text-2">{k}</dt>
          <dd className="min-w-0">
            <span className="me-2 break-all text-text-muted line-through">{render(a[k])}</span>
            <span className="break-all text-text">{render(b[k])}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function render(v) {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function stamp(iso) {
  try {
    return new Intl.DateTimeFormat('fr', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}
