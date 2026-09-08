'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeUnitStatus, readyUnit, saveUnit } from '@/lib/actions/units';

/**
 * The three ways an operator changes a physical car (plan 7.1).
 *
 * They live in one file because they share one vocabulary: every server answer
 * here is a `{ok:false,error:'CODE'}` object, and `describe()` is the single
 * place that turns a code into a French sentence an operator can act on. Two
 * spellings of "cette voiture est en location" would be one spelling too many.
 *
 * Nothing here decides anything. The status list, the plate uniqueness and the
 * refusal to send a rented car to the workshop all belong to Postgres; these
 * forms ask, and render what comes back (rule 5).
 *
 * The status labels arrive as a `statuses` prop instead of being imported:
 * this is a client module, and the server pages that also need those labels
 * cannot read a constant across the boundary. One list, passed down.
 */

export default function UnitEditor({ unit = null, vehicles = [], locations = [], statuses = [], canEdit = true }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const editing = Boolean(unit?.id);

  if (!canEdit) {
    return (
      <p className="rounded-lg border border-border bg-surface-1 p-4 text-sm text-text-2">
        Votre rôle permet de consulter cette unité, pas de la modifier. Demandez à un responsable.
      </p>
    );
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    setBusy(true);
    setMessage(null);
    const result = await call(() => saveUnit({ ...values, id: unit?.id }));
    setBusy(false);

    if (result?.ok) {
      /* A creation form that keeps the last plate on screen invites the same
         car to be entered twice; an edit form that forgets its values would
         hide what was just saved. */
      if (!editing) form.reset();
      setMessage({ tone: 'ok', text: editing ? 'Unité enregistrée.' : `Unité ${result.unit?.plate || ''} créée.` });
      startTransition(() => router.refresh());
      return;
    }
    setMessage({ tone: 'error', text: describe(result) });
  };

  const pending = busy || refreshing;

  return (
    <form onSubmit={onSubmit} data-testid="unit-editor" className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Modèle" hint="Le véhicule marketé dont cette voiture est un exemplaire.">
          <select name="vehicleId" required defaultValue={unit?.vehicleId || ''} className={CONTROL}>
            <option value="">— Choisir —</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {`${v.brand} ${v.model}${v.year ? ` ${v.year}` : ''}`}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Plaque">
          <input name="plate" required maxLength={24} defaultValue={unit?.plate || ''} placeholder="12345-A-6" className={`${CONTROL} font-latin-sans`} />
        </Field>

        <Field label="VIN" hint="Facultatif.">
          <input name="vin" maxLength={32} defaultValue={unit?.vin || ''} className={`${CONTROL} font-latin-sans`} />
        </Field>

        <Field label="Couleur">
          <input name="color" maxLength={40} defaultValue={unit?.color || ''} placeholder="Blanc" className={CONTROL} />
        </Field>

        <Field label="Année">
          <input type="number" name="year" min={1980} max={2100} step={1} defaultValue={unit?.year ?? ''} className={`${CONTROL} tnum`} />
        </Field>

        <Field label="Kilométrage">
          <input type="number" name="mileageKm" min={0} max={2000000} step={1} defaultValue={unit?.mileageKm ?? 0} className={`${CONTROL} tnum`} />
        </Field>

        <Field label="Carburant %">
          <input type="number" name="fuelPct" min={0} max={100} step={1} defaultValue={unit?.fuelPct ?? ''} className={`${CONTROL} tnum`} />
        </Field>

        {/* `unit_dossier()` returns the place as `locationId`, the units row
            calls it `current_location_id`; the form has to prefill from either
            or "Non précisé" would silently erase the car's location on save. */}
        <Field label="Lieu actuel">
          <select name="currentLocationId" defaultValue={unit?.currentLocationId || unit?.locationId || ''} className={CONTROL}>
            <option value="">— Non précisé —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {locationName(l)}
                {l.active === false ? ' (désactivé)' : ''}
              </option>
            ))}
          </select>
        </Field>

        {/* On an existing car the status belongs to the changer, which demands
            a motif; here it only sets the starting state of a car that did not
            exist a second ago. It still travels on every save: `save_unit`
            rewrites every column on conflict, so an edit that omitted the
            status would quietly put a car in maintenance back on sale. */}
        {editing ? (
          <input type="hidden" name="status" value={unit.status || 'available'} />
        ) : (
          <Field label="Statut initial">
            <select name="status" defaultValue="available" className={CONTROL}>
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Notes internes">
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={unit?.notes || ''} className={CONTROL} />
      </Field>

      <Field label="Motif" hint="Écrit au journal avec la modification.">
        <input name="reason" maxLength={200} placeholder={editing ? 'Correction du kilométrage…' : 'Nouvelle voiture au parc'} className={CONTROL} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red transition-colors hover:bg-red-hover disabled:opacity-50">
          {editing ? 'Enregistrer' : 'Créer l’unité'}
        </button>
        <Message message={message} />
      </div>
    </form>
  );
}

