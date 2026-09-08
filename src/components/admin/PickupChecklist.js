'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConditionMap, { conditionFromDamages } from '@/components/admin/ConditionMap';
import InspectionPhotos from '@/components/admin/InspectionPhotos';
import SignaturePad from '@/components/admin/SignaturePad';
import { submitPickup } from '@/lib/actions/operations';
import { formatDateTime, formatMAD } from '@/lib/format';
import { uploadSignature } from '@/lib/images/browser';
import { createBrowserSupabase } from '@/lib/supabase/client';

/**
 * Le départ — handing the keys over (plan 7.1).
 *
 * This form is the agency's evidence. Everything on it exists because of a
 * dispute somebody could have three weeks later: who took the car, with which
 * papers, at what mileage, with which scratches already on it, and what they
 * actually paid at the counter.
 *
 * The three ticks are checked HERE and again by `complete_pickup` in Postgres.
 * The submit button is deliberately NOT disabled when one is missing: an
 * operator who cannot press the button learns nothing, so the button is
 * pressed and the refusal is written out in full — the same sentence the
 * database would send back (rule 5, plan 4.13).
 *
 * The signature is uploaded inside this submit, not by the pad: one press,
 * and either the whole départ is recorded or nothing is.
 */

const CHECKS = [
  { key: 'identityChecked', label: 'Identité vérifiée', hint: 'CIN ou passeport, en main, comparé au visage.' },
  { key: 'documentsChecked', label: 'Documents vérifiés', hint: 'Permis valide, date de délivrance, ancienneté suffisante.' },
  { key: 'unitChecked', label: 'Unité correcte', hint: 'La plaque devant vous est bien celle de la réservation.' },
];

const FUEL_STEPS = [
  { value: 0, label: 'Vide' },
  { value: 25, label: '¼' },
  { value: 50, label: '½' },
  { value: 75, label: '¾' },
  { value: 100, label: 'Plein' },
];

