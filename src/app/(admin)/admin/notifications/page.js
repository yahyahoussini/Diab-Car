import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { listNotifications } from '@/lib/data';
import { markRead } from '@/lib/actions/admin-notifications';

export const dynamic = 'force-dynamic';

/** The bell's list (plan 7.4). Newest first, unread marked. */
export default async function NotificationsPage() {
  await requireAdmin();
  const base = await getAdminBase();
  const rows = await listNotifications({ limit: 60 }).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-text">Notifications</h1>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">Rien pour le moment.</p>
      ) : (
        <ul className="mt-6 space-y-2" data-testid="notification-list">
          {rows.map((n) => (
            <li key={n.id} className={`rounded-lg border p-4 ${n.readAt ? 'border-border bg-surface-1' : 'border-border-strong bg-surface-2'}`}>
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    n.level === 'urgent' ? 'bg-red-signal' : n.level === 'action' ? 'bg-warning' : 'bg-border-strong'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-xs text-text-muted">{n.body}</p> : null}
                  {/* The stored href is host-agnostic ("/reservations/…"), so the
                      base is prefixed here rather than baked into the row — the
                      same notification then works on admin.diabcar.ma and on
                      localhost/admin. */}
                  {n.href ? (
                    <a href={`${base}${n.href}`} className="mt-2 inline-block text-xs font-semibold text-red-signal hover:underline">
                      Ouvrir →
                    </a>
                  ) : null}
                </div>
                {!n.readAt ? (
                  <form action={markRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="shrink-0 text-xs font-semibold text-text-2 hover:text-text">
                      Marquer lu
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
