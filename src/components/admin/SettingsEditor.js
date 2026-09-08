'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { LOCALES } from '@/lib/constants';
import { formatMAD } from '@/lib/format';
import { saveAgency, saveHours, saveLegal, saveOperations, saveSla, saveTrust } from '@/lib/actions/settings';
import { Card, LOCALE_LABEL, Notice, SubmitButton } from '@/components/admin/ui';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';

/**
 * Paramètres — the agency's own record (plan 7.1, 9.4).
 *
 * Six independent forms, not one. `save_settings()` patches column by column,
 * so a section only ever sends the fields it owns: the person fixing a closing
 * time cannot blank the ICE number, and the journal entry says why the hours
 * moved rather than "paramètres modifiés".
 *
 * Every section carries its own motif. That is not politeness — the RPC
 * refuses a write without one, because settings are the one table where a
 * change is invisible until a customer notices it on the site.
 */

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' };

const PAYMENT_LABEL = {
  cash: 'Espèces à la prise en charge',
  card: 'Carte bancaire — TPE à l’agence',
};

const NUMBER_INPUT = 'font-latin-sans tnum';

/** '' → null, so an empty box means "laisse la valeur en base" and not zero. */
function numberOrNull(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value) {
  const n = numberOrNull(value);
  return n === null ? null : Math.round(n);
}

function intOr(value, fallback) {
  const n = intOrNull(value);
  return n === null ? fallback : n;
}

function pickI18n(value) {
  const out = {};
  for (const locale of LOCALES) out[locale] = value?.[locale] || '';
  return out;
}

/**
 * The shared half of every section: the motif, the busy flag, and the sentence
 * that comes back.
 *
 * The action is awaited in a submit handler rather than driven by a form
 * action, because a refusal here is information the operator has to read —
 * which claim has no number, which band closes before it opens — and an
 * unhandled throw would replace the page with an error boundary.
 */
function useSection(action) {
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const fail = (text) => setMessage({ tone: 'danger', text });

  const submit = async (fields) => {
    setMessage(null);
    if (reason.trim().length < 3) {
      fail('Écrivez un motif : chaque modification des paramètres est inscrite au journal.');
      return;
    }
    setBusy(true);
    let result;
    try {
      result = await action({ ...fields, reason: reason.trim() });
    } catch {
      /* requireRole throws rather than returning: a session that expired, or a
         role changed mid-session, lands here. */
      result = { ok: false, message: 'Enregistrement refusé — votre session ou votre rôle a changé. Reconnectez-vous.' };
    }
    setBusy(false);
    if (result?.ok) {
      setReason('');
      setMessage({ tone: 'success', text: 'Enregistré. Le site public est régénéré.' });
      router.refresh();
      return;
    }
    fail(result?.message || 'Enregistrement impossible.');
  };

  return { reasonId, reason, setReason, busy, message, fail, submit };
}

