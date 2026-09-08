'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removeReview, saveReview } from '@/lib/actions/content';
import { LOCALES } from '@/lib/constants';
import { formatDate } from '@/lib/format';

/**
 * Manual review entry (plan 8.4, CLAUDE.md rule 11).
 *
 * Diab Car never writes a review. Every row here is either copied from the
 * Google Business Profile or written down from something a customer actually
 * said, and the source field says which. There is no third option on purpose:
 * an "editorial" testimonial is an invented fact, and rule 11 hides what
 * cannot be verified rather than inventing it.
 *
 * The `isSample` rows are the seeded examples that ship with the demo. The
 * REVIEWS RLS policy (migration 0005) excludes them from every public read, so
 * they are already unservable — but a row that is published, looks published
 * in the admin, and silently never appears is the kind of thing that gets
 * debugged for an hour. The label and the sentence below exist so nobody has
 * to discover that from an empty homepage section.
 */

const LOCALE_NAME = { fr: 'Français', en: 'English', ar: 'العربية', es: 'Español' };
const LOCALE_CODE = { fr: 'FR', en: 'EN', ar: 'AR', es: 'ES' };

const SOURCES = [
  ['google', 'Google (copié depuis la fiche)'],
  ['manual', 'Recueilli à l’agence / WhatsApp'],
];

const SOURCE_LABEL = { google: 'Google', manual: 'Agence' };

/**
 * The display convention: first name + the initial of the surname.
 *
 * Data minimisation (plan 9.4): a public page needs enough to make the review
 * credible and nothing more, and a full name plus a city plus a car is an
 * identification. The suggestion is offered, never applied behind the
 * operator's back — a review is a quotation, and the person's own signature is
 * part of it.
 */
function toConvention(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const [first, ...rest] = parts;
  const surname = rest[rest.length - 1] || '';
  /* Spread, not charAt: an Arabic or accented surname must not be cut in the
     middle of a code point. */
  const initial = surname ? `${[...surname][0]}.` : '';
  return initial ? `${first} ${initial}` : first;
}

const emptyDraft = () => ({
  id: '',
  authorName: '',
  rating: 5,
  lang: 'fr',
  source: 'google',
  text: '',
  vehicleId: '',
  city: 'Casablanca',
  published: false,
  isSample: false,
  externalId: '',
});

function toDraft(review) {
  if (!review) return emptyDraft();
  return {
    id: review.id || '',
    authorName: review.authorName || '',
    rating: Number(review.rating) || 5,
    lang: LOCALES.includes(review.lang) ? review.lang : 'fr',
    source: review.source === 'manual' ? 'manual' : 'google',
    text: review.text || '',
    vehicleId: review.vehicleId || '',
    city: review.city || '',
    published: Boolean(review.published),
    isSample: Boolean(review.isSample),
    externalId: review.externalId || '',
  };
}

const Stars = ({ rating }) => (
  <span className="text-warning" aria-label={`${rating} sur 5`}>
    {'★'.repeat(rating)}
    <span className="text-text-muted">{'★'.repeat(5 - rating)}</span>
  </span>
);

