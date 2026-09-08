'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removeFaq, saveFaq } from '@/lib/actions/content';
import { LOCALES } from '@/lib/constants';

/**
 * The answer database (plan 8.5).
 *
 * One row is not "a FAQ entry" — it is one verified fact, written once and
 * read by four surfaces: the FAQ page, the ≤ 6 questions a money page pulls,
 * the ≤ 4 a vehicle page pulls, and the FAQPage JSON-LD that answer engines
 * quote. That is why the short answer is a field of its own and not the first
 * paragraph of the long one: the block that gets lifted has to be authored,
 * not extracted.
 *
 * Completeness is shown per language and never enforced. Four languages ×
 * sixty questions is a two-month job, and a validator that demanded all four
 * at once would be answered with machine translation — which is the one
 * outcome worse than a missing answer, because a wrong answer in Arabic is
 * still an answer the customer acts on.
 *
 * The launch targets in the plan (60 FR / 40 EN / 30 AR / 20 ES) are rendered
 * as a progress strip rather than a rule, so the gap is a fact on the screen
 * instead of a line in a document nobody opens.
 */

const TARGETS = { fr: 60, en: 40, ar: 30, es: 20 };

const LOCALE_CODE = { fr: 'FR', en: 'EN', ar: 'AR', es: 'ES' };
const LOCALE_NAME = { fr: 'Français', en: 'English', ar: 'العربية', es: 'Español' };

/* The fourteen categories of plan 8.5. Slugs stay ASCII because they end up in
   URLs and in query filters. */
const CATEGORIES = [
  ['prix', 'Prix'],
  ['documents', 'Documents'],
  ['aeroport', 'Aéroport'],
  ['assurance', 'Assurance'],
  ['caution', 'Caution'],
  ['carburant', 'Carburant'],
  ['kilometrage', 'Kilométrage'],
  ['conducteur', 'Conducteur'],
  ['paiement', 'Paiement'],
  ['annulation', 'Annulation'],
  ['livraison', 'Livraison'],
  ['longue-duree', 'Longue durée'],
  ['vehicules', 'Véhicules'],
  ['conduite-maroc', 'Conduite au Maroc'],
  ['general', 'Général'],
];

/* Categories the starter shipped. They are listed only when a row still uses
   one, so an old question keeps its label and can be moved on purpose instead
   of being silently reclassified on the next save. */
const LEGACY = { conditions: 'Conditions', payment: 'Paiement', delivery: 'Livraison', insurance: 'Assurance', longterm: 'Longue durée', general: 'Général' };

const categoryLabel = (value) => CATEGORIES.find(([v]) => v === value)?.[1] || LEGACY[value] || value;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * How finished one language is on one question.
 * `full` needs the question AND the short answer: those two are what actually
 * render on the site, so a long answer alone is not a translated question.
 */
function completeness(faq, locale) {
  const q = text(faq.question?.[locale]);
  const short = text(faq.shortAnswer?.[locale]);
  const long = text(faq.longAnswer?.[locale]) || text(faq.answer?.[locale]);
  if (q && short) return 'full';
  if (q || short || long) return 'partial';
  return 'none';
}

const CHIP = {
  full: 'bg-success-soft text-success',
  partial: 'bg-warning-soft text-warning',
  none: 'bg-surface-2 text-text-muted',
};

const CHIP_TITLE = {
  full: 'Question et réponse courte remplies',
  partial: 'Commencée : il manque la question ou la réponse courte',
  none: 'Rien dans cette langue',
};

const sortOf = (faq) => faq.sort ?? faq.sortOrder ?? 100;
const isPublished = (faq) => Boolean(faq.published ?? faq.isPublished);

const emptyI18n = () => Object.fromEntries(LOCALES.map((l) => [l, '']));

const fill = (obj, fallback) => Object.fromEntries(LOCALES.map((l) => [l, obj?.[l] ?? fallback?.[l] ?? '']));

