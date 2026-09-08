import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { getFleetSnapshot, getSettings, listNotifications, listReservations, listVehicles } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * The dashboard (plan 7.1).
 *
 * It answers one question before it shows anything else: what needs my
 * attention now. Charts and totals come after — an operator opening this at
 * 08:00 needs the list of things that will go wrong today, not a graph of last
 * month.
 */
export default async function AdminDashboard() {
  const session = await requireAdmin();
  const base = await getAdminBase();

  const [snapshot, settings, reservations, vehicles, notifications] = await Promise.all([
    getFleetSnapshot().catch(() => null),
    getSettings().catch(() => null),
    listReservations({ limit: 200 }).catch(() => []),
    listVehicles({ published: true }).catch(() => []),
    listNotifications({ unreadOnly: true, limit: 20 }).catch(() => []),
  ]);

  const vehicleName = (id) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.brand} ${v.model}` : '—';
  };

  /* Reading the clock is the point of this page: "action requise" means what
     is late RIGHT NOW, and the route is force-dynamic so it is evaluated once
     per request. react-hooks/purity guards CLIENT components, where an impure
     read makes two renders disagree; a server component rendered once per
     request has no second render to disagree with. */
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const HOUR = 3600000;

  /* ---- ACTION REQUISE (plan 7.1) ----
     Only things a person must do, each with why it is here. Sorted by how
     soon it hurts. */
  const actions = [];

  for (const r of reservations) {
    if (r.status === 'pending') {
      actions.push({ id: `p-${r.id}`, level: 'action', when: Date.parse(r.startAt), label: `Confirmer ${r.reference}`, detail: `${vehicleName(r.vehicleId)} · départ ${short(r.startAt)}`, href: `${base}/reservations/${r.id}` });
    }
    if (['pending', 'confirmed'].includes(r.status)) {
      const delta = Date.parse(r.startAt) - now;
      if (delta > 0 && delta < HOUR) {
        actions.push({ id: `s-${r.id}`, level: 'urgent', when: Date.parse(r.startAt), label: `Départ imminent ${r.reference}`, detail: `${vehicleName(r.vehicleId)} · dans ${Math.round(delta / 60000)} min, non préparé`, href: `${base}/reservations/${r.id}` });
      }
    }
    if (r.status === 'active' && Date.parse(r.endAt) < now) {
      actions.push({ id: `o-${r.id}`, level: 'urgent', when: Date.parse(r.endAt), label: `Retour en retard ${r.reference}`, detail: `${vehicleName(r.vehicleId)} · attendu ${short(r.endAt)}`, href: `${base}/reservations/${r.id}` });
    }
  }
  actions.sort((a, b) => (a.level === b.level ? a.when - b.when : a.level === 'urgent' ? -1 : 1));

  /* ---- today's timeline ---- */
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const inToday = (iso) => {
    const t = Date.parse(iso);
    return t >= startOfDay.getTime() && t < endOfDay.getTime();
  };

  const timeline = [];
  for (const r of reservations) {
    if (inToday(r.startAt)) timeline.push({ id: `d-${r.id}`, at: Date.parse(r.startAt), kind: 'Départ', label: `${r.reference} · ${vehicleName(r.vehicleId)}`, done: ['active', 'returned', 'closed'].includes(r.status), href: `${base}/reservations/${r.id}` });
    if (inToday(r.endAt)) timeline.push({ id: `r-${r.id}`, at: Date.parse(r.endAt), kind: 'Retour', label: `${r.reference} · ${vehicleName(r.vehicleId)}`, done: ['returned', 'closed'].includes(r.status), href: `${base}/reservations/${r.id}` });
  }
  timeline.sort((a, b) => a.at - b.at);

  const hello = greeting();

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold text-text">
          {hello}
          {session.email ? `, ${session.email.split('@')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          <span className="tnum">{new Intl.DateTimeFormat('fr', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}</span>
          {settings?.name ? ` · ${settings.name}` : ''}
          {settings?.city ? ` · ${settings.city}` : ''}
        </p>
      </header>

      {/* ---- strip ---- */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="dashboard-strip">
        <Stat label="Départs aujourd’hui" value={snapshot?.today.departures ?? 0} />
        <Stat label="Retours aujourd’hui" value={snapshot?.today.returns ?? 0} />
        <Stat label="Disponibles" value={snapshot?.units.available ?? 0} />
        <Stat label="En maintenance" value={snapshot?.units.maintenance ?? 0} />
        <Stat label="Action requise" value={actions.length} tone={actions.length ? 'urgent' : undefined} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        {/* ---- ACTION REQUISE ---- */}
        <section className="lg:col-span-7">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Action requise</h2>
          {actions.length === 0 ? (
            <p className="mt-4 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">
              Rien à traiter. Tout est à jour.
            </p>
          ) : (
            <ul className="mt-4 space-y-2" data-testid="action-required">
              {actions.slice(0, 12).map((a) => (
                <li key={a.id}>
                  <a href={a.href} className="flex items-start gap-3 rounded-lg border border-border bg-surface-1 p-3 transition-colors hover:border-border-strong">
                    <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${a.level === 'urgent' ? 'bg-red-signal' : 'bg-warning'}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">{a.label}</span>
                      <span className="block text-xs text-text-muted">{a.detail}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* ---- today's operations ---- */}
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Aujourd’hui</h2>
          {timeline.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">Aucun départ ni retour prévu aujourd’hui.</p>
          ) : (
            <ol className="mt-4 space-y-1" data-testid="today-timeline">
              {timeline.map((t) => (
                <li key={t.id}>
                  <a href={t.href} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-2 ${t.done ? 'text-text-muted' : 'text-text'}`}>
                    <span className="tnum w-12 shrink-0 text-xs text-text-muted">{time(t.at)}</span>
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${t.done ? 'bg-border-strong' : t.at < now ? 'bg-red-signal' : 'bg-text-muted'}`} aria-hidden="true" />
                    <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wider text-text-muted">{t.kind}</span>
                    <span className="truncate">{t.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ---- fleet status + bell ---- */}
        <aside className="lg:col-span-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">État de la flotte</h2>
          <dl className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface-1" data-testid="fleet-status">
            {[
              ['Disponibles', snapshot?.units.available],
              ['Réservées', snapshot?.units.reserved],
              ['En location', snapshot?.units.rented],
              ['Nettoyage', snapshot?.units.cleaning],
              ['Maintenance', snapshot?.units.maintenance],
              ['Total', snapshot?.units.total],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <dt className="text-sm text-text-2">{label}</dt>
                <dd className="tnum text-sm font-semibold text-text">{value ?? 0}</dd>
              </div>
            ))}
          </dl>

          {notifications.length ? (
            <>
              <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Notifications</h2>
              <ul className="mt-4 space-y-2">
                {notifications.slice(0, 6).map((n) => (
                  <li key={n.id} className="rounded-lg border border-border bg-surface-1 p-3">
                    <p className="text-sm font-medium text-text">{n.title}</p>
                    {n.body ? <p className="text-xs text-text-muted">{n.body}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {snapshot ? null : (
            <p className="mt-6 text-xs text-text-muted">
              Les compteurs sont indisponibles (base non accessible). Le reste de la page fonctionne.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === 'urgent' ? 'border-red-signal bg-red-soft/30' : 'border-border bg-surface-1'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className={`tnum mt-2 text-2xl font-semibold ${tone === 'urgent' ? 'text-red-signal' : 'text-text'}`}>{value}</p>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

const short = (iso) => {
  try {
    return new Intl.DateTimeFormat('fr', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '—';
  }
};

const time = (ms) => {
  try {
    return new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  } catch {
    return '';
  }
};