export default function ReviewEditor({ reviews = [], vehicles = [] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const setField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const open = (review) => {
    setDraft(toDraft(review));
    setConfirmId(null);
    setMessage(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const result = await saveReview(draft);
    setBusy(false);
    if (result?.ok) {
      setDraft(null);
      setMessage({ tone: 'ok', text: 'Avis enregistré.' });
      router.refresh();
      return;
    }
    setMessage({ tone: 'bad', text: result?.message || 'Enregistrement refusé.' });
  };

  const destroy = async (id) => {
    setBusy(true);
    const result = await removeReview({ id });
    setBusy(false);
    setConfirmId(null);
    if (result?.ok) {
      if (draft?.id === id) setDraft(null);
      setMessage({ tone: 'ok', text: 'Avis supprimé.' });
      router.refresh();
      return;
    }
    setMessage({ tone: 'bad', text: result?.message || 'Suppression refusée.' });
  };

  const samples = reviews.filter((r) => r.isSample);
  const live = reviews.filter((r) => r.published && !r.isSample);
  const suggestion = draft ? toConvention(draft.authorName) : '';
  const conforms = Boolean(draft) && suggestion !== '' && draft.authorName.trim() === suggestion;

  return (
    <div data-testid="review-editor">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Affichés sur le site</div>
          <div className="tnum mt-1 text-2xl text-text">{live.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Enregistrés</div>
          <div className="tnum mt-1 text-2xl text-text">{reviews.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Exemples de démonstration</div>
          <div className={`tnum mt-1 text-2xl ${samples.length ? 'text-warning' : 'text-text'}`}>{samples.length}</div>
        </div>
      </div>

      {samples.length > 0 ? (
        <p className="mt-4 rounded-lg border border-warning bg-warning-soft/20 px-4 py-3 text-sm text-text-2" data-testid="sample-warning">
          <span className="font-semibold text-text">{samples.length} avis marqués « exemple ».</span> La base refuse de les servir au public
          (politique RLS sur <span className="font-latin-sans">reviews</span>) : ils n’atteignent jamais le site, même publiés. Remplacez-les
          par de vrais avis Google, puis supprimez-les.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => open(null)}
          data-testid="review-new"
          className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-on-red"
        >
          + Nouvel avis
        </button>
        <p className="text-xs text-text-muted">
          Copiez le texte exactement tel qu’il est écrit. Aucun avis n’est rédigé par l’agence.
        </p>
      </div>

      {message ? (
        <p
          role="status"
          data-testid="review-message"
          className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${message.tone === 'ok' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
        >
          {message.text}
        </p>
      ) : null}

      {draft ? (
        <form onSubmit={submit} data-testid="review-form" className="mt-5 rounded-lg border border-border-strong bg-surface-1 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-text">{draft.id ? 'Modifier l’avis' : 'Nouvel avis'}</h2>
            <button type="button" onClick={() => setDraft(null)} className="text-xs font-semibold text-text-muted hover:text-text">
              Fermer
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-text-muted">Nom affiché</span>
              <input
                value={draft.authorName}
                onChange={(e) => setField('authorName', e.target.value)}
                data-testid="review-author"
                maxLength={80}
                required
                lang={draft.lang}
                dir={draft.lang === 'ar' ? 'rtl' : 'ltr'}
                style={draft.lang === 'ar' ? { fontFamily: 'var(--font-body)' } : undefined}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              />
              <span className="mt-1.5 block text-xs text-text-muted">
                Convention : prénom + initiale du nom — le site ne publie pas le nom complet (minimisation des données, plan 9.4).
              </span>
              {draft.authorName.trim() ? (
                conforms ? (
                  <span className="mt-1 block text-xs font-semibold text-success" data-testid="author-ok">
                    Conforme : « {suggestion} » s’affichera sur le site.
                  </span>
                ) : (
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-2">
                    <span>
                      Selon la convention : <span className="font-semibold text-text">« {suggestion} »</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setField('authorName', suggestion)}
                      data-testid="author-apply"
                      className="rounded border border-border-strong px-2 py-1 text-[11px] font-semibold text-text"
                    >
                      Appliquer
                    </button>
                    <span className="text-text-muted">Rien n’est modifié sans ce clic.</span>
                  </span>
                )
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Note</span>
              <select
                value={draft.rating}
                onChange={(e) => setField('rating', Number(e.target.value))}
                data-testid="review-rating"
                className="tnum w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Langue de l’avis</span>
              <select
                value={draft.lang}
                onChange={(e) => setField('lang', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAME[l]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-text-muted">Source</span>
              <select
                value={draft.source}
                onChange={(e) => setField('source', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              >
                {SOURCES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Ville (optionnel)</span>
              <input
                value={draft.city}
                onChange={(e) => setField('city', e.target.value)}
                maxLength={80}
                placeholder="Casablanca"
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-text-muted">Voiture louée (optionnel)</span>
              <select
                value={draft.vehicleId}
                onChange={(e) => setField('vehicleId', e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              >
                <option value="">Non précisée</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {`${v.brand} ${v.model}`.trim()}
                  </option>
                ))}
              </select>
            </label>

            {draft.source === 'google' ? (
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-text-muted">Identifiant Google (optionnel)</span>
                <input
                  value={draft.externalId}
                  onChange={(e) => setField('externalId', e.target.value)}
                  maxLength={120}
                  placeholder="Évite d’importer deux fois le même avis"
                  className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 font-latin-sans text-sm text-text placeholder:text-text-muted"
                />
              </label>
            ) : null}
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-xs text-text-muted">Texte de l’avis, mot pour mot</span>
            <textarea
              value={draft.text}
              onChange={(e) => setField('text', e.target.value)}
              data-testid="review-text"
              rows={5}
              maxLength={2000}
              required
              lang={draft.lang}
              dir={draft.lang === 'ar' ? 'rtl' : 'ltr'}
              style={draft.lang === 'ar' ? { fontFamily: 'var(--font-body)' } : undefined}
              className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
            />
          </label>

          <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-start gap-2 text-sm text-text-2">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setField('published', e.target.checked)}
                data-testid="review-published"
                className="mt-0.5 h-4 w-4 accent-[var(--accent-fill)]"
              />
              <span>Publié — visible dans la section avis du site</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-text-2">
              <input
                type="checkbox"
                checked={draft.isSample}
                onChange={(e) => setField('isSample', e.target.checked)}
                data-testid="review-sample"
                className="mt-0.5 h-4 w-4 accent-[var(--accent-fill)]"
              />
              <span>
                Exemple de démonstration —{' '}
                <span className="text-text-muted">la base refuse de servir cette ligne au public, quoi qu’il arrive.</span>
              </span>
            </label>
            {draft.isSample && draft.published ? (
              <p className="rounded bg-warning-soft px-3 py-2 text-xs font-medium text-warning" data-testid="sample-conflict">
                Coché « publié » et « exemple » : cet avis n’apparaîtra nulle part sur le site. Décochez « exemple » s’il s’agit d’un vrai avis.
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              data-testid="review-save"
              className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-on-red disabled:opacity-50"
            >
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {reviews.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">
          Aucun avis enregistré. Le premier vient de la fiche Google : ouvrez-la, copiez le texte, la note et le prénom du client.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[54rem] border-collapse text-sm" data-testid="reviews-table">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                <th scope="col" className="px-3 py-2 text-start font-semibold">Auteur</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Note</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Avis</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Source</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Date</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Sur le site</th>
                <th scope="col" className="px-3 py-2 text-end font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => {
                const vehicle = vehicles.find((v) => v.id === r.vehicleId);
                return (
                  <tr key={r.id} className="border-b border-border align-top transition-colors hover:bg-surface-2" data-review={r.id}>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => open(r)}
                        lang={r.lang}
                        dir={r.lang === 'ar' ? 'rtl' : 'ltr'}
                        className="text-start font-semibold text-text hover:underline"
                      >
                        {r.authorName}
                      </button>
                      {r.city ? <div className="text-[11px] text-text-muted">{r.city}</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Stars rating={Number(r.rating) || 0} />
                    </td>
                    <td className="max-w-md px-3 py-2.5">
                      <p
                        lang={r.lang}
                        dir={r.lang === 'ar' ? 'rtl' : 'ltr'}
                        style={r.lang === 'ar' ? { fontFamily: 'var(--font-body)' } : undefined}
                        className="line-clamp-3 text-xs text-text-2"
                      >
                        {r.text}
                      </p>
                      <span className="mt-1 block text-[11px] text-text-muted">
                        {LOCALE_CODE[r.lang] || r.lang}
                        {vehicle ? ` · ${vehicle.brand} ${vehicle.model}` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-2">{SOURCE_LABEL[r.source] || r.source}</td>
                    <td className="tnum px-3 py-2.5 text-xs text-text-muted">{r.createdAt ? formatDate(r.createdAt, 'fr') : '—'}</td>
                    <td className="px-3 py-2.5">
                      {r.isSample ? (
                        <span className="inline-flex rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning" title="Exemple : jamais servi au public">
                          EXEMPLE — jamais affiché
                        </span>
                      ) : (
                        <span className={`text-xs font-semibold ${r.published ? 'text-success' : 'text-text-muted'}`}>
                          {r.published ? 'Affiché' : 'Masqué'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      {confirmId === r.id ? (
                        <span className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => destroy(r.id)}
                            data-testid="review-delete-confirm"
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
                          <button type="button" onClick={() => open(r)} className="text-xs font-semibold text-text-2 hover:text-text">
                            Modifier
                          </button>
                          <button type="button" onClick={() => setConfirmId(r.id)} className="text-xs font-semibold text-danger hover:underline">
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
