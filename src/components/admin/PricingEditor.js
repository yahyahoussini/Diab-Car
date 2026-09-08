'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removeExtra, removeSeason, saveDeposits, saveExtra, saveFees, saveSeason, saveTiers } from '@/lib/actions/pricing';
import { CATEGORIES } from '@/lib/constants';
import { formatMAD } from '@/lib/format';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Card, LOCALE_LABEL, Notice } from '@/components/admin/ui';

/**
 * The four money tables: saisons, paliers, options, cautions — plus the misc
 * fees (plan 7.1, 6.4).
 *
 * Every row is its own <form> with uncontrolled inputs, and the save handler
 * reads it through FormData. That is not nostalgia: it means the operator can
 * edit six seasons at once without this component mirroring the whole table in
 * React state, and it keeps the file free of the useEffect/setState pattern
 * the React Compiler refuses. The two places that DO hold state are the ones
 * where rows appear and disappear (the paliers) or where a figure is computed
 * while you type (the new option's 7-day cost).
 *
 * One motif per section rather than one per row: an operator adjusting the
 * summer prices writes "Augmentation tarifs été" once and every line they save
 * carries it into the Journal.
 */

const CAT_LABEL = {
  economy: 'Citadine',
  compact: 'Compacte',
  sedan: 'Berline',
  suv: 'SUV & 4x4',
  premium: 'Premium',
  luxury: 'Luxe',
  van: 'Van & minibus',
};

const OTHER_LOCALES = ['en', 'ar', 'es'];

const MONTHLY_KEYS = [
  ['economy', 'Citadine'],
  ['suv', 'SUV'],
  ['premium', 'Premium'],
];

const str = (fd, key) => String(fd.get(key) ?? '').trim();
const bool = (fd, key) => fd.get(key) === 'on';

/* A French keyboard types "1,25". Number() reads that as NaN, and a NaN
   multiplier saved silently would price a whole season at zero. */
const num = (fd, key, fallback = 0) => {
  const raw = str(fd, key).replace(',', '.');
  return raw === '' ? fallback : Number(raw);
};

const nameOf = (fd, key) => ({
  fr: str(fd, `${key}_fr`),
  en: str(fd, `${key}_en`),
  ar: str(fd, `${key}_ar`),
  es: str(fd, `${key}_es`),
});

/** "×1,25" — the multiplier is per day, so it is never written as a percentage. */
const asMultiplier = (value) => `×${(Number(value) || 1).toFixed(2).replace('.', ',')}`;

const sevenDayCost = (type, price) => (type === 'per_day' ? (Number(price) || 0) * 7 : Number(price) || 0);

const dayCount = (startDate, endDate) => {
  const from = Date.parse(`${startDate}T00:00:00Z`);
  const to = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86400000) + 1;
};

const seasonPhase = (season, today) => {
  if (season.active === false) return 'inactive';
  if (today < season.startDate) return 'à venir';
  if (today > season.endDate) return 'passée';
  return 'en cours';
};

const PHASE_TONE = {
  'en cours': 'text-success',
  'à venir': 'text-text-2',
  'passée': 'text-text-muted',
  'inactive': 'text-text-muted',
};

const nextRowId = (rows) => `t${rows.reduce((max, row) => Math.max(max, Number(row.rid.slice(1)) || 0), -1) + 1}`;

const rowButton = 'rounded-full border border-border-strong px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-text-2 disabled:opacity-50';
const dangerButton = 'rounded-full px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-50';
const ghostButton = 'rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text disabled:opacity-50';
const primaryButton = 'inline-flex h-10 items-center rounded-full bg-red px-5 text-sm font-semibold text-on-red transition-colors hover:bg-red-hover disabled:opacity-50';

const SEASON_COLS = 'grid grid-cols-[minmax(10rem,1.5fr)_9.5rem_9.5rem_7rem_7rem_11rem] items-start gap-2';
const EXTRA_COLS = 'grid grid-cols-[10rem_minmax(11rem,1.4fr)_8.5rem_7rem_8rem_7rem_11rem] items-start gap-2';
const HEAD = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted';

