'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removeLocation, saveLocation } from '@/lib/actions/pricing';
import { formatMAD } from '@/lib/format';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Card, LOCALE_LABEL, Notice } from '@/components/admin/ui';

/**
 * Lieux de prise en charge et de restitution (plan 6.2).
 *
 * A place is more than a label in a dropdown: its `kind` decides which fee
 * category the quote engine uses, and a row of kind `city` is how Diab Car
 * opens Rabat or Marrakech without a deploy.
 *
 * The fee field is the delicate one. EMPTY means "sur devis" and is saved as
 * NULL — never as 0, which would promise a free delivery nobody agreed to
 * (CLAUDE.md rule 11). The two are different answers and the UI keeps them
 * different: "Sur devis" versus "0 MAD".
 *
 * Rows are collapsed by default because a place has eleven fields and an
 * operator usually wants to read the list, not edit it — <details> keeps the
 * dense summary the admin design language asks for while the full form is one
 * click away, with no JavaScript state to get out of sync.
 */

const KINDS = [
  ['agency', 'Agence'],
  ['airport', 'Aéroport'],
  ['district', 'Quartier'],
  ['city', 'Ville'],
  ['custom', 'Autre'],
];

const KIND_LABEL = Object.fromEntries(KINDS);

const LOCALES_ORDER = ['fr', 'en', 'ar', 'es'];

const str = (fd, key) => String(fd.get(key) ?? '').trim();
const bool = (fd, key) => fd.get(key) === 'on';
const int = (fd, key, fallback = 0) => {
  const raw = str(fd, key);
  return raw === '' ? fallback : Number(raw);
};

/** Empty field → null → "sur devis". Zero is a real, free, quoted price. */
const feeFromForm = (fd, key) => {
  const raw = str(fd, key).replace(',', '.');
  return raw === '' ? null : Number(raw);
};

/**
 * The saved fee, whichever spelling the backend uses.
 *
 * The demo store and the booking module read `deliveryFee`; the Postgres
 * column is `delivery_fee_mad`, which the adapter's snake→camel pass turns
 * into `deliveryFeeMad`. Reading both here means the list is right on either
 * backend instead of showing "sur devis" for every place in production.
 */