function toDraft(faq) {
  if (!faq) {
    return {
      id: '',
      slug: '',
      category: 'general',
      citySlug: '',
      vehicleId: '',
      sort: 100,
      /* A new question starts as a draft. Publishing is the moment someone
         decides the answer is true, and that decision deserves a click. */
      published: false,
      question: emptyI18n(),
      shortAnswer: emptyI18n(),
      longAnswer: emptyI18n(),
    };
  }
  return {
    id: faq.id || '',
    slug: faq.slug || '',
    category: faq.category || 'general',
    citySlug: faq.citySlug || '',
    vehicleId: faq.vehicleId || '',
    sort: sortOf(faq),
    published: isPublished(faq),
    question: fill(faq.question),
    shortAnswer: fill(faq.shortAnswer),
    /* Rows written before the split carry everything in `answer`. */
    longAnswer: fill(faq.longAnswer, faq.answer),
  };
}

const words = (value) => text(value).split(/\s+/).filter(Boolean).length;

export default function FaqEditor({ faqs = [], vehicles = [] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(null);
  const [lang, setLang] = useState('fr');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState('');

  const setField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setI18n = (field, locale, value) => setDraft((d) => ({ ...d, [field]: { ...d[field], [locale]: value } }));

  const open = (faq) => {
    setDraft(toDraft(faq));
    setLang('fr');
    setConfirmId(null);
    setMessage(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const result = await saveFaq(draft);
    setBusy(false);
    if (result?.ok) {
      setDraft(null);
      setMessage({ tone: 'ok', text: 'Question enregistrée.' });
      router.refresh();
      return;
    }
    setMessage({ tone: 'bad', text: result?.message || 'Enregistrement refusé.' });
  };

  const destroy = async (id) => {
    setBusy(true);
    const result = await removeFaq({ id });
    setBusy(false);
    setConfirmId(null);
    if (result?.ok) {
      if (draft?.id === id) setDraft(null);
      setMessage({ tone: 'ok', text: 'Question supprimée.' });
      router.refresh();
      return;
    }
    setMessage({ tone: 'bad', text: result?.message || 'Suppression refusée.' });
  };

  const q = query.trim().toLowerCase();
  const rows = faqs.filter((faq) => {
    if (missing && completeness(faq, missing) === 'full') return false;
    if (!q) return true;
    const haystack = [...LOCALES.map((l) => faq.question?.[l]), faq.slug, faq.citySlug, categoryLabel(faq.category)];
    return haystack.filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  });

  /* Only PUBLISHED questions count towards the launch targets: a complete
     draft is not an answer the site can give. */
  const counts = Object.fromEntries(
    LOCALES.map((l) => [l, faqs.filter((faq) => isPublished(faq) && completeness(faq, l) === 'full').length]),
  );

  const usedCategories = [...new Set(faqs.map((faq) => faq.category).filter(Boolean))];
  const extraCategories = usedCategories.filter((value) => !CATEGORIES.some(([v]) => v === value));
  const cities = [...new Set(faqs.map((faq) => faq.citySlug).filter(Boolean))];

  return (
    <div data-testid="faq-editor">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LOCALES.map((l) => (
          <li key={l} className="rounded-lg border border-border bg-surface-1 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{LOCALE_CODE[l]}</span>
              <span className="tnum text-sm text-text">
                {counts[l]}
                <span className="text-text-muted"> / {TARGETS[l]}</span>
              </span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-surface-2">
              <div
                className={counts[l] >= TARGETS[l] ? 'h-1 rounded-full bg-success' : 'h-1 rounded-full bg-text-muted'}
                style={{ width: `${Math.min(100, Math.round((counts[l] / TARGETS[l]) * 100))}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-text-muted">publiées avec réponse courte</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-muted">
        Objectif de lancement (plan 8.5). Une langue ne compte que si la question et la réponse courte y sont écrites : c’est ce couple qui
        s’affiche sur le site et qui alimente le balisage FAQPage.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => open(null)}
          data-testid="faq-new"
          className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-on-red"
        >
          + Nouvelle question
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher une question…"
          aria-label="Chercher une question"
          className="w-full max-w-xs rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
        <label className="flex items-center gap-2 text-sm text-text-2">
          <span className="text-text-muted">À compléter en</span>
          <select
            value={missing}
            onChange={(e) => setMissing(e.target.value)}
            className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
          >
            <option value="">toutes langues</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAME[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? (
        <p
          role="status"
          data-testid="faq-message"
          className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${message.tone === 'ok' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
        >
          {message.text}
        </p>
      ) : null}

      {draft ? (
        <form onSubmit={submit} data-testid="faq-form" className="mt-5 rounded-lg border border-border-strong bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-text">{draft.id ? 'Modifier la question' : 'Nouvelle question'}</h2>
            <button type="button" onClick={() => setDraft(null)} className="text-xs font-semibold text-text-muted hover:text-text">
              Fermer
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Catégorie</span>
              <select
                value={draft.category}
                onChange={(e) => setField('category', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              >
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {extraCategories.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)} (ancienne)
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Ville (optionnel)</span>
              <input
                value={draft.citySlug}
                onChange={(e) => setField('citySlug', e.target.value)}
                list="faq-cities"
                placeholder="casablanca, maarif…"
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 font-latin-sans text-sm text-text placeholder:text-text-muted"
              />
              <datalist id="faq-cities">
                {cities.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Véhicule (optionnel)</span>
              <select
                value={draft.vehicleId}
                onChange={(e) => setField('vehicleId', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              >
                <option value="">Toutes les voitures</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {`${v.brand} ${v.model}`.trim()}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Slug (optionnel, ancre stable)</span>
              <input
                value={draft.slug}
                onChange={(e) => setField('slug', e.target.value)}
                placeholder="caution-carte-bancaire"
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 font-latin-sans text-sm text-text placeholder:text-text-muted"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Ordre</span>
              <input
                type="number"
                min="0"
                max="9999"
                value={draft.sort}
                onChange={(e) => setField('sort', e.target.value)}
                className="tnum w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="flex items-end gap-2 pb-2 text-sm text-text-2">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setField('published', e.target.checked)}
                data-testid="faq-published"
                className="h-4 w-4 accent-[var(--accent-fill)]"
              />
              <span>{draft.published ? 'Publiée sur le site' : 'Brouillon — invisible sur le site'}</span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-1 border-b border-border">
            {LOCALES.map((l) => {
              const state = completeness(draft, l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${lang === l ? 'border-red text-text' : 'border-transparent text-text-muted hover:text-text-2'}`}
                >
                  <span lang={l}>{LOCALE_NAME[l]}</span>
                  <span className={`ms-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${state === 'full' ? 'bg-success' : state === 'partial' ? 'bg-warning' : 'bg-text-muted'}`} />
                </button>
              );
            })}
          </div>

          {LOCALES.map((l) => {
            const rtl = l === 'ar';
            /* Arabic keeps its own font stack and its natural casing: the
               `lang` attribute is what flips --font-body in globals.css, and
               nothing here uppercases or letter-spaces it (rule 3). */
            const fieldProps = {
              lang: l,
              dir: rtl ? 'rtl' : 'ltr',
              style: rtl ? { fontFamily: 'var(--font-body)' } : undefined,
            };
            const shortWords = words(draft.shortAnswer[l]);
            return (
              <div key={l} className={lang === l ? 'mt-4 space-y-4' : 'hidden'}>
                <label className="block">
                  <span className="mb-1 block text-xs text-text-muted">Question{l === 'fr' ? ' (obligatoire)' : ''}</span>
                  <input
                    {...fieldProps}
                    value={draft.question[l]}
                    onChange={(e) => setI18n('question', l, e.target.value)}
                    data-testid={`faq-question-${l}`}
                    maxLength={300}
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-text-muted">
                    <span>Réponse courte — le bloc repris par Google{l === 'fr' ? ' (obligatoire)' : ''}</span>
                    <span className={`tnum ${shortWords > 40 ? 'text-warning' : 'text-text-muted'}`}>{shortWords} / 40 mots</span>
                  </span>
                  <textarea
                    {...fieldProps}
                    value={draft.shortAnswer[l]}
                    onChange={(e) => setI18n('shortAnswer', l, e.target.value)}
                    data-testid={`faq-short-${l}`}
                    rows={3}
                    maxLength={600}
                    placeholder={l === 'fr' ? 'Une ou deux phrases factuelles, avec le chiffre.' : ''}
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-text-muted">Réponse longue — le détail sur la page FAQ</span>
                  <textarea
                    {...fieldProps}
                    value={draft.longAnswer[l]}
                    onChange={(e) => setI18n('longAnswer', l, e.target.value)}
                    data-testid={`faq-long-${l}`}
                    rows={7}
                    maxLength={6000}
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
                  />
                </label>
              </div>
            );
          })}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              data-testid="faq-save"
              className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-on-red disabled:opacity-50"
            >
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
              Annuler
            </button>
            <p className="text-xs text-text-muted">
              Le français est obligatoire. Les autres langues peuvent rester vides : une réponse à moitié traduite est pire qu’absente.
            </p>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">
          {faqs.length === 0
            ? 'Aucune question pour l’instant. La première à écrire est celle que l’on vous pose le plus au téléphone.'
            : 'Aucune question ne correspond à ce filtre.'}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm" data-testid="faq-table">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                <th scope="col" className="px-3 py-2 text-start font-semibold">Ordre</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Question (FR)</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Catégorie</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Portée</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Langues</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Statut</th>
                <th scope="col" className="px-3 py-2 text-end font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((faq) => {
                const vehicle = vehicles.find((v) => v.id === faq.vehicleId);
                return (
                  <tr key={faq.id} className="border-b border-border align-top transition-colors hover:bg-surface-2" data-faq={faq.id}>
                    <td className="tnum px-3 py-2.5 text-text-muted">{sortOf(faq)}</td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => open(faq)} className="text-start font-semibold text-text hover:underline">
                        {text(faq.question?.fr) || <span className="text-warning">Sans question en français</span>}
                      </button>
                      {faq.slug ? <div className="font-latin-sans text-[11px] text-text-muted">#{faq.slug}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-text-2">{categoryLabel(faq.category)}</td>
                    <td className="px-3 py-2.5 text-text-2">
                      {faq.citySlug || vehicle ? (
                        <span className="text-xs">
                          {faq.citySlug ? <span className="font-latin-sans">{faq.citySlug}</span> : null}
                          {faq.citySlug && vehicle ? ' · ' : null}
                          {vehicle ? `${vehicle.brand} ${vehicle.model}` : null}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">Tout le site</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex gap-1">
                        {LOCALES.map((l) => {
                          const state = completeness(faq, l);
                          return (
                            <span
                              key={l}
                              title={`${LOCALE_NAME[l]} — ${CHIP_TITLE[state]}`}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CHIP[state]}`}
                            >
                              {LOCALE_CODE[l]}
                            </span>
                          );
                        })}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-semibold ${isPublished(faq) ? 'text-success' : 'text-text-muted'}`}>
                        {isPublished(faq) ? 'Publiée' : 'Brouillon'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      {confirmId === faq.id ? (
                        <span className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => destroy(faq.id)}
                            data-testid="faq-delete-confirm"
                            className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-50"
                          >
                            Supprimer définitivement
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)} className="text-xs font-semibold text-text-muted hover:text-text">
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <span className="flex justify-end gap-3">
                          <button type="button" onClick={() => open(faq)} className="text-xs font-semibold text-text-2 hover:text-text">
                            Modifier
                          </button>
                          <button type="button" onClick={() => setConfirmId(faq.id)} className="text-xs font-semibold text-danger hover:underline">
                            Supprimer
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
