'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConditionMap, { conditionFromDamages } from '@/components/admin/ConditionMap';
import InspectionPhotos from '@/components/admin/InspectionPhotos';
import SignaturePad from '@/components/admin/SignaturePad';
import { submitReturn } from '@/lib/actions/operations';
import { formatDateTime } from '@/lib/format';
import { uploadSignature } from '@/lib/images/browser';
import { createBrowserSupabase } from '@/lib/supabase/client';

/**
 * Le retour — the half of the loop that moves the public site (plan 7.1).
 *
 * `complete_return` writes the event, flips the reservation to `returned`, the
 * unit to `cleaning`, and inserts a CLEANING BLOCK. That block is what takes
 * the car out of `search_availability()`; the status alone would not. Nobody
 * presses "publish" and nobody should have to.
 *
 * The damage map here means NEW damage. What the départ recorded is printed
 * next to it, because the only fair question at a return is "what is on the
 * car that was not on it when it left".
 */

const FUEL_STEPS = [
  { value: 0, label: 'Vide' },
  { value: 25, label: '¼' },
  { value: 50, label: '½' },
  { value: 75, label: '¾' },
  { value: 100, label: 'Plein' },
];

export default function ReturnChecklist({ base = '/admin', reservation, customer, vehicleName, unit, locations = [], pickup = null, storage = true }) {
  const router = useRouter();

  const [mileage, setMileage] = useState('');
  const [fuel, setFuel] = useState(null);
  const [damages, setDamages] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [signed, setSigned] = useState(false);
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState(reservation.dropoffLocationId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const signatureRef = useRef(null);

  const mileageNum = mileage.trim() === '' ? null : Number(mileage);
  /* Distance is shown live so an obvious typo — 4 530 instead of 45 300 —
     is caught at the counter and not by the accountant a month later. */
  const distance = pickup?.mileageKm != null && mileageNum !== null && Number.isFinite(mileageNum) ? mileageNum - pickup.mileageKm : null;
  const fuelDelta = pickup?.fuelPct != null && fuel !== null ? fuel - pickup.fuelPct : null;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (mileageNum === null || !Number.isFinite(mileageNum) || mileageNum < 0) {
      setError('Relevez le kilométrage au compteur avant d’enregistrer le retour.');
      return;
    }
    if (fuel === null) {
      setError('Indiquez le niveau de carburant au retour.');
      return;
    }
    if (distance !== null && distance < 0) {
      setError(`Le compteur affiche moins qu’au départ (${pickup.mileageKm} km). Vérifiez le relevé avant d’enregistrer.`);
      return;
    }

    setBusy(true);
    try {
      let signaturePath = null;
      if (signed && storage && signatureRef.current) {
        signaturePath = await uploadSignature(createBrowserSupabase(), {
          canvas: signatureRef.current,
          reservationId: reservation.id,
          kind: 'return-signature',
        });
      }

      const result = await submitReturn({
        id: reservation.id,
        mileageKm: mileageNum,
        fuelPct: fuel,
        condition: conditionFromDamages(damages),
        damages: damages.map(({ id, ...d }) => d),
        photos,
        signaturePath,
        notes: notes.trim(),
        locationId: locationId || null,
        reason: `retour ${reservation.reference}`,
      });

      if (result?.ok) {
        /* The cleaning news travels in the URL so it lands on the page the
           operator is about to look at, instead of flashing here for the
           length of a navigation. */
        const params = new URLSearchParams({ fait: reservation.reference, nettoyage: String(result.cleaningMinutes ?? '') });
        if (result.cleaningBlock === false) params.set('bloc', 'manquant');
        router.push(`${base}/operations/retours?${params.toString()}`);
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
    <form onSubmit={submit} className="space-y-8" data-testid="return-checklist">
      {/* ---- compteur ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Compteur au retour</h2>
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
              data-testid="return-mileage"
            />
            {pickup?.mileageKm != null ? (
              <span className="mt-1 block text-xs text-text-muted">
                Au départ : <span className="tnum">{pickup.mileageKm}</span> km
                {distance !== null ? (
                  <>
                    {' · '}
                    <span className={`tnum ${distance < 0 ? 'text-red-signal' : 'text-text-2'}`}>{distance}</span> km parcourus
                  </>
                ) : null}
              </span>
            ) : (
              <span className="mt-1 block text-xs text-text-muted">Aucun relevé de départ enregistré pour cette réservation.</span>
            )}
          </label>

          <div>
            <span className="mb-1 block text-xs text-text-muted">Carburant</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Niveau de carburant au retour">
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
                data-testid="return-fuel"
              />
            </label>
            {pickup?.fuelPct != null ? (
              <span className="mt-1 block text-xs text-text-muted">
                Au départ : <span className="tnum">{pickup.fuelPct}</span> %
                {fuelDelta !== null && fuelDelta < 0 ? (
                  <span className="text-warning"> · manque {Math.abs(fuelDelta)} points</span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---- nouveaux dommages ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <ConditionMap
          damages={damages}
          onChange={setDamages}
          reservationId={reservation.id}
          kind="return-damage"
          storage={storage}
          title="Nouveaux dommages"
          hint="Uniquement ce qui n’était pas là au départ."
        />
        {pickup?.condition?.zones && Object.keys(pickup.condition.zones).length > 0 ? (
          <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-text-2">
            Déjà relevé au départ : {Object.keys(pickup.condition.zones).join(', ')}. Ces zones ne sont pas à recharger au client.
          </p>
        ) : (
          <p className="mt-3 text-xs text-text-muted">Aucun dommage n’avait été relevé au départ.</p>
        )}
      </section>

      {/* ---- photos ---- */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <InspectionPhotos
          reservationId={reservation.id}
          kind="return"
          storage={storage}
          onChange={setPhotos}
          label="Photos du véhicule au retour"
          hint="Les mêmes angles qu’au départ : c’est ce qui rend la comparaison possible."
        />
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
            <span className="mb-1 block text-xs text-text-muted">Lieu de restitution</span>
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
              placeholder="Rendu avec 2 h de retard, intérieur à shampouiner…"
              className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
            />
          </label>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-signal bg-red-soft p-4 text-sm text-text" role="alert" data-testid="return-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-full bg-red px-6 text-sm font-semibold text-on-red transition-colors hover:bg-red-hover disabled:opacity-50"
          data-testid="return-submit"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer le retour'}
        </button>
        <p className="text-xs text-text-muted">
          {vehicleName} {unit?.plate ? `· ${unit.plate} ` : ''}· retour prévu {formatDateTime(reservation.endAt, 'fr')}. La voiture passera en nettoyage et sortira de la vente jusqu’à ce qu’elle soit marquée prête.
        </p>
      </div>
    </form>
  );
}

/** The database answer, in a sentence an operator can act on (plan 4.13). */
function describe(result, base, id) {
  if (!result) return 'Aucune réponse du serveur. Rien n’a été enregistré.';
  switch (result.error) {
    case 'ILLEGAL_TRANSITION':
      return `Impossible depuis l’état « ${result.from} » : un retour ne se fait que sur une réservation en cours. Le départ a-t-il bien été enregistré ?${
        result.allowed?.length ? ` Possible ici : ${result.allowed.join(', ')}.` : ''
      }`;
    case 'UNIT_REQUIRED':
      return `Aucune unité n’est assignée à cette réservation. Assignez une plaque sur ${base}/reservations/${id}, puis reprenez le retour.`;
    case 'FORBIDDEN':
      return 'Votre rôle ne permet pas d’enregistrer un retour.';
    case 'NOT_FOUND':
      return 'Réservation introuvable — elle a peut-être été supprimée dans un autre onglet.';
    case 'VALIDATION':
      return `Formulaire incomplet ou invalide : ${Object.keys(result.fieldErrors || {}).join(', ') || 'champ inconnu'}.`;
    default:
      return `Échec : ${result.error || 'inconnu'}. Rien n’a été enregistré.`;
  }
}