/**
 * The status changer. A motif is not optional decoration: `set_unit_status`
 * refuses without one, so the field is required here for the same reason it is
 * required there — a car off the road must have a written why.
 */
export function UnitStatusChanger({ unit, statuses = [] }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const onSubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());

    setBusy(true);
    setMessage(null);
    const result = await call(() => changeUnitStatus({ unitId: unit.id, status: String(values.status), reason: String(values.reason || '') }));
    setBusy(false);

    if (result?.ok) {
      setMessage({ tone: 'ok', text: `Statut : ${labelOf(statuses, result.to)}.` });
      startTransition(() => router.refresh());
      return;
    }
    setMessage({ tone: 'error', text: describe(result) });
  };

  const pending = busy || refreshing;

  return (
    <form onSubmit={onSubmit} data-testid="unit-status" className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
      <Field label="Nouveau statut">
        <select name="status" defaultValue={unit.status || 'available'} className={CONTROL}>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Motif (obligatoire)">
        <input name="reason" required maxLength={200} placeholder="Vidange, pare-brise, immobilisée…" className={CONTROL} />
      </Field>
      <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-full border border-border-strong px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-2 disabled:opacity-50">
        Changer le statut
      </button>
      <div className="sm:col-span-3">
        <Message message={message} />
      </div>
    </form>
  );
}

/**
 * « Marquer prête » — the last step of the return loop, one click from the list
 * because that is where the operator already is when the car comes back clean.
 * It closes the cleaning block, which is what puts the car back on sale.
 */
export function MarkReadyButton({ unitId, plate, compact = false }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!window.confirm(`Marquer ${plate || 'cette unité'} prête ? Le nettoyage est clos et la voiture repart à la vente.`)) return;

    setBusy(true);
    setError(null);
    const result = await call(() => readyUnit({ unitId, reason: 'véhicule prêt' }));
    setBusy(false);

    if (result?.ok) {
      startTransition(() => router.refresh());
      return;
    }
    setError(describe(result));
  };

  const pending = busy || refreshing;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        data-testid="mark-ready"
        className={`inline-flex items-center rounded-full border border-success/40 bg-success-soft font-semibold text-success transition-colors hover:border-success disabled:opacity-50 ${compact ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm'}`}
      >
        Marquer prête
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-signal">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ plumbing */

const CONTROL =
  'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-border-strong focus:outline-none';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}

function Message({ message }) {
  if (!message) return null;
  return message.tone === 'ok' ? (
    <p role="status" className="text-sm text-success">
      {message.text}
    </p>
  ) : (
    <p role="alert" data-testid="unit-error" className="rounded-lg border border-red-signal/40 bg-red-soft/30 px-3 py-2 text-sm text-text">
      {message.text}
    </p>
  );
}

/**
 * `requireRole` throws rather than returning, which is right for an action —
 * but an unhandled rejection in a click handler shows the operator nothing at
 * all. Caught here and named, so a refused role reads as a refusal.
 */
async function call(fn) {
  try {
    return await fn();
  } catch {
    return { ok: false, error: 'FORBIDDEN' };
  }
}

function labelOf(statuses, value) {
  return statuses.find((s) => s.value === value)?.label || value;
}

function locationName(location) {
  if (!location) return '';
  const name = location.name;
  if (typeof name === 'string') return name;
  return name?.fr || name?.en || location.key || location.id;
}

const FIELD_LABEL = {
  vehicleId: 'le modèle',
  plate: 'la plaque',
  vin: 'le VIN',
  color: 'la couleur',
  year: 'l’année',
  mileageKm: 'le kilométrage',
  fuelPct: 'le carburant',
  currentLocationId: 'le lieu',
  notes: 'les notes',
  reason: 'le motif',
};

/** One machine code, one sentence an operator can act on. */
function describe(result) {
  if (!result) return 'Aucune réponse du serveur.';
  switch (result.error) {
    case 'VALIDATION':
      return result.field ? `Vérifiez ${FIELD_LABEL[result.field] || result.field}.` : 'Un champ est invalide.';
    case 'PLATE_TAKEN':
      return 'Cette plaque appartient déjà à une autre unité.';
    case 'VEHICLE_REQUIRED':
      return 'Choisissez le modèle dont cette voiture est un exemplaire.';
    case 'INVALID_VALUE':
      return 'Une valeur est hors limites : année, kilométrage ou carburant.';
    case 'REASON_REQUIRED':
      return 'Un motif est obligatoire : c’est ce qui expliquera, dans six semaines, pourquoi cette voiture était hors service.';
    case 'UNIT_OUT':
      return 'Cette voiture est en location. Enregistrez d’abord le retour.';
    case 'NOT_FOUND':
      return 'Unité introuvable.';
    case 'FORBIDDEN':
      return 'Votre rôle ne permet pas cette action.';
    case 'NO_ANSWER':
      return 'La base n’a pas répondu. Réessayez.';
    default:
      return `Échec : ${result.error || 'inconnu'}.`;
  }
}