export default function PickupChecklist({ base = '/admin', reservation, customer, vehicleName, unit, locations = [], storage = true }) {
  const router = useRouter();

  const [checks, setChecks] = useState({ identityChecked: false, documentsChecked: false, unitChecked: false });
  const [mileage, setMileage] = useState(unit?.mileageKm != null ? String(unit.mileageKm) : '');
  const [fuel, setFuel] = useState(null);
  const [damages, setDamages] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [signed, setSigned] = useState(false);
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState(reservation.pickupLocationId || '');

  const total = reservation.quote?.total ?? null;
  const [payMethod, setPayMethod] = useState('especes');
  const [received, setReceived] = useState(total != null ? String(total) : '');
  const [depositAmount, setDepositAmount] = useState(reservation.quote?.deposit != null ? String(reservation.quote.deposit) : '');
  const [depositMethod, setDepositMethod] = useState('tpe');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const signatureRef = useRef(null);

  const missing = CHECKS.filter((c) => !checks[c.key]);
  const receivedNum = Number(received || 0);
  const balance = total != null ? Math.round(total - receivedNum) : null;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (missing.length > 0) {
      setError(
        `Départ refusé : ${missing.map((m) => m.label.toLowerCase()).join(', ')}. Les trois contrôles sont la preuve que l’agence a vu la personne et ses papiers — la base de données les exige aussi.`,
      );
      return;
    }
    const mileageKm = mileage.trim() === '' ? null : Number(mileage);
    if (mileageKm === null || !Number.isFinite(mileageKm) || mileageKm < 0) {
      setError('Relevez le kilométrage au compteur avant de remettre les clés.');
      return;
    }
    if (fuel === null) {
      setError('Indiquez le niveau de carburant au départ.');
      return;
    }
    const depositNum = Number(depositAmount || 0);
    if (!Number.isFinite(receivedNum) || receivedNum < 0 || !Number.isFinite(depositNum) || depositNum < 0) {
      setError('Le montant encaissé ou la caution est invalide. Ces deux chiffres sont le seul enregistrement de ce qui a changé de main.');
      return;
    }

    setBusy(true);
    try {
      let signaturePath = null;
      if (signed && storage && signatureRef.current) {
        signaturePath = await uploadSignature(createBrowserSupabase(), {
          canvas: signatureRef.current,
          reservationId: reservation.id,
          kind: 'pickup-signature',
        });
      }

      const result = await submitPickup({
        id: reservation.id,
        ...checks,
        mileageKm,
        fuelPct: fuel,
        condition: conditionFromDamages(damages),
        /* The local id is a UI artifact — the event row should not carry it. */
        damages: damages.map(({ id, ...d }) => d),
        photos,
        signaturePath,
        notes: notes.trim(),
        locationId: locationId || null,
        payment: {
          method: payMethod,
          amountReceived: receivedNum,
          deposit: { amount: depositNum, method: depositMethod },
        },
        reason: `départ ${reservation.reference}`,
      });

      if (result?.ok) {
        router.push(`${base}/operations/departs?fait=${encodeURIComponent(reservation.reference)}`);
        router.refresh();
        return;
      }
      setError(describe(result, base, reservation.id));
    } catch (err) {
      setError(err?.message ? `Échec : ${err.message}` : 'Échec inattendu. Rien n’a été enregistré.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-8" data-testid="pickup-checklist">
      {/* ---- contrôles ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Contrôles obligatoires</h2>
        <ul className="mt-3 space-y-2">
          {CHECKS.map((c) => (
            <li key={c.key}>
              <label
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  checks[c.key] ? 'border-success bg-success-soft' : 'border-border'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checks[c.key]}
                  onChange={(event) => setChecks((prev) => ({ ...prev, [c.key]: event.target.checked }))}
                  className="mt-1 h-5 w-5 accent-success"
                  data-check={c.key}
                />
                <span>
                  <span className="block text-sm font-semibold text-text">{c.label}</span>
                  <span className="block text-xs text-text-muted">{c.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {missing.length > 0 ? (
          <p className="mt-3 text-xs text-text-muted">
            Il en manque {missing.length}. Le départ sera refusé tant que les trois ne sont pas cochés.
          </p>
        ) : null}
      </section>

      {/* ---- compteur ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Compteur</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Kilométrage (km)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="999999"
              step="1"
              value={mileage}
              onChange={(event) => setMileage(event.target.value)}
              className="tnum min-h-11 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm text-text"
              data-testid="pickup-mileage"
            />
            {unit?.mileageKm != null ? (
              <span className="mt-1 block text-xs text-text-muted">
                Dernier relevé connu : <span className="tnum">{unit.mileageKm}</span> km.
              </span>
            ) : null}
          </label>

          <div>
            <span className="mb-1 block text-xs text-text-muted">Carburant</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Niveau de carburant au départ">
              {FUEL_STEPS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={fuel === s.value}
                  onClick={() => setFuel(s.value)}
                  className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors ${
                    fuel === s.value ? 'border-border-strong bg-surface-3 text-text' : 'border-border text-text-2 hover:text-text'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2">
              <span className="text-xs text-text-muted">Exact (%)</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="100"
                step="1"
                value={fuel === null ? '' : fuel}
                onChange={(event) => {
                  const v = event.target.value;
                  setFuel(v === '' ? null : Math.max(0, Math.min(100, Number(v))));
                }}
                className="tnum min-h-11 w-24 rounded-lg border border-border bg-surface-1 px-3 text-sm text-text"
                data-testid="pickup-fuel"
              />
            </label>
          </div>
        </div>
      </section>

      {/* ---- état des lieux ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <ConditionMap
          damages={damages}
          onChange={setDamages}
          reservationId={reservation.id}
          kind="pickup-damage"
          storage={storage}
          title="État des lieux au départ"
          hint="Tout ce qui est noté ici ne pourra pas être facturé au client au retour."
        />
      </section>

      {/* ---- photos ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <InspectionPhotos
          reservationId={reservation.id}
          kind="pickup"
          storage={storage}
          onChange={setPhotos}
          label="Photos du véhicule au départ"
          hint="Quatre angles au minimum : avant, arrière, et les deux côtés."
        />
      </section>

      {/* ---- encaissement ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Encaissement</h2>
        {/* Diab Car takes nothing online (plan 9.5). This block is the record
            of what changed hands at the counter — not a quote, not a promise. */}
        <p className="mt-1 text-xs text-text-muted">
          Ce que vous avez réellement encaissé, pas ce qui est dû.
          {total != null ? (
            <>
              {' '}
              Total de la réservation : <span className="tnum">{formatMAD(total, 'fr')}</span>.
            </>
          ) : null}
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs text-text-muted">Méthode</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Méthode d’encaissement">
              {[
                { value: 'especes', label: 'Espèces' },
                { value: 'tpe', label: 'TPE' },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={payMethod === m.value}
                  onClick={() => setPayMethod(m.value)}
                  className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors ${
                    payMethod === m.value ? 'border-border-strong bg-surface-3 text-text' : 'border-border text-text-2 hover:text-text'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Montant reçu (MAD)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="10"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
              className="tnum min-h-11 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm text-text"
              data-testid="pickup-received"
            />
            {balance !== null && balance !== 0 ? (
              <span className="mt-1 block text-xs text-warning">
                {balance > 0 ? (
                  <>
                    Reste dû : <span className="tnum">{formatMAD(balance, 'fr')}</span>
                  </>
                ) : (
                  <>
                    Encaissé en plus : <span className="tnum">{formatMAD(-balance, 'fr')}</span>
                  </>
                )}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Caution prise (MAD)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="100"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              className="tnum min-h-11 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm text-text"
              data-testid="pickup-deposit"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs text-text-muted">Caution — méthode</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Méthode de la caution">
              {[
                { value: 'tpe', label: 'TPE' },
                { value: 'especes', label: 'Espèces' },
                { value: 'aucune', label: 'Aucune' },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={depositMethod === m.value}
                  onClick={() => setDepositMethod(m.value)}
                  className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors ${
                    depositMethod === m.value ? 'border-border-strong bg-surface-3 text-text' : 'border-border text-text-2 hover:text-text'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- signature ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <SignaturePad
          canvasRef={signatureRef}
          signed={signed}
          onSignedChange={setSigned}
          label={customer ? `Signature — ${customer.firstName} ${customer.lastName || ''}`.trim() : 'Signature du client'}
          hint={storage ? undefined : 'Mode démo : la signature ne sera pas envoyée.'}
          disabled={busy}
        />
      </section>

      {/* ---- lieu et notes ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Lieu de remise</span>
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm text-text"
            >
              <option value="">— non précisé —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name?.fr || l.key || l.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Notes internes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Siège bébé fourni, réservoir plein, client pressé…"
              className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
            />
          </label>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-signal bg-red-soft p-4 text-sm text-text" role="alert" data-testid="pickup-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-full bg-red px-6 text-sm font-semibold text-on-red transition-colors hover:bg-red-hover disabled:opacity-50"
          data-testid="pickup-submit"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer le départ'}
        </button>
        <p className="text-xs text-text-muted">
          {vehicleName} {unit?.plate ? `· ${unit.plate} ` : ''}· départ prévu {formatDateTime(reservation.startAt, 'fr')}. La réservation passe « en cours » et l’unité en « louée ».
        </p>
      </div>
    </form>
  );
}

/** The database answer, in a sentence an operator can act on (plan 4.13). */
function describe(result, base, id) {
  if (!result) return 'Aucune réponse du serveur. Rien n’a été enregistré.';
  switch (result.error) {
    case 'CHECKS_INCOMPLETE':
      return 'Départ refusé : les trois contrôles (identité, documents, unité) doivent être cochés. C’est la preuve que l’agence a vu la personne et ses papiers.';
    case 'UNIT_REQUIRED':
      return `Aucune unité n’est assignée à cette réservation. Assignez une plaque sur ${base}/reservations/${id}, puis reprenez le départ.`;
    case 'ILLEGAL_TRANSITION':
      return `Impossible depuis l’état « ${result.from} » : un départ ne se fait que sur une réservation confirmée ou préparée.${
        result.allowed?.length ? ` Possible ici : ${result.allowed.join(', ')}.` : ''
      }`;
    case 'FORBIDDEN':
      return 'Votre rôle ne permet pas d’enregistrer un départ.';
    case 'NOT_FOUND':
      return 'Réservation introuvable — elle a peut-être été supprimée dans un autre onglet.';
    case 'VALIDATION':
      return `Formulaire incomplet ou invalide : ${Object.keys(result.fieldErrors || {}).join(', ') || 'champ inconnu'}.`;
    default:
      return `Échec : ${result.error || 'inconnu'}. Rien n’a été enregistré.`;
  }
}