export default function PricingEditor({ settings, seasons, extras, today }) {
  const router = useRouter();

  const [reason, setReason] = useState({ seasons: '', tiers: '', extras: '', deposits: '', fees: '' });
  const [feedback, setFeedback] = useState(null); // { section, ok, text }
  const [busy, setBusy] = useState(null); // the key of the row being written
  const [confirming, setConfirming] = useState(null); // delete needs a second click
  const [tiers, setTiers] = useState(() =>
    (settings.pricingTiers || []).map((tier, i) => ({
      rid: `t${i}`,
      minDays: String(tier.minDays ?? ''),
      discountPct: String(tier.discountPct ?? ''),
    })),
  );
  const [draftExtra, setDraftExtra] = useState({ type: 'per_day', price: '' });

  const notice = (section) =>
    feedback?.section === section ? <Notice tone={feedback.ok ? 'success' : 'danger'}>{feedback.text}</Notice> : null;

  /* The motif is checked here before the round trip, but Postgres refuses a
     blank one too (REASON_REQUIRED). This is the courteous half. */
  const motif = (section) => {
    const value = reason[section].trim();
    if (value.length < 4) {
      setFeedback({ section, ok: false, text: 'Écrivez d’abord le motif : il part au Journal avec la modification.' });
      return null;
    }
    return value;
  };

  const run = async (section, key, call, onSuccess) => {
    setBusy(key);
    setFeedback(null);
    const result = await call();
    setBusy(null);
    setFeedback({
      section,
      ok: Boolean(result?.ok),
      text: result?.ok ? 'Enregistré. Le site public est régénéré.' : result?.message || 'Modification refusée.',
    });
    if (result?.ok) {
      setConfirming(null);
      onSuccess?.();
      router.refresh();
    }
  };

  const reasonField = (section, placeholder) => (
    <Field
      label="Motif (obligatoire)"
      htmlFor={`reason-${section}`}
      hint="— écrit au Journal"
      className="mb-4 max-w-xl"
    >
      <Input
        id={`reason-${section}`}
        value={reason[section]}
        onChange={(event) => setReason((current) => ({ ...current, [section]: event.target.value }))}
        placeholder={placeholder}
        maxLength={200}
      />
    </Field>
  );

  const deleteControls = (section, key, call) =>
    confirming === key ? (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={busy !== null}
          className={dangerButton}
          onClick={() => {
            /* A deletion is a sensitive write too: admin_delete() refuses it
               without a motif, so the same field gates both buttons. */
            const why = motif(section);
            if (why) run(section, key, () => call(why));
          }}
        >
          Confirmer
        </button>
        <button type="button" className={ghostButton} onClick={() => setConfirming(null)}>
          Annuler
        </button>
      </div>
    ) : (
      <button type="button" disabled={busy !== null} className={dangerButton} onClick={() => setConfirming(key)}>
        Supprimer
      </button>
    );

  /* ---------------------------------------------------------------- saisons */

  const submitSeason = (event, id) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const section = 'seasons';
    const why = motif(section);
    if (!why) return;

    const startDate = str(fd, 'startDate');
    const endDate = str(fd, 'endDate');
    /* Refused in the form as well as in save_season(): the operator finds out
       before the round trip, and the database stays the authority. */
    if (endDate < startDate) {
      setFeedback({ section, ok: false, text: 'La date de fin est antérieure à la date de début.' });
      return;
    }

    run(
      section,
      id ? `season:${id}` : 'season:new',
      () =>
        saveSeason({
          id: id || undefined,
          name: str(fd, 'name'),
          startDate,
          endDate,
          multiplier: num(fd, 'multiplier', 1),
          active: bool(fd, 'active'),
          reason: why,
        }),
      id ? undefined : () => form.reset(),
    );
  };

  /* --------------------------------------------------------------- options */

  const submitExtra = (event, id) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const why = motif('extras');
    if (!why) return;

    run(
      'extras',
      id ? `extra:${id}` : 'extra:new',
      () =>
        saveExtra({
          id: id || undefined,
          key: str(fd, 'key').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
          type: str(fd, 'type') || 'per_day',
          price: num(fd, 'price', 0),
          active: bool(fd, 'active'),
          name: nameOf(fd, 'name'),
          reason: why,
        }),
      id
        ? undefined
        : () => {
            form.reset();
            setDraftExtra({ type: 'per_day', price: '' });
          },
    );
  };

  /* --------------------------------------------------------------- paliers */

  const submitTiers = (event) => {
    event.preventDefault();
    const why = motif('tiers');
    if (!why) return;
    run(
      'tiers',
      'tiers',
      () =>
        saveTiers({
          tiers: tiers
            .filter((row) => row.minDays !== '')
            .map((row) => ({ minDays: Number(row.minDays), discountPct: Number(String(row.discountPct).replace(',', '.')) || 0 })),
          reason: why,
        }),
      /* The action stores the paliers sorted; the list re-sorts itself to match
         so the screen and the database never disagree about their order. The
         blank rows are dropped here for the same reason — they were not saved. */
      () =>
        setTiers((current) =>
          [...current].filter((row) => row.minDays !== '').sort((a, b) => Number(a.minDays) - Number(b.minDays)),
        ),
    );
  };

  /* -------------------------------------------------------------- cautions */

  const submitDeposits = (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const why = motif('deposits');
    if (!why) return;
    run('deposits', 'deposits', () =>
      saveDeposits({
        /* A blank field is sent as 0 and dropped by the action, so clearing a
           category removes its default instead of promising a free deposit. */
        deposits: CATEGORIES.map((category) => ({ category, amount: num(fd, `deposit_${category}`, 0) })),
        reason: why,
      }),
    );
  };

  /* ------------------------------------------------------------------ frais */

  const submitFees = (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const why = motif('fees');
    if (!why) return;
    run('fees', 'fees', () =>
      saveFees({
        airportDeliveryFee: num(fd, 'airportDeliveryFee', 0),
        cityDeliveryFee: num(fd, 'cityDeliveryFee', 0),
        oneWayFee: num(fd, 'oneWayFee', 0),
        monthlyFrom: {
          economy: num(fd, 'monthly_economy', 0),
          suv: num(fd, 'monthly_suv', 0),
          premium: num(fd, 'monthly_premium', 0),
        },
        freeCancellationHours: num(fd, 'freeCancellationHours', 0),
        depositReleaseDays: num(fd, 'depositReleaseDays', 0),
        minAge: num(fd, 'minAge', 21),
        premiumMinAge: num(fd, 'premiumMinAge', 25),
        minLicenseYears: num(fd, 'minLicenseYears', 1),
        fuelPolicy: str(fd, 'fuelPolicy') || 'full-to-full',
        eurRate: num(fd, 'eurRate', 10.8),
        reason: why,
      }),
    );
  };

  const depositByCategory = settings.depositByCategory || {};

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ saisons */}
      <Card title="Saisons">
        <p className="mb-4 max-w-3xl text-sm text-text-2">
          Le multiplicateur s’applique <strong className="font-semibold text-text">jour par jour</strong>, jamais au total : une
          location à cheval sur la saison n’est majorée que sur les jours qui tombent dedans. <span className="tnum">×1,25</span> sur
          une voiture à <span className="tnum">300 MAD</span>/jour fait <span className="tnum">375 MAD</span> ces jours-là. Deux
          saisons qui se chevauchent : la première trouvée gagne — évitez-le.
        </p>
        {notice('seasons')}
        {reasonField('seasons', 'Augmentation tarifs été')}

        {seasons.length === 0 ? (
          <p className="rounded-[var(--radius-input)] border border-dashed border-border px-4 py-6 text-sm text-text-muted">
            Aucune saison. Chaque jour est facturé au tarif de base de la voiture.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[58rem]">
              <div className={`${SEASON_COLS} border-b border-border pb-2 ${HEAD}`}>
                <span>Saison</span>
                <span>Du</span>
                <span>Au</span>
                <span>Multiplicateur</span>
                <span>État</span>
                <span />
              </div>
              {seasons.map((season) => {
                const key = `season:${season.id}`;
                const phase = seasonPhase(season, today);
                return (
                  <form key={season.id} onSubmit={(event) => submitSeason(event, season.id)} className={`${SEASON_COLS} border-b border-border py-2.5`}>
                    <div>
                      <Input name="name" defaultValue={season.name} required maxLength={80} aria-label="Nom de la saison" />
                      <p className="mt-1 text-[11px] text-text-muted">
                        <span className="tnum">{dayCount(season.startDate, season.endDate)}</span> jours
                      </p>
                    </div>
                    <Input name="startDate" type="date" defaultValue={season.startDate} required className="font-latin-sans tnum" aria-label="Début de saison" />
                    <Input name="endDate" type="date" defaultValue={season.endDate} required className="font-latin-sans tnum" aria-label="Fin de saison" />
                    <div>
                      <Input
                        name="multiplier"
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="5"
                        defaultValue={season.multiplier}
                        required
                        className="font-latin-sans tnum"
                        aria-label="Multiplicateur par jour"
                      />
                      <p className="mt-1 text-[11px] text-text-muted tnum">{asMultiplier(season.multiplier)}</p>
                    </div>
                    <div className="pt-3">
                      <Checkbox id={`season-active-${season.id}`} name="active" defaultChecked={season.active !== false} label="Active" />
                      <p className={`mt-1 text-[11px] ${PHASE_TONE[phase]}`}>{phase}</p>
                    </div>
                    <div className="flex flex-col gap-1 pt-0.5">
                      <button type="submit" disabled={busy !== null} className={rowButton}>
                        {busy === key ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                      {deleteControls('seasons', key, (why) => removeSeason({ id: season.id, reason: why }))}
                    </div>
                  </form>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={(event) => submitSeason(event, null)} className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Nom" htmlFor="new-season-name" className="lg:col-span-2">
            <Input id="new-season-name" name="name" required maxLength={80} placeholder="Été / MRE" />
          </Field>
          <Field label="Du" htmlFor="new-season-start">
            <Input id="new-season-start" name="startDate" type="date" required className="font-latin-sans tnum" />
          </Field>
          <Field label="Au" htmlFor="new-season-end">
            <Input id="new-season-end" name="endDate" type="date" required className="font-latin-sans tnum" />
          </Field>
          <Field label="Multiplicateur" htmlFor="new-season-mult" hint="1,25 = +25 %/jour">
            <Input id="new-season-mult" name="multiplier" type="number" step="0.05" min="0.1" max="5" defaultValue="1.2" required className="font-latin-sans tnum" />
          </Field>
          <input type="hidden" name="active" value="on" />
          <div className="sm:col-span-2 lg:col-span-5">
            <button type="submit" disabled={busy !== null} className={primaryButton}>
              {busy === 'season:new' ? 'Ajout…' : 'Ajouter la saison'}
            </button>
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------------------ paliers */}
      <Card title="Paliers de remise longue durée">
        <p className="mb-4 max-w-3xl text-sm text-text-2">
          Le palier retenu est celui du <strong className="font-semibold text-text">plus grand nombre de jours atteint</strong> par la
          location, pas la meilleure remise. Un palier plus long doit donc remiser au moins autant qu’un palier plus court — sinon un
          mois coûterait plus cher qu’une semaine, et l’enregistrement est refusé.
        </p>
        {notice('tiers')}
        {reasonField('tiers', 'Nouvelle grille remises longue durée')}

        <form onSubmit={submitTiers}>
          {tiers.length === 0 ? (
            <p className="rounded-[var(--radius-input)] border border-dashed border-border px-4 py-6 text-sm text-text-muted">
              Aucun palier : aucune remise longue durée n’est appliquée, quelle que soit la durée.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[10rem_10rem_1fr_6rem] gap-3 pb-1">
                <span className={HEAD}>À partir de (jours)</span>
                <span className={HEAD}>Remise (%)</span>
                <span className={HEAD}>Effet</span>
                <span />
              </div>
              {tiers.map((row, index) => (
                <div key={row.rid} className="grid grid-cols-[10rem_10rem_1fr_6rem] items-center gap-3">
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={row.minDays}
                    onChange={(event) =>
                      setTiers((current) => current.map((r, i) => (i === index ? { ...r, minDays: event.target.value } : r)))
                    }
                    aria-label={`Palier ${index + 1} — à partir de combien de jours`}
                    className="font-latin-sans tnum"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="90"
                    step="1"
                    value={row.discountPct}
                    onChange={(event) =>
                      setTiers((current) => current.map((r, i) => (i === index ? { ...r, discountPct: event.target.value } : r)))
                    }
                    aria-label={`Palier ${index + 1} — remise en pourcentage`}
                    className="font-latin-sans tnum"
                  />
                  <p className="text-sm text-text-2">
                    {row.minDays !== '' && row.discountPct !== ''
                      ? `Dès ${row.minDays} jours, −${row.discountPct} % sur le sous-total après saisons.`
                      : 'Renseignez les deux colonnes.'}
                  </p>
                  <button
                    type="button"
                    className={dangerButton}
                    onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={rowButton}
              onClick={() => setTiers((current) => [...current, { rid: nextRowId(current), minDays: '', discountPct: '' }])}
            >
              + Ajouter un palier
            </button>
            <button type="submit" disabled={busy !== null} className={primaryButton}>
              {busy === 'tiers' ? 'Enregistrement…' : 'Enregistrer les paliers'}
            </button>
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------------------ options */}
      <Card title="Options (extras)">
        <p className="mb-4 max-w-3xl text-sm text-text-2">
          « Par jour » est multiplié par la durée, « forfait » est facturé une fois. La colonne{' '}
          <strong className="font-semibold text-text">sur 7 jours</strong> montre ce que le client paiera réellement pour une semaine,
          parce qu’un prix nu ne dit pas lequel des deux il est.
        </p>
        {notice('extras')}
        {reasonField('extras', 'Mise à jour prix assurance')}

        {extras.length === 0 ? (
          <p className="rounded-[var(--radius-input)] border border-dashed border-border px-4 py-6 text-sm text-text-muted">
            Aucune option. Le formulaire ci-dessous en crée une ; sans option, l’étape « suppléments » du tunnel reste vide.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[64rem]">
              <div className={`${EXTRA_COLS} border-b border-border pb-2 ${HEAD}`}>
                <span>Clé</span>
                <span>Nom (FR)</span>
                <span>Type</span>
                <span>Prix (MAD)</span>
                <span>Sur 7 jours</span>
                <span>État</span>
                <span />
              </div>
              {extras.map((extra) => {
                const key = `extra:${extra.id}`;
                return (
                  <form key={extra.id} onSubmit={(event) => submitExtra(event, extra.id)} className={`${EXTRA_COLS} border-b border-border py-2.5`}>
                    <Input name="key" defaultValue={extra.key} required maxLength={40} className="font-latin-sans" aria-label="Clé technique" />
                    <div>
                      <Input name="name_fr" defaultValue={extra.name?.fr || ''} required maxLength={120} aria-label="Nom en français" />
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-text-muted">Traductions</summary>
                        <div className="mt-2 space-y-2">
                          {OTHER_LOCALES.map((locale) => (
                            <Input
                              key={locale}
                              name={`name_${locale}`}
                              defaultValue={extra.name?.[locale] || ''}
                              maxLength={120}
                              dir={locale === 'ar' ? 'rtl' : 'ltr'}
                              placeholder={LOCALE_LABEL[locale]}
                              aria-label={`Nom — ${LOCALE_LABEL[locale]}`}
                            />
                          ))}
                        </div>
                      </details>
                    </div>
                    <Select name="type" defaultValue={extra.type || 'per_day'} aria-label="Type de facturation">
                      <option value="per_day">Par jour</option>
                      <option value="flat">Forfait</option>
                    </Select>
                    <Input name="price" type="number" min="0" step="10" defaultValue={extra.price ?? 0} required className="font-latin-sans tnum" aria-label="Prix en MAD" />
                    <p className="pt-3 text-sm text-text-2 tnum">{formatMAD(sevenDayCost(extra.type, extra.price), 'fr')}</p>
                    <div className="pt-3">
                      <Checkbox id={`extra-active-${extra.id}`} name="active" defaultChecked={extra.active !== false} label="Active" />
                    </div>
                    <div className="flex flex-col gap-1 pt-0.5">
                      <button type="submit" disabled={busy !== null} className={rowButton}>
                        {busy === key ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                      {deleteControls('extras', key, (why) => removeExtra({ id: extra.id, reason: why }))}
                    </div>
                  </form>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={(event) => submitExtra(event, null)} className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Clé" htmlFor="new-extra-key" hint="a-z, chiffres, _">
            <Input id="new-extra-key" name="key" required maxLength={40} placeholder="child_seat" className="font-latin-sans" />
          </Field>
          <Field label="Type" htmlFor="new-extra-type">
            <Select
              id="new-extra-type"
              name="type"
              value={draftExtra.type}
              onChange={(event) => setDraftExtra((current) => ({ ...current, type: event.target.value }))}
            >
              <option value="per_day">Par jour</option>
              <option value="flat">Forfait</option>
            </Select>
          </Field>
          <Field label="Prix (MAD)" htmlFor="new-extra-price">
            <Input
              id="new-extra-price"
              name="price"
              type="number"
              min="0"
              step="10"
              required
              value={draftExtra.price}
              onChange={(event) => setDraftExtra((current) => ({ ...current, price: event.target.value }))}
              className="font-latin-sans tnum"
            />
          </Field>
          <Field label="Sur 7 jours" htmlFor="new-extra-preview">
            {/* Read-only, and computed while you type: 300 MAD par jour et
                300 MAD forfait sont la même saisie et pas la même facture. */}
            <output id="new-extra-preview" className="block min-h-11 rounded-[var(--radius-input)] border border-dashed border-border px-3.5 py-2.5 text-[15px] text-text-2 tnum">
              {draftExtra.price === '' ? '—' : formatMAD(sevenDayCost(draftExtra.type, draftExtra.price), 'fr')}
            </output>
          </Field>
          {['fr', ...OTHER_LOCALES].map((locale) => (
            <Field key={locale} label={`Nom — ${LOCALE_LABEL[locale]}`} htmlFor={`new-extra-name-${locale}`}>
              <Input
                id={`new-extra-name-${locale}`}
                name={`name_${locale}`}
                required={locale === 'fr'}
                maxLength={120}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              />
            </Field>
          ))}
          <div className="flex items-end">
            <Checkbox id="new-extra-active" name="active" defaultChecked label="Active" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busy !== null} className={primaryButton}>
              {busy === 'extra:new' ? 'Ajout…' : 'Ajouter l’option'}
            </button>
          </div>
        </form>
      </Card>

      {/* ----------------------------------------------------------- cautions */}
      <Card title="Caution par catégorie">
        <p className="mb-4 max-w-3xl text-sm text-text-2">
          La caution inscrite sur une voiture <strong className="font-semibold text-text">l’emporte toujours</strong>. Ces montants ne
          servent qu’à combler un vide : ils ne s’appliquent qu’aux voitures dont la fiche n’en porte aucune. Une case laissée vide
          n’affiche aucune caution pour cette catégorie — elle n’en invente pas une à zéro.
        </p>
        {notice('deposits')}
        {reasonField('deposits', 'Révision cautions SUV')}

        <form onSubmit={submitDeposits}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((category) => (
              <Field key={category} label={CAT_LABEL[category] || category} htmlFor={`deposit-${category}`}>
                <Input
                  id={`deposit-${category}`}
                  name={`deposit_${category}`}
                  type="number"
                  min="0"
                  step="500"
                  defaultValue={depositByCategory[category] ?? ''}
                  placeholder="aucune"
                  className="font-latin-sans tnum"
                />
              </Field>
            ))}
          </div>
          <div className="mt-5">
            <button type="submit" disabled={busy !== null} className={primaryButton}>
              {busy === 'deposits' ? 'Enregistrement…' : 'Enregistrer les cautions'}
            </button>
          </div>
        </form>
      </Card>

      {/* -------------------------------------------------------------- frais */}
      <Card title="Frais divers et conditions">
        <p className="mb-4 max-w-3xl text-sm text-text-2">
          Les frais de livraison ci-dessous sont les valeurs par défaut du moteur de devis (aéroport, ville, aller simple). Le tarif
          propre à un lieu se règle plus bas, dans « Lieux et livraison ».
        </p>
        {notice('fees')}
        {reasonField('fees', 'Alignement frais aéroport')}

        <form onSubmit={submitFees}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Livraison aéroport (MAD)" htmlFor="airportDeliveryFee">
              <Input id="airportDeliveryFee" name="airportDeliveryFee" type="number" min="0" step="50" defaultValue={settings.airportDeliveryFee ?? 0} className="font-latin-sans tnum" />
            </Field>
            <Field label="Livraison ville (MAD)" htmlFor="cityDeliveryFee">
              <Input id="cityDeliveryFee" name="cityDeliveryFee" type="number" min="0" step="50" defaultValue={settings.cityDeliveryFee ?? 0} className="font-latin-sans tnum" />
            </Field>
            <Field label="Aller simple (MAD)" htmlFor="oneWayFee" hint="départ ≠ retour">
              <Input id="oneWayFee" name="oneWayFee" type="number" min="0" step="50" defaultValue={settings.oneWayFee ?? 0} className="font-latin-sans tnum" />
            </Field>

            {MONTHLY_KEYS.map(([key, label]) => (
              <Field key={key} label={`Mensuel dès — ${label} (MAD)`} htmlFor={`monthly_${key}`}>
                <Input id={`monthly_${key}`} name={`monthly_${key}`} type="number" min="0" step="500" defaultValue={settings.monthlyFrom?.[key] ?? 0} className="font-latin-sans tnum" />
              </Field>
            ))}

            <Field label="Annulation gratuite (heures avant départ)" htmlFor="freeCancellationHours">
              <Input id="freeCancellationHours" name="freeCancellationHours" type="number" min="0" max="720" defaultValue={settings.freeCancellationHours ?? 24} className="font-latin-sans tnum" />
            </Field>
            <Field label="Libération de la caution (jours)" htmlFor="depositReleaseDays">
              <Input id="depositReleaseDays" name="depositReleaseDays" type="number" min="0" max="90" defaultValue={settings.depositReleaseDays ?? 7} className="font-latin-sans tnum" />
            </Field>
            <Field label="Taux EUR (MAD pour 1 €)" htmlFor="eurRate" hint="indicatif">
              <Input id="eurRate" name="eurRate" type="number" min="1" max="100" step="0.01" defaultValue={settings.eurRate ?? 10.8} className="font-latin-sans tnum" />
            </Field>

            <Field label="Âge minimum" htmlFor="minAge">
              <Input id="minAge" name="minAge" type="number" min="18" max="40" defaultValue={settings.minAge ?? 21} className="font-latin-sans tnum" />
            </Field>
            <Field label="Âge minimum premium" htmlFor="premiumMinAge">
              <Input id="premiumMinAge" name="premiumMinAge" type="number" min="18" max="60" defaultValue={settings.premiumMinAge ?? 25} className="font-latin-sans tnum" />
            </Field>
            <Field label="Ancienneté du permis (années)" htmlFor="minLicenseYears">
              <Input id="minLicenseYears" name="minLicenseYears" type="number" min="0" max="20" defaultValue={settings.minLicenseYears ?? 1} className="font-latin-sans tnum" />
            </Field>
            <Field label="Politique carburant" htmlFor="fuelPolicy" className="sm:col-span-2">
              <Select id="fuelPolicy" name="fuelPolicy" defaultValue={settings.fuelPolicy === 'same-to-same' ? 'same-to-same' : 'full-to-full'}>
                <option value="full-to-full">Plein à plein</option>
                <option value="same-to-same">Niveau identique au départ</option>
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <button type="submit" disabled={busy !== null} className={primaryButton}>
              {busy === 'fees' ? 'Enregistrement…' : 'Enregistrer les frais'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
