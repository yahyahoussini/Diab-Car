import Link from 'next/link';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { getCalendar } from '@/lib/data';
import { ZOOMS, calendarWindow, dayOf } from '@/lib/calendar';
import FleetCalendar from '@/components/admin/FleetCalendar';

export const dynamic = 'force-dynamic';

const ZOOM_LABEL = { day: 'Jour', week: 'Semaine', month: 'Mois' };

/**
 * The fleet calendar (plan 7.3).
 *
 * The window is decided here, on the server, and handed to the client as data:
 * the same `calendarWindow()` runs in both places, so the columns the browser
 * draws and the rows the database answered for describe the same hours.
 *
 * One window = one query. `calendar_rows()` returns units, reservations and
 * blocks for the period in a single round trip, and it is `is_staff()`-gated,
 * so nothing here can leak to a session that is not staff.
 */
export default async function CalendarPage({ searchParams }) {
  await requireAdmin();
  const base = await getAdminBase();
  const sp = await searchParams;

  /* Read the clock ONCE and derive everything from it, so the window, the
     « today » link and the now-line on the grid cannot disagree by a tick. */
  const nowIso = new Date().toISOString();
  const today = dayOf(nowIso);

  const win = calendarWindow({
    zoom: ZOOMS.includes(sp?.zoom) ? sp.zoom : 'week',
    anchor: typeof sp?.at === 'string' ? sp.at : today,
  });

  const data = await getCalendar({ from: win.from, to: win.to }).catch(() => ({ units: [], reservations: [], blocks: [] }));

  const href = (patch) => {
    const params = new URLSearchParams({ zoom: patch.zoom || win.zoom, at: patch.at || win.anchor });
    return `${base}/calendrier?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Calendrier</h1>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-1" aria-label="Zoom">
            {ZOOMS.map((z) => (
              <Link
                key={z}
                href={href({ zoom: z })}
                aria-current={win.zoom === z ? 'true' : undefined}
                data-zoom={z}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  win.zoom === z ? 'border-text bg-text text-bg' : 'border-border text-text-2 hover:text-text'
                }`}
              >
                {ZOOM_LABEL[z]}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Link href={href({ at: win.prev })} aria-label="Période précédente" className="rounded-md border border-border px-3 py-1.5 text-sm text-text-2 hover:text-text">
              ←
            </Link>
            <Link href={href({ at: today })} className="rounded-md border border-border px-3 py-1.5 text-sm text-text-2 hover:text-text">
              Aujourd’hui
            </Link>
            <Link href={href({ at: win.next })} aria-label="Période suivante" className="rounded-md border border-border px-3 py-1.5 text-sm text-text-2 hover:text-text">
              →
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-1 text-sm text-text-muted">
        <span className="tnum">{win.title}</span> · {data.units?.length || 0} unités · {data.reservations?.length || 0} réservations
      </p>

      <div className="mt-6">
        <FleetCalendar win={win} data={data} nowIso={nowIso} base={base} />
      </div>
    </div>
  );
}
