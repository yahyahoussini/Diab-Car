import Link from 'next/link';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { getOperationsDay } from '@/lib/data';
import { addDays, formatDate, formatDateTime, formatMAD, formatPhone, formatTime, todayISO } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/reservation-states';
import { bookingConfirmedMessage, whatsappLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCE = /^[A-Za-z0-9-]{1,24}$/;

/**
 * Départs du jour (plan 7.1).
 *
 * The counter's morning list: who is coming, at what time, for which plate,
 * and the one button that starts the checklist. Everything else — the money,
 * the history, the state machine — lives on the reservation page; this screen
 * exists to be worked through from top to bottom and emptied.
 *
 * One query, `operations_day()`, for the whole page. The row shape it returns
 * is raw SQL (`start_at`, `picked_up`), not the camelCase the adapters produce
 * elsewhere — it is a jsonb document from one RPC, not a table read.
 */
export default async function DepartsPage({ searchParams }) {
  await requireAdmin();
  const base = await getAdminBase();
  const sp = await searchParams;

  /* One clock read, once per request. The route is force-dynamic, so "today"
     is the day the operator opened the page and nothing re-renders behind it. */
  const today = todayISO();
  const day = DAY.test(sp?.day || '') ? sp.day : today;
  const done = REFERENCE.test(sp?.fait || '') ? sp.fait : null;

  const data = await getOperationsDay(day).catch(() => null);
  const departures = data?.departures || [];
  const finished = departures.filter((r) => r.picked_up).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Départs</h1>
          <p className="mt-1 text-sm text-text-muted">
            <span className="tnum">{formatDate(`${day}T09:00:00+01:00`, 'fr', 'long')}</span>
            {day === today ? ' · aujourd’hui' : ''}
          </p>
        </div>
        <DayNav base={base} day={day} today={today} />
      </div>

      {done ? (
        <p className="mt-6 rounded-lg border border-success bg-success-soft p-4 text-sm text-text" role="status">
          Départ <span className="font-latin-sans font-semibold">{done}</span> enregistré. La réservation est « en cours » et l’unité est
          en location.
        </p>
      ) : null}

      {!data ? (
        <p className="mt-8 rounded-lg border border-warning bg-warning-soft p-4 text-sm text-text">
          La liste du jour n’a pas pu être chargée. Rechargez la page ; si cela persiste, les départs restent accessibles depuis les
          réservations.
        </p>
      ) : null}

      <p className="mt-6 text-sm text-text-2">
        <span className="tnum font-semibold text-text">{departures.length}</span> départ{departures.length > 1 ? 's' : ''}
        {departures.length > 0 ? (
          <>
            {' · '}
            <span className="tnum">{finished}</span> déjà fait{finished > 1 ? 's' : ''}
          </>
        ) : null}
      </p>

      {departures.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">
          Aucun départ prévu ce jour-là. Rien à préparer au comptoir.
        </p>
      ) : (
        <ol className="mt-4 space-y-2" data-testid="departures">
          {departures.map((row) => (
            <DepartureRow key={row.id} row={row} base={base} />
          ))}
        </ol>
      )}
    </div>
  );
}

function DepartureRow({ row, base }) {
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
    <li className={`rounded-lg border bg-surface-1 p-4 ${row.picked_up ? 'border-border' : 'border-border-strong'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="tnum shrink-0 text-2xl font-semibold text-text">{formatTime(row.start_at, 'fr')}</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <Link href={`${base}/reservations/${row.id}`} className="font-latin-sans text-sm font-semibold text-text hover:underline">
                {row.reference}
              </Link>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[row.status] || 'bg-surface-2 text-text-2'}`}>
                {STATUS_LABEL[row.status] || row.status}
              </span>
              {row.picked_up ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  Départ fait
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
          {row.picked_up ? (
            <Link
              href={`${base}/reservations/${row.id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-text-2 hover:text-text"
            >
              Voir la réservation
            </Link>
          ) : (
            <Link
              href={`${base}/operations/checklist/${row.id}?mode=pickup`}
              className="inline-flex min-h-11 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red transition-colors hover:bg-red-hover"
              data-testid="do-pickup"
            >
              Faire le départ
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/* Hier / aujourd’hui / demain — the only three days a counter ever needs.
   Deliberately local: a page module exports a page, not a component library,
   and the retours screen carries its own copy of these twenty lines rather
   than importing across two routes. */
function DayNav({ base, day, today, section = 'departs' }) {
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