function SectionFooter({ section, placeholder }) {
  const { reasonId, reason, setReason, busy, message } = section;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor={reasonId} className="mb-1.5 block text-[13px] font-semibold text-text-2">
            Motif <span className="font-normal text-text-muted">— obligatoire, conservé au journal</span>
          </label>
          <Input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            placeholder={placeholder}
          />
        </div>
        <SubmitButton disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</SubmitButton>
      </div>
      {message ? (
        <p role="status" className={cn('mt-3 text-sm font-medium', message.tone === 'success' ? 'text-success' : 'text-danger')}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** A short explanation. Used where a field's consequence is not obvious. */
function Explain({ children }) {
  return <p className="mb-4 text-[13px] leading-relaxed text-text-muted">{children}</p>;
}

/* ------------------------------------------------------------------ agence */

function AgencySection({ settings }) {
  const section = useSection(saveAgency);
  const [f, setF] = useState(() => ({
    name: settings.name || '',
    legalName: settings.legalName || '',
    tagline: pickI18n(settings.tagline),
    phonePrimary: settings.phonePrimary || '',
    phoneSecondary: settings.phoneSecondary || '',
    phoneLandline: settings.phoneLandline || '',
    whatsapp: settings.whatsapp || '',
    email: settings.email || '',
    addressLine: settings.addressLine || '',
    city: settings.city || '',
    postalCode: settings.postalCode || '',
    lat: settings.lat ?? '',
    lng: settings.lng ?? '',
    googleMapsUrl: settings.googleMapsUrl || '',
    gbpUrl: settings.gbpUrl || '',
    facebookUrl: settings.facebookUrl || '',
    instagramUrl: settings.instagramUrl || '',
    tiktokUrl: settings.tiktokUrl || '',
  }));

  const set = (key) => (event) => setF({ ...f, [key]: event.target.value });
  const setTagline = (locale) => (event) => setF({ ...f, tagline: { ...f.tagline, [locale]: event.target.value } });

  return (
    <Card title="Agence">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          section.submit({ ...f, lat: numberOrNull(f.lat), lng: numberOrNull(f.lng) });
        }}
      >
        <Explain>
          Nom, adresse et téléphone sont recopiés tels quels dans le pied de page, dans le balisage LocalBusiness et sur la
          fiche Google Business Profile. Écrivez-les ici exactement comme sur la fiche Google : une différence d’une virgule
          affaiblit le référencement local.
        </Explain>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom commercial" htmlFor="s-name">
            <Input id="s-name" value={f.name} onChange={set('name')} maxLength={80} required />
          </Field>
          <Field label="Raison sociale" htmlFor="s-legalName">
            <Input id="s-legalName" value={f.legalName} onChange={set('legalName')} maxLength={120} />
          </Field>
          <Field label="Adresse" htmlFor="s-addressLine" className="sm:col-span-2">
            <Input id="s-addressLine" value={f.addressLine} onChange={set('addressLine')} maxLength={180} />
          </Field>
          <Field label="Ville" htmlFor="s-city">
            <Input id="s-city" value={f.city} onChange={set('city')} maxLength={80} />
          </Field>
          <Field label="Code postal" htmlFor="s-postalCode">
            <Input id="s-postalCode" value={f.postalCode} onChange={set('postalCode')} maxLength={12} className={NUMBER_INPUT} />
          </Field>
          <Field label="Latitude" htmlFor="s-lat" hint="— le point exact de la fiche Google">
            <Input id="s-lat" value={f.lat} onChange={set('lat')} inputMode="decimal" className={NUMBER_INPUT} placeholder="33.588300" />
          </Field>
          <Field label="Longitude" htmlFor="s-lng">
            <Input id="s-lng" value={f.lng} onChange={set('lng')} inputMode="decimal" className={NUMBER_INPUT} placeholder="-7.631400" />
          </Field>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone principal" htmlFor="s-phonePrimary" hint="— format international">
            <Input id="s-phonePrimary" value={f.phonePrimary} onChange={set('phonePrimary')} className={NUMBER_INPUT} placeholder="+2126…" />
          </Field>
          <Field label="WhatsApp" htmlFor="s-whatsapp">
            <Input id="s-whatsapp" value={f.whatsapp} onChange={set('whatsapp')} className={NUMBER_INPUT} placeholder="+2126…" />
          </Field>
          <Field label="Téléphone secondaire" htmlFor="s-phoneSecondary">
            <Input id="s-phoneSecondary" value={f.phoneSecondary} onChange={set('phoneSecondary')} className={NUMBER_INPUT} />
          </Field>
          <Field label="Fixe" htmlFor="s-phoneLandline">
            <Input id="s-phoneLandline" value={f.phoneLandline} onChange={set('phoneLandline')} className={NUMBER_INPUT} />
          </Field>
          <Field label="E-mail" htmlFor="s-email" className="sm:col-span-2">
            <Input id="s-email" type="email" value={f.email} onChange={set('email')} maxLength={160} className="font-latin-sans" />
          </Field>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Lien Google Maps (itinéraire)" htmlFor="s-googleMapsUrl" className="sm:col-span-2">
            <Input id="s-googleMapsUrl" value={f.googleMapsUrl} onChange={set('googleMapsUrl')} className="font-latin-sans" />
          </Field>
          <Field label="Google Business Profile (page d’avis)" htmlFor="s-gbpUrl" className="sm:col-span-2" hint="— https://g.page/r/…/review">
            <Input id="s-gbpUrl" value={f.gbpUrl} onChange={set('gbpUrl')} className="font-latin-sans" />
          </Field>
          <Field label="Facebook" htmlFor="s-facebookUrl">
            <Input id="s-facebookUrl" value={f.facebookUrl} onChange={set('facebookUrl')} className="font-latin-sans" />
          </Field>
          <Field label="Instagram" htmlFor="s-instagramUrl">
            <Input id="s-instagramUrl" value={f.instagramUrl} onChange={set('instagramUrl')} className="font-latin-sans" />
          </Field>
          <Field label="TikTok" htmlFor="s-tiktokUrl">
            <Input id="s-tiktokUrl" value={f.tiktokUrl} onChange={set('tiktokUrl')} className="font-latin-sans" />
          </Field>
        </div>

        <fieldset className="mt-6 border-t border-border pt-4">
          <legend className="mb-3 text-[13px] font-semibold text-text-2">
            Slogan <span className="font-normal text-text-muted">— sert de description schema.org, dans les quatre langues</span>
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {LOCALES.map((locale) => (
              <Field key={locale} label={LOCALE_LABEL[locale]} htmlFor={`s-tagline-${locale}`}>
                <Input
                  id={`s-tagline-${locale}`}
                  value={f.tagline[locale]}
                  onChange={setTagline(locale)}
                  maxLength={200}
                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                  lang={locale}
                />
              </Field>
            ))}
          </div>
        </fieldset>

        <SectionFooter section={section} placeholder="Nouveau numéro WhatsApp" />
      </form>
    </Card>
  );
}

/* ---------------------------------------------------------------- horaires */

function HoursSection({ settings }) {
  const section = useSection(saveHours);
  const [bands, setBands] = useState(() =>
    (Array.isArray(settings.hours) ? settings.hours : []).map((band, index) => ({
      id: `b${index}`,
      days: Array.isArray(band?.days) ? DAY_KEYS.filter((day) => band.days.includes(day)) : [],
      opens: typeof band?.opens === 'string' ? band.opens : '08:00',
      closes: typeof band?.closes === 'string' ? band.closes : '20:00',
    })),
  );
  /* Ids come from a counter, not from Math.random(): the compiler forbids the
     clock and the dice while rendering, and an index key would follow the
     wrong row when a middle band is removed. */
  const [seq, setSeq] = useState(1);
  const [airport, setAirport] = useState(Boolean(settings.airportService24h));

  const patchBand = (id, patch) => setBands(bands.map((band) => (band.id === id ? { ...band, ...patch } : band)));

  const toggleDay = (band, day) =>
    patchBand(band.id, {
      days: band.days.includes(day)
        ? band.days.filter((d) => d !== day)
        : DAY_KEYS.filter((d) => d === day || band.days.includes(d)),
    });

  const addBand = () => {
    setBands([...bands, { id: `n${seq}`, days: [], opens: '08:00', closes: '20:00' }]);
    setSeq(seq + 1);
  };

  const covered = new Set(bands.flatMap((band) => band.days));
  const uncovered = DAY_KEYS.filter((day) => !covered.has(day));

  return (
    <Card title="Horaires">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (bands.some((band) => band.days.length === 0)) {
            section.fail('Une plage sans jour ne veut rien dire : cochez les jours, ou supprimez la plage.');
            return;
          }
          section.submit({
            hours: bands.map(({ days, opens, closes }) => ({ days, opens, closes })),
            airportService24h: airport,
          });
        }}
      >
        <Explain>
          Une plage = des jours + une heure d’ouverture + une heure de fermeture. Ajoutez-en plusieurs pour décrire une
          coupure : une agence fermée entre 12h30 et 14h30 a deux plages le même jour, et non une seule qui laisserait croire
          au visiteur — et à Google — que le comptoir est ouvert à midi.
        </Explain>

        {bands.length === 0 ? (
          <p className="rounded-[var(--radius-input)] border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            Aucune plage horaire. Tant qu’il n’y en a pas, le site n’affiche pas d’horaires d’ouverture.
          </p>
        ) : (
          <ul className="space-y-3">
            {bands.map((band, index) => (
              <li key={band.id} className="rounded-[var(--radius-input)] border border-border bg-surface-2 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                    Plage <span className="tnum">{index + 1}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setBands(bands.filter((b) => b.id !== band.id))}
                    className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-2 transition-colors hover:border-border-strong hover:text-text"
                  >
                    Supprimer
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {DAY_KEYS.map((day) => (
                    <Checkbox
                      key={day}
                      id={`${band.id}-${day}`}
                      checked={band.days.includes(day)}
                      onChange={() => toggleDay(band, day)}
                      label={DAY_LABEL[day]}
                    />
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Ouverture" htmlFor={`${band.id}-opens`}>
                    <Input
                      id={`${band.id}-opens`}
                      type="time"
                      value={band.opens}
                      onChange={(event) => patchBand(band.id, { opens: event.target.value })}
                      className={NUMBER_INPUT}
                      required
                    />
                  </Field>
                  <Field label="Fermeture" htmlFor={`${band.id}-closes`} hint="— 00:00 = minuit">
                    <Input
                      id={`${band.id}-closes`}
                      type="time"
                      value={band.closes}
                      onChange={(event) => patchBand(band.id, { closes: event.target.value })}
                      className={NUMBER_INPUT}
                      required
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={addBand}
            className="rounded-full border border-border-strong px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-2"
          >
            Ajouter une plage
          </button>
          {uncovered.length ? (
            <p className="text-[13px] text-text-muted">
              Jours sans plage : {uncovered.map((day) => DAY_LABEL[day]).join(', ')} — le site les annoncera fermés.
            </p>
          ) : null}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <Checkbox
            id="s-airport24h"
            checked={airport}
            onChange={(event) => setAirport(event.target.checked)}
            label="Livraison à l’aéroport Mohammed V 24h/24, en dehors des horaires du comptoir"
          />
        </div>

        <SectionFooter section={section} placeholder="Coupure du midi ajoutée" />
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------- légal */

function LegalSection({ settings }) {
  const section = useSection(saveLegal);
  const [f, setF] = useState(() => ({
    rc: settings.rc || '',
    ice: settings.ice || '',
    capitalMad: settings.capitalMad ?? '',
    foundedYear: settings.foundedYear ?? '',
    cndpReceipt: settings.cndpReceipt || '',
  }));
  const set = (key) => (event) => setF({ ...f, [key]: event.target.value });
  const capital = numberOrNull(f.capitalMad);

  return (
    <Card title="Légal et CNDP">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          section.submit({
            rc: f.rc,
            ice: f.ice,
            capitalMad: capital,
            foundedYear: intOrNull(f.foundedYear),
            cndpReceipt: f.cndpReceipt,
          });
        }}
      >
        <Explain>
          Le récépissé CNDP est le numéro délivré après la déclaration préalable du traitement des données personnelles
          (loi 09-08) ; il doit être affiché sur les formulaires et les pages légales du site. Laissez le champ vide tant que
          la déclaration n’est pas déposée : la ligne est alors masquée, jamais inventée.
        </Explain>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="RC (Casablanca)" htmlFor="s-rc">
            <Input id="s-rc" value={f.rc} onChange={set('rc')} maxLength={40} className={NUMBER_INPUT} />
          </Field>
          <Field label="ICE" htmlFor="s-ice">
            <Input id="s-ice" value={f.ice} onChange={set('ice')} maxLength={40} className={NUMBER_INPUT} />
          </Field>
          <Field label="Capital social (MAD)" htmlFor="s-capitalMad" hint={capital === null ? '' : `— ${formatMAD(capital, 'fr')}`}>
            <Input id="s-capitalMad" value={f.capitalMad} onChange={set('capitalMad')} inputMode="numeric" className={NUMBER_INPUT} />
          </Field>
          <Field label="Année de création" htmlFor="s-foundedYear" hint="— la source du « depuis … » public">
            <Input id="s-foundedYear" value={f.foundedYear} onChange={set('foundedYear')} inputMode="numeric" className={NUMBER_INPUT} placeholder="2013" />
          </Field>
          <Field label="Numéro de récépissé CNDP" htmlFor="s-cndpReceipt" className="sm:col-span-2">
            <Input
              id="s-cndpReceipt"
              value={f.cndpReceipt}
              onChange={set('cndpReceipt')}
              maxLength={60}
              className={NUMBER_INPUT}
              placeholder="Vide tant que la déclaration n’est pas faite"
            />
          </Field>
        </div>

        <SectionFooter section={section} placeholder="Récépissé CNDP reçu" />
      </form>
    </Card>
  );
}

/* --------------------------------------------------------------- confiance */

function TrustSection({ settings }) {
  const section = useSection(saveTrust);
  const claims = settings.verifiedClaims || {};
  const [f, setF] = useState(() => ({
    googleRating: settings.googleRating ?? '',
    googleReviewCount: settings.googleReviewCount ?? '',
    verifiedRating: Boolean(claims.googleRating),
    verifiedCount: Boolean(claims.reviewCount),
    verifiedFounded: Boolean(claims.foundedYear),
  }));
  const set = (key) => (event) => setF({ ...f, [key]: event.target.value });
  const check = (key) => (event) => setF({ ...f, [key]: event.target.checked });
  const foundedYear = settings.foundedYear ?? null;

  return (
    <Card title="Chiffres de confiance">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          section.submit({
            googleRating: numberOrNull(f.googleRating),
            googleReviewCount: intOrNull(f.googleReviewCount),
            verifiedClaims: {
              googleRating: f.verifiedRating,
              reviewCount: f.verifiedCount,
              foundedYear: f.verifiedFounded,
            },
          });
        }}
      >
        <Explain>
          Un chiffre n’atteint le site que si sa case « vérifié » est cochée : la vue publique{' '}
          <code className="font-latin-sans">public_settings</code> remplace par vide toute donnée non cochée, et cette règle
          vit dans le SQL — pas dans un composant qui pourrait l’oublier. Ne cochez que ce que vous venez de relire sur sa
          source.
        </Explain>

        <Notice tone="warning">
          Décocher une case retire le chiffre du site en ligne dès la page suivante. Le chiffre reste en base : c’est son
          affichage qui s’arrête.
        </Notice>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Note Google" htmlFor="s-googleRating" hint="— sur 5">
              <Input id="s-googleRating" value={f.googleRating} onChange={set('googleRating')} inputMode="decimal" className={NUMBER_INPUT} placeholder="4.7" />
            </Field>
            <div className="pb-3">
              <Checkbox id="s-verifiedRating" checked={f.verifiedRating} onChange={check('verifiedRating')} label="Vérifié sur la fiche Google" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Nombre d’avis Google" htmlFor="s-googleReviewCount">
              <Input id="s-googleReviewCount" value={f.googleReviewCount} onChange={set('googleReviewCount')} inputMode="numeric" className={NUMBER_INPUT} placeholder="128" />
            </Field>
            <div className="pb-3">
              <Checkbox id="s-verifiedCount" checked={f.verifiedCount} onChange={check('verifiedCount')} label="Vérifié sur la fiche Google" />
            </div>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[13px] font-semibold text-text-2">Année de création</p>
              <p className="mt-1 text-sm text-text-muted">
                {foundedYear ? (
                  <>
                    <span className="tnum text-text">{foundedYear}</span> — la valeur se modifie dans la section « Légal et
                    CNDP ».
                  </>
                ) : (
                  'Aucune année enregistrée : renseignez-la dans « Légal et CNDP » avant de la déclarer vérifiée.'
                )}
              </p>
            </div>
            <Checkbox id="s-verifiedFounded" checked={f.verifiedFounded} onChange={check('verifiedFounded')} label="Vérifié au registre du commerce" />
          </div>
        </div>

        <SectionFooter section={section} placeholder="Note relevée sur la fiche Google" />
      </form>
    </Card>
  );
}

/* --------------------------------------------------------------------- SLA */

function SlaSection({ settings }) {
  const section = useSection(saveSla);
  const [sla, setSla] = useState(() => pickI18n(settings.sla));

  return (
    <Card title="Engagement de réponse (SLA)">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          section.submit({ sla });
        }}
      >
        <Explain>
          La promesse de délai affichée publiquement, par exemple « réponse WhatsApp en moins de 10 minutes, de 8h à 23h ».
          Elle est lue par des clients dans quatre langues : ne promettez ici que ce que le comptoir tient réellement, et
          laissez une langue vide plutôt que d’y mettre une traduction approximative.
        </Explain>

        <div className="grid gap-4 sm:grid-cols-2">
          {LOCALES.map((locale) => (
            <Field key={locale} label={LOCALE_LABEL[locale]} htmlFor={`s-sla-${locale}`}>
              <Textarea
                id={`s-sla-${locale}`}
                value={sla[locale]}
                onChange={(event) => setSla({ ...sla, [locale]: event.target.value })}
                maxLength={240}
                rows={3}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                lang={locale}
              />
            </Field>
          ))}
        </div>

        <SectionFooter section={section} placeholder="Délai de réponse revu" />
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------- exploitation */

function OperationsSection({ settings }) {
  const section = useSection(saveOperations);
  const [f, setF] = useState(() => ({
    autoExpireHours: String(settings.autoExpireHours ?? 12),
    cleaningMinutes: String(settings.cleaningMinutes ?? 120),
    lastBackupAt: settings.lastBackupAt ? String(settings.lastBackupAt).slice(0, 16) : '',
    payments: Array.isArray(settings.paymentMethods)
      ? settings.paymentMethods.filter((method) => method in PAYMENT_LABEL)
      : [],
  }));
  const set = (key) => (event) => setF({ ...f, [key]: event.target.value });

  const togglePayment = (method) =>
    setF({
      ...f,
      payments: f.payments.includes(method)
        ? f.payments.filter((m) => m !== method)
        : Object.keys(PAYMENT_LABEL).filter((m) => m === method || f.payments.includes(m)),
    });

  const hours = intOr(f.autoExpireHours, 12);
  const minutes = intOr(f.cleaningMinutes, 120);

  return (
    <Card title="Exploitation">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (f.payments.length === 0) {
            section.fail('Cochez au moins un moyen de paiement : le tunnel affiche cette liste au client.');
            return;
          }
          section.submit({
            autoExpireHours: hours,
            cleaningMinutes: minutes,
            paymentMethods: f.payments,
            lastBackupAt: f.lastBackupAt ? new Date(f.lastBackupAt).toISOString() : '',
          });
        }}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Field label="Expiration des demandes non confirmées (heures)" htmlFor="s-autoExpireHours">
              <Input id="s-autoExpireHours" value={f.autoExpireHours} onChange={set('autoExpireHours')} inputMode="numeric" className={NUMBER_INPUT} />
            </Field>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              Le site ne prend aucun paiement : « en attente » veut dire qu’un humain doit encore dire oui. Passé{' '}
              <span className="tnum text-text-2">{hours}</span> h sans confirmation, la demande est annulée avec le motif
              « non confirmée » et sa voiture repart en vente. Annulée, pas supprimée : la fiche client en garde la trace.
              Mettez <span className="tnum text-text-2">0</span> pour désactiver complètement l’expiration.
            </p>
          </div>

          <div>
            <Field label="Blocage après retour, le temps du nettoyage (minutes)" htmlFor="s-cleaningMinutes">
              <Input id="s-cleaningMinutes" value={f.cleaningMinutes} onChange={set('cleaningMinutes')} inputMode="numeric" className={NUMBER_INPUT} />
            </Field>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              Une voiture rendue est bloquée <span className="tnum text-text-2">{minutes}</span> min. Sans ce blocage, elle
              redeviendrait réservable alors qu’elle est encore sale. Si personne n’appuie sur « Marquer prête », le balayage{' '}
              <code className="font-latin-sans">/api/cron/expire-reservations</code> reprolonge le blocage tant que l’unité
              reste en nettoyage : l’oubli coûte de la disponibilité, jamais un client devant une voiture non préparée.
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <Field label="Dernière sauvegarde de la base" htmlFor="s-lastBackupAt">
            <Input id="s-lastBackupAt" type="datetime-local" value={f.lastBackupAt} onChange={set('lastBackupAt')} className={NUMBER_INPUT} />
          </Field>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            Saisie à la main pour l’instant : Supabase Free ne fait aucune sauvegarde automatique (plan 9.2). La page Système
            affiche cette date ; quand la sauvegarde hebdomadaire tournera en CI, elle l’écrira elle-même.
          </p>
        </div>

        <fieldset className="mt-6 border-t border-border pt-4">
          <legend className="mb-1 text-[13px] font-semibold text-text-2">Moyens de paiement acceptés</legend>
          <p className="mb-3 text-[13px] text-text-muted">
            Le paiement se fait à la prise en charge, jamais en ligne. Cette liste est celle que le tunnel annonce au client.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {Object.keys(PAYMENT_LABEL).map((method) => (
              <Checkbox
                key={method}
                id={`s-pay-${method}`}
                checked={f.payments.includes(method)}
                onChange={() => togglePayment(method)}
                label={PAYMENT_LABEL[method]}
              />
            ))}
          </div>
        </fieldset>

        <SectionFooter section={section} placeholder="Délai d’expiration ramené à 6 h" />
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------------- page */

export default function SettingsEditor({ settings, mode }) {
  return (
    <div className="space-y-5">
      {mode === 'demo' ? (
        <Notice tone="info">
          Mode démo : aucune base n’est connectée. Les modifications restent en mémoire et disparaissent au redémarrage du
          serveur.
        </Notice>
      ) : null}

      <AgencySection settings={settings} />
      <HoursSection settings={settings} />
      <div className="grid gap-5 xl:grid-cols-2">
        <LegalSection settings={settings} />
        <TrustSection settings={settings} />
      </div>
      <SlaSection settings={settings} />
      <OperationsSection settings={settings} />
    </div>
  );
}
