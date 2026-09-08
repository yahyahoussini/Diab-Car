/**
 * The reservation state machine, mirrored for the UI (plan 6.1, 7.1).
 *
 * Postgres owns it — `reservation_next_states()` in supabase/migrations/0010 is
 * what actually refuses an illegal move, for the admin, a script and any future
 * client alike. This file exists so the admin can grey out a button before the
 * round trip, and so the list, the detail page and the calendar all colour a
 * status the same way. If the two ever disagree, the database wins and the UI
 * simply shows the refusal it sends back.
 */

export const RESERVATION_STATUSES = ['pending', 'confirmed', 'ready', 'active', 'returned', 'closed', 'cancelled', 'no_show'];

/** Statuses that hold a car — the ones the exclusion constraint cares about. */
export const OCCUPYING_STATUSES = ['pending', 'confirmed', 'ready', 'active'];

export const NEXT_STATES = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled', 'no_show'],
  ready: ['active', 'cancelled', 'no_show'],
  active: ['returned'],
  returned: ['closed'],
  closed: [],
  cancelled: [],
  no_show: [],
};

/** A customer may dispute these two later, so the operator states why. */
export const NEEDS_REASON = ['cancelled', 'no_show'];

export const STATUS_LABEL = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  ready: 'Préparée',
  active: 'En cours',
  returned: 'Rendue',
  closed: 'Clôturée',
  cancelled: 'Annulée',
  no_show: 'No-show',
};

/** The verb on the button that MOVES a reservation into that state. */
export const TRANSITION_LABEL = {
  confirmed: 'Confirmer',
  ready: 'Marquer préparée',
  active: 'Départ (remise des clés)',
  returned: 'Retour',
  closed: 'Clôturer',
  cancelled: 'Annuler',
  no_show: 'No-show',
};

/* Tokens only — no raw hex (rule 2). Red is reserved for `active`, the one
   state that means a car is out on the road right now. */
export const STATUS_TONE = {
  pending: 'bg-warning-soft text-warning',
  confirmed: 'bg-success-soft text-success',
  ready: 'bg-success-soft text-success',
  active: 'bg-red-soft text-red-signal',
  returned: 'bg-surface-2 text-text-2',
  closed: 'bg-surface-2 text-text-muted',
  cancelled: 'bg-surface-2 text-text-muted',
  no_show: 'bg-surface-2 text-text-muted',
};

export function nextStates(status) {
  return NEXT_STATES[status] || [];
}