const feeOf = (place) => {
  const raw = place.deliveryFee ?? place.deliveryFeeMad;
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/* Same story for 24h: `is_24h` survives the camel pass unchanged because the
   digit breaks the `_x` pattern. */
const is24hOf = (place) => {
  const raw = place.is24h ?? place['is_24h'];
  if (raw === null || raw === undefined || raw === '') return '';
  return raw ? 'true' : 'false';
};

const feeLabel = (fee) => (fee === null ? 'Sur devis' : formatMAD(fee, 'fr'));

const rowButton = 'rounded-full border border-border-strong px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-text-2 disabled:opacity-50';
const dangerButton = 'rounded-full px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-50';
const ghostButton = 'rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text disabled:opacity-50';
const primaryButton = 'inline-flex h-10 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red transition-colors hover:bg-red-hover disabled:opacity-50';

const SUMMARY_COLS = 'grid grid-cols-[minmax(11rem,1.6fr)_9rem_7rem_8rem_7rem_5rem_5rem] items-center gap-3';
const HEAD = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted';

export default function LocationsEditor({ locations, settings }) {
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const motif = () => {
    const value = reason.trim();
    if (value.length < 4) {
      setFeedback({ ok: false, text: 'Écrivez d’abord le motif : il part au Journal avec la modification.' });
      return null;
    }
    return value;
  };

  const run = async (key, call, onSuccess) => {
    setBusy(key);
    setFeedback(null);
    const result = await call();
    setBusy(null);
    setFeedback({
      ok: Boolean(result?.ok),
      text: result?.ok ? 'Enregistré. Le site public est régénéré.' : result?.message || 'Modification refusée.',
    });
    if (result?.ok) {
      setConfirming(null);
      onSuccess?.();
      router.refresh();
    }
  };

  const submit = (event, id) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const why = motif();
    if (!why) return;

    const raw24h = str(fd, 'is24h');

    run(
      id ? `place:${id}` : 'place:new',
      () =>
        saveLocation({
          id: id || undefined,
          key: str(fd, 'key').toLowerCase(),
          kind: str(fd, 'kind') || 'custom',
          city: str(fd, 'city'),
          address: str(fd, 'address'),
          name: {
            fr: str(fd, 'name_fr'),
            en: str(fd, 'name_en'),
            ar: str(fd, 'name_ar'),
            es: str(fd, 'name_es'),
          },
          deliveryFee: feeFromForm(fd, 'deliveryFee'),
          /* Three states, not two: true, false, and "Diab Car has not told us
             yet" — which the site renders as nothing at all. */
          is24h: raw24h === '' ? null : raw24h === 'true',
          sort: int(fd, 'sort', 100),
          active: bool(fd, 'active'),
          reason: why,
        }),
      id ? undefined : () => form.reset(),
    );
  };

  const fields = (place) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Clé" htmlFor={`key-${place?.id || 'new'}`} hint="sert aussi de slug">
        <Input
          id={`key-${place?.id || 'new'}`}
          name="key"
          defaultValue={place?.key || ''}
          required
          maxLength={64}
          pattern="[a-z0-9][a-z0-9-]*"
          placeholder="rabat-centre"
          className="font-latin-sans"
        />
      </Field>
      <Field label="Type" htmlFor={`kind-${place?.id || 'new'}`}>
        <Select id={`kind-${place?.id || 'new'}`} name="kind" defaultValue={place?.kind || 'district'}>
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ville" htmlFor={`city-${place?.id || 'new'}`}>
        <Input id={`city-${place?.id || 'new'}`} name="city" defaultValue={place?.city || ''} maxLength={80} placeholder="Casablanca" />
      </Field>
      <Field label="Ordre d’affichage" htmlFor={`sort-${place?.id || 'new'}`} hint="petit = en haut">
        <Input id={`sort-${place?.id || 'new'}`} name="sort" type="number" min="0" max="9999" defaultValue={place?.sort ?? 100} className="font-latin-sans tnum" />
      </Field>

      <Field label="Adresse" htmlFor={`address-${place?.id || 'new'}`} className="sm:col-span-2 lg:col-span-4">
        <Input id={`address-${place?.id || 'new'}`} name="address" defaultValue={place?.address || ''} maxLength={200} placeholder="356 boulevard Zerktouni, Casablanca" />
      </Field>

      {LOCALES_ORDER.map((locale) => (
        <Field key={locale} label={`Nom — ${LOCALE_LABEL[locale]}`} htmlFor={`name-${locale}-${place?.id || 'new'}`}>
          <Input
            id={`name-${locale}-${place?.id || 'new'}`}
            name={`name_${locale}`}
            defaultValue={place?.name?.[locale] || ''}
            required={locale === 'fr'}
            maxLength={120}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          />
        </Field>
      ))}

      <Field
        label="Frais de livraison (MAD)"
        htmlFor={`fee-${place?.id || 'new'}`}
        hint="vide = sur devis"
      >
        <Input
          id={`fee-${place?.id || 'new'}`}
          name="deliveryFee"
          type="number"
          min="0"
          step="50"
          defaultValue={feeOf(place || {}) ?? ''}
          placeholder="sur devis"
          className="font-latin-sans tnum"
        />
      </Field>
      <Field label="Ouverture" htmlFor={`is24h-${place?.id || 'new'}`}>
        <Select id={`is24h-${place?.id || 'new'}`} name="is24h" defaultValue={is24hOf(place || {})}>
          <option value="">Non renseigné</option>
          <option value="true">24 h / 24</option>
          <option value="false">Horaires d’agence</option>
        </Select>
      </Field>
      <div className="flex items-end pb-2.5">
        <Checkbox id={`active-${place?.id || 'new'}`} name="active" defaultChecked={place ? place.active !== false : true} label="Lieu actif sur le site" />
      </div>
    </div>
  );

  return (
    <Card title="Lieux et livraison" className="mt-5">
      <p className="mb-2 max-w-3xl text-sm text-text-2">
        Le <strong className="font-semibold text-text">type</strong> décide de la catégorie de frais du devis : agence = gratuit,
        aéroport = frais aéroport, quartier / ville / autre = frais de livraison ville. Un lieu de type{' '}
        <strong className="font-semibold text-text">Ville</strong> est la façon d’ouvrir Rabat ou Marrakech sans toucher au code.
      </p>
      <p className="mb-4 max-w-3xl text-sm text-text-muted">
        Le montant saisi ci-dessous est celui <strong className="font-semibold text-text-2">affiché à côté du lieu</strong> dans le
        module de réservation. Le total du devis, lui, applique les frais par défaut de la section « Frais divers » —{' '}
        <span className="tnum">{formatMAD(settings.airportDeliveryFee ?? 0, 'fr')}</span> aéroport,{' '}
        <span className="tnum">{formatMAD(settings.cityDeliveryFee ?? 0, 'fr')}</span> ville. Laissez le champ vide tant que le tarif
        d’un lieu n’est pas arrêté : le site écrit « sur devis » et n’invente pas une livraison gratuite.
      </p>

      {feedback ? <Notice tone={feedback.ok ? 'success' : 'danger'}>{feedback.text}</Notice> : null}

      <Field label="Motif (obligatoire)" htmlFor="reason-locations" hint="— écrit au Journal" className="mb-4 max-w-xl">
        <Input
          id="reason-locations"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ouverture livraison Rabat"
          maxLength={200}
        />
      </Field>

      {locations.length === 0 ? (
        <p className="rounded-[var(--radius-input)] border border-dashed border-border px-4 py-6 text-sm text-text-muted">
          Aucun lieu enregistré. Le module de réservation n’aurait alors que « autre adresse » à proposer.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[56rem]">
            <div className={`${SUMMARY_COLS} border-b border-border pb-2 ${HEAD}`}>
              <span>Lieu</span>
              <span>Clé</span>
              <span>Type</span>
              <span>Ville</span>
              <span>Livraison</span>
              <span>24 h</span>
              <span>État</span>
            </div>

            {locations.map((place) => {
              const key = `place:${place.id}`;
              const fee = feeOf(place);
              const open24h = is24hOf(place);
              return (
                <details key={place.id} className="border-b border-border">
                  <summary className="cursor-pointer list-none py-3">
                    <div className={SUMMARY_COLS}>
                      <span className="text-sm font-medium text-text">{place.name?.fr || place.key}</span>
                      <span className="font-latin-sans text-xs text-text-muted">{place.key}</span>
                      <span className="text-xs text-text-2">{KIND_LABEL[place.kind] || place.kind}</span>
                      <span className="text-xs text-text-2">{place.city || '—'}</span>
                      <span className={`text-sm tnum ${fee === null ? 'text-text-muted' : 'text-text-2'}`}>{feeLabel(fee)}</span>
                      <span className="text-xs text-text-2">{open24h === '' ? '—' : open24h === 'true' ? 'Oui' : 'Non'}</span>
                      <span className={`text-xs font-semibold ${place.active === false ? 'text-text-muted' : 'text-success'}`}>
                        {place.active === false ? 'Inactif' : 'Actif'}
                      </span>
                    </div>
                  </summary>

                  <form onSubmit={(event) => submit(event, place.id)} className="pb-5">
                    {fields(place)}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button type="submit" disabled={busy !== null} className={rowButton}>
                        {busy === key ? 'Enregistrement…' : 'Enregistrer ce lieu'}
                      </button>
                      {confirming === key ? (
                        <>
                          <button
                            type="button"
                            disabled={busy !== null}
                            className={dangerButton}
                            onClick={() => {
                              const why = motif();
                              if (why) run(key, () => removeLocation({ id: place.id, reason: why }));
                            }}
                          >
                            Confirmer la suppression
                          </button>
                          <button type="button" className={ghostButton} onClick={() => setConfirming(null)}>
                            Annuler
                          </button>
                        </>
                      ) : (
                        <button type="button" disabled={busy !== null} className={dangerButton} onClick={() => setConfirming(key)}>
                          Supprimer
                        </button>
                      )}
                      <span className="text-xs text-text-muted">
                        Désactiver plutôt que supprimer conserve l’historique des réservations passées par ce lieu.
                      </span>
                    </div>
                  </form>
                </details>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={(event) => submit(event, null)} className="mt-5 border-t border-border pt-5">
        <h3 className="mb-3 text-sm font-semibold text-text">Ajouter un lieu</h3>
        {fields(null)}
        <div className="mt-4">
          <button type="submit" disabled={busy !== null} className={primaryButton}>
            {busy === 'place:new' ? 'Ajout…' : 'Ajouter le lieu'}
          </button>
        </div>
      </form>
    </Card>
  );
}
