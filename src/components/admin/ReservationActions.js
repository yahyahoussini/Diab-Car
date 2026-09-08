'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignUnit, changeStatus, moveDates, overridePrice } from '@/lib/actions/reservations';
import { NEEDS_REASON, STATUS_LABEL, TRANSITION_LABEL } from '@/lib/reservation-states';

/**
 * The state machine, the unit assignment and the price override (plan 7.1).
 *
 * Every button here asks Postgres and RENDERS WHAT IT ANSWERS. A conflict is
 * not a failure toast: it comes back naming the reservation in the way and the
 * dates it occupies, because "Conflit : réservé 10–15 sept" is what lets an
 * operator solve the problem, and "Erreur" is not (plan 6.3).
 *
 * Cancellation and no-show demand a reason before the request is even sent —
 * but the database demands it too, so a client that skipped this check would
 * simply be refused (rule 5).
 */

export default function ReservationActions({ reservation, allowed, freeUnits, canPrice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const run = async (fn) => {
    setError(null);
    setNotice(null);
    const result = await fn();

    if (result?.ok) {
      setNotice('Enregistré.');
      startTransition(() => router.refresh());
      return;
    }
    setError(describe(result));
  };

  return (
    <div data-testid="reservation-actions">
      {/* ---- state machine ---- */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Actions</p>
      {allowed.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Aucune action possible depuis « {STATUS_LABEL[reservation.status] || reservation.status} ».</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {allowed.map((next) => (
            <button
              key={next}
              type="button"
              disabled={pending}
              data-action={next}
              onClick={() => {
                /* The confirmation is not ceremony: these change what a
                   customer is owed. A reason is collected for the two that a
                   customer may later dispute. */
                if (NEEDS_REASON.includes(next)) {
                  const reason = window.prompt(`Motif obligatoire pour « ${TRANSITION_LABEL[next]} » :`);
                  if (!reason || !reason.trim()) return;
                  run(() => changeStatus({ id: reservation.id, status: next, reason: reason.trim() }));
                  return;
                }
                if (!window.confirm(`${TRANSITION_LABEL[next]} la réservation ${reservation.reference} ?`)) return;
                run(() => changeStatus({ id: reservation.id, status: next }));
              }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                NEEDS_REASON.includes(next) ? 'border border-border-strong text-text-2 hover:text-text' : 'bg-red text-white'
              }`}
            >
              {TRANSITION_LABEL[next] || next}
            </button>
          ))}
        </div>
      )}

      {/* ---- unit assignment ---- */}
      <div className="mt-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Unité</p>
        {freeUnits.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Aucune unité libre pour cette période. Déplacez les dates ou libérez une voiture.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {freeUnits.map((u) => (
              <button
                key={u.unitId}
                type="button"
                disabled={pending}
                data-unit={u.unitId}
                onClick={() => run(() => assignUnit({ id: reservation.id, unitId: u.unitId, reason: 'assignation' }))}
                className={`rounded-lg border px-3 py-2 font-latin-sans text-sm transition-colors disabled:opacity-50 ${
                  reservation.unitId === u.unitId ? 'border-red-signal bg-red-soft text-red-signal' : 'border-border text-text-2 hover:text-text'
                }`}
              >
                {u.plate || u.unitId.slice(0, 8)}
              </button>
            ))}
          </div>
        )}
        {/* Only units the DATABASE says are free are offered, so a click here
            cannot be refused for a conflict (units_free_for_reservation). */}
        <p className="mt-2 text-xs text-text-muted">Seules les unités libres sur la période sont proposées.</p>
      </div>

      {/* ---- dates ---- */}
      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const startAt = new Date(String(form.get('startAt'))).toISOString();
          const endAt = new Date(String(form.get('endAt'))).toISOString();
          run(() => moveDates({ id: reservation.id, startAt, endAt, reason: 'modification des dates' }));
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Dates</p>
        {/* The keyboard-accessible way to move a reservation — the calendar's
            drag is a shortcut for this, never the only route (plan 7.3). */}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Départ</span>
            <input type="datetime-local" name="startAt" defaultValue={local(reservation.startAt)} required className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Retour</span>
            <input type="datetime-local" name="endAt" defaultValue={local(reservation.endAt)} required className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text" />
          </label>
          <button type="submit" disabled={pending} data-testid="save-dates" className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text disabled:opacity-50">
            Déplacer
          </button>
        </div>
      </form>

      {/* ---- price override ---- */}
      {canPrice ? (
        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const total = Number(form.get('total'));
            const reason = String(form.get('reason') || '').trim();
            if (!reason) {
              setError('Un motif est obligatoire pour modifier le prix.');
              return;
            }
            run(() => overridePrice({ id: reservation.id, total, reason }));
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Prix</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Total MAD</span>
              <input type="number" name="total" min="0" step="10" defaultValue={reservation.quote?.total ?? ''} required className="tnum w-32 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text" />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-xs text-text-muted">Motif (obligatoire)</span>
              <input name="reason" required placeholder="Geste commercial, erreur de saisie…" className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text" />
            </label>
            <button type="submit" disabled={pending} data-testid="save-price" className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text disabled:opacity-50">
              Appliquer
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">Le devis d’origine est conservé et le motif est écrit au journal.</p>
        </form>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-lg border border-red-signal bg-red-soft/30 p-3 text-sm text-text" role="alert" data-testid="reservation-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-6 text-sm text-success" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/** Turn a machine answer into something an operator can act on. */
function describe(result) {
  if (!result) return 'Aucune réponse du serveur.';
  switch (result.error) {
    case 'CONFLICT':
      return result.reference
        ? `⚠ CONFLIT — ${result.reference} occupe déjà cette voiture du ${short(result.from)} au ${short(result.to)}.`
        : '⚠ CONFLIT — cette voiture est déjà prise sur cette période.';
    case 'BLOCKED':
      return '⚠ Cette unité est bloquée (maintenance ou nettoyage) sur cette période.';
    case 'ILLEGAL_TRANSITION':
      return `Transition impossible depuis « ${result.from} ». Possible : ${(result.allowed || []).join(', ') || 'aucune'}.`;
    case 'REASON_REQUIRED':
      return 'Un motif est obligatoire pour cette action.';
    case 'FORBIDDEN':
      return 'Votre rôle ne permet pas cette action.';
    case 'BAD_DATES':
      return 'Le retour doit être après le départ.';
    case 'NOT_FOUND':
      return 'Réservation introuvable.';
    default:
      return `Échec : ${result.error || 'inconnu'}.`;
  }
}

function short(iso) {
  try {
    return new Intl.DateTimeFormat('fr', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '?';
  }
}

/** ISO → the value a datetime-local input expects, in local time. */
function local(iso) {
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}
