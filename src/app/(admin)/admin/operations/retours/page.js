import Link from 'next/link';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { getOperationsDay } from '@/lib/data';
import { addDays, formatDate, formatDateTime, formatMAD, formatPhone, formatTime, todayISO } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/reservation-states';
import { bookingConfirmedMessage, whatsappLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCE = /^[A-Za-z0-9-]{1,24}$/;

const UNIT_STATUS_LABEL = { cleaning: 'en nettoyage', returned: 'rendue, à contrôler', maintenance: 'en entretien' };

/**
 * Retours du jour (plan 7.1).
 *
 * Three lists, in the order they cost money:
 *
 *  1. EN RETARD — every car still out past its return time, whatever day it
 *     was due. `operations_day()` computes it against `now()` and not against
 *     the day being browsed, on purpose: an overdue car is today's problem.
 *  2. Les retours attendus ce jour-là.
 *  3. À PRÉPARER — the units sitting in `cleaning`. They are off sale until
 *     somebody marks them prête, so a forgotten line here is a car that
 *     silently stops earning.
 */
export default async function RetoursPage({ searchParams }) {
  await requireAdmin();
  const base = await getAdminBase();
  const sp = await searchParams;

  /* One clock read, once per request. "En retard" means late RIGHT NOW, so
     reading the clock IS the point of this page; the route is force-dynamic,
     so it is evaluated once per request and there is no second render to
     disagree with it (same argument as the dashboard). */
  const today = todayISO();
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const day = DAY.test(sp?.day || '') ? sp.day : today;
  const done = REFERENCE.test(sp?.fait || '') ? sp.fait : null;
  const cleaningMinutes = /^\d{1,4}$/.test(sp?.nettoyage || '') ? Number(sp.nettoyage) : null;
  const blockMissing = sp?.bloc === 'manquant';

  const data = await getOperationsDay(day).catch(() => null);
  const returns = data?.returns || [];
  const overdue = data?.overdue || [];
  const toPrepare = data?.toPrepare || [];
  const finished = returns.filter((r) => r.returned).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Retours</h1>
          <p className="mt-1 text-sm text-text-muted">
            <span className="tnum">{formatDate(`${day}T09:00:00+01:00`, 'fr', 'long')}</span>
            {day === today ? ' · aujourd’hui' : ''}
          </p>
        </div>
        <DayNav base={base} day={day} today={today} />
      </div>

      {done ? (
        <div className="mt-6 rounded-lg border border-success bg-success-soft p-4 text-sm text-text" role="status">
          <p>
            Retour <span className="font-latin-sans font-semibold">{done}</span> enregistré. La voiture est en nettoyage
            {cleaningMinutes ? (
              <>
                {' '}
                pour <span className="tnum">{cleaningMinutes}</span> minutes
              </>
            ) : null}{' '}
            et n’est plus en vente tant qu’elle n’est pas marquée prête.
          </p>
          {blockMissing ? (
            <p className="mt-2 font-semibold">
              Attention : le blocage de nettoyage n’a pas pu être écrit (un créneau existe déjà, ou une réservation confirmée commence
              pendant le nettoyage). Le retour est bien enregistré, mais vérifiez la disponibilité de cette unité.
            </p>
          ) : null}
        </div>
      ) : null}

      {!data ? (
        <p className="mt-8 rounded-lg border border-warning bg-warning-soft p-4 text-sm text-text">
          La liste du jour n’a pas pu être chargée. Rechargez la page ; si cela persiste, les retours restent accessibles depuis les
          réservations.
        </p>
      ) : null}

      {/* ---- 1. en retard ---- */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">En retard</h2>
        {overdue.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Aucune voiture en retard. Toute la flotte est rentrée à l’heure.</p>
        ) : (
          <ol className="mt-3 space-y-2" data-testid="overdue">
            {overdue.map((row) => (
              <ReturnRow key={row.id} row={row} base={base} lateBy={lateLabel(now, row.end_at)} />
            ))}
          </ol>
        )}
      </section>

      {/* ---- 2. retours du jour ---- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Retours du jour</h2>
          <p className="text-sm text-text-2">
            <span className="tnum font-semibold text-text">{returns.length}</span> attendu{returns.length > 1 ? 's' : ''}
            {returns.length > 0 ? (
              <>
                {' · '}
                <span className="tnum">{finished}</span> déjà rentré{finished > 1 ? 's' : ''}
              </>
            ) : null}
          </p>
        </div>
        {returns.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">
            Aucun retour prévu ce jour-là.
          </p>
        ) : (
          <ol className="mt-3 space-y-2" data-testid="returns">
            {returns.map((row) => (
              <ReturnRow key={row.id} row={row} base={base} lateBy={null} />
            ))}
          </ol>
        )}
      </section>

      {/* ---- 3. à préparer ---- */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">À préparer</h2>
        <p className="mt-1 text-xs text-text-muted">
          Ces unités sont hors vente tant qu’elles ne sont pas marquées prêtes. C’est la dernière étape de la boucle.
        </p>
        {toPrepare.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">Aucune voiture en attente de préparation.</p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="to-prepare">
            {toPrepare.map((u) => (
              <li key={u.unitId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 p-4">
                <div>
                  <p className="text-sm text-text">
                    <span className="font-latin-sans font-semibold">{u.plate || u.unitId}</span> · {u.vehicle}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {UNIT_STATUS_LABEL[u.status] || u.status}
                    {u.since ? (
                      <>
                        {' · depuis '}
                        <span className="tnum">{formatDateTime(u.since, 'fr')}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <Link
                  href={`${base}/flotte/unites/${u.unitId}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 text-sm font-semibold text-text"
                >
                  Ouvrir l’unité
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReturnRow({ row, base, lateBy }) {
  const locale = row.locale || 'fr';
  const wa = row.phone
    ? whatsappLink(
        row.phone,
        bookingConfirmedMessage(locale, {
          reference: row.reference,
          vehicleName: row.vehicle,
          from: formatDateTime(row.start_at, locale),
          to: formatDateTime(row.end_at, locale),
          total: row.total != null ? formatMAD(row.total, locale) : undefined,
        }),
      )
    : null;

  return (
    <li className={`rounded-lg border bg-surface-1 p-4 ${lateBy ? 'border-red-signal' : row.returned ? 'border-border' : 'border-border-strong'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="tnum shrink-0 text-2xl font-semibold text-text">{formatTime(row.end_at, 'fr')}</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <Link href={`${base}/reservations/${row.id}`} className="font-latin-sans text-sm font-semibold text-text hover:underline">
                {row.reference}
              </Link>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[row.status] || 'bg-surface-2 text-text-2'}`}>
                {STATUS_LABEL[row.status] || row.status}
              </span>
              {lateBy ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-signal">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-signal" aria-hidden="true" />
                  {lateBy}
                </span>
              ) : null}
              {row.returned ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  Retour fait
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-sm text-text-2">
              {row.customer || 'Client non rattaché'}
              {row.phone ? (
                <>
                  {' · '}
                  <a href={`tel:${row.phone}`} className="font-latin-sans hover:underline">
                    {formatPhone(row.phone)}
                  </a>
                </>
              ) : null}
            </p>
            <p className="mt-0.5 text-sm text-text-muted">
              {row.vehicle}
              {row.plate ? <span className="font-latin-sans"> · {row.plate}</span> : ' · aucune unité assignée'}
              {row.total != null ? <span className="tnum"> · {formatMAD(row.total, 'fr')}</span> : null}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-text-2 hover:text-text"
            >
              WhatsApp
            </a>
          ) : null}
          {row.returned ? (
            <Link
              href={`${base}/reservations/${row.id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-text-2 hover:text-text"
            >
              Voir la réservation
            </Link>
          ) : (
            <Link
              href={`${base}/operations/checklist/${row.id}?mode=return`}
              className="inline-flex min-h-11 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red transition-colors hover:bg-red-hover"
              data-testid="do-return"
            >
              Faire le retour
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** "3 h de retard", "2 j de retard" — the number an operator repeats on the phone. */
function lateLabel(now, endAt) {
  const late = now - Date.parse(endAt);
  if (!Number.isFinite(late) || late <= 0) return null;
  const hours = Math.floor(late / 3600000);
  if (hours < 1) return `${Math.max(1, Math.floor(late / 60000))} min de retard`;
  if (hours < 48) return `${hours} h de retard`;
  return `${Math.floor(hours / 24)} j de retard`;
}

/* Local copy of the day navigator (see the départs page for why). */
function DayNav({ base, day, today, section = 'retours' }) {
  const link = (target, label, current) => (
    <Link
      href={`${base}/operations/${section}?day=${target}`}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
        current ? 'border-border-strong bg-surface-2 text-text' : 'border-border text-text-2 hover:text-text'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Choisir le jour">
      {link(addDays(day, -1), 'Hier', false)}
      {link(today, 'Aujourd’hui', day === today)}
      {link(addDays(day, 1), 'Demain', false)}
    </nav>
  );
}
