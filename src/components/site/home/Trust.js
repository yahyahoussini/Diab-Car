import { getLocale, getTranslations } from 'next-intl/server';

/**
 * "Pourquoi Diab Car" — four big statements (plan 4.3 §6).
 *
 * CLAUDE.md rule 11 is the whole design of this component: a statement renders
 * only if `settings` actually carries the fact behind it. Nothing is invented,
 * nothing is a placeholder, and if fewer than two verify the section does not
 * render at all rather than showing a thin row.
 *
 * Today that means: since 2013, airport service, cash/TPE at pickup (a decided
 * fact), and the WhatsApp response time. The Google rating and review count
 * are absent from settings, so they are suppressed — exactly as they should be
 * until Diab Car supplies them with proof.
 *
 * @param {{ settings: object }} props
 */
export default async function Trust({ settings }) {
  const t = await getTranslations('home.trust');
  const locale = await getLocale();
  const s = settings || {};
  const year = new Date().getFullYear();

  const candidates = [
    {
      id: 'rating',
      lead: s.googleRating ? String(s.googleRating).replace('.', locale === 'fr' || locale === 'es' ? ',' : '.') : null,
      verified: Number(s.googleRating) > 0 && Number(s.googleReviewCount) > 0,
      label: () => t('rating', { count: String(s.googleReviewCount) }),
    },
    {
      id: 'since',
      lead: s.foundedYear ? String(s.foundedYear) : null,
      verified: Number(s.foundedYear) > 1900 && Number(s.foundedYear) <= year,
      label: () => t('since'),
    },
    {
      id: 'airport',
      lead: '24/7',
      verified: s.airportService24h === true,
      label: () => t('airport'),
    },
    {
      id: 'payment',
      /* Decided, not assumed: no online payment, ever (plan 9.5). */
      lead: t('paymentLead'),
      verified: s.services?.onlinePayment === false,
      label: () => t('payment'),
    },
    {
      id: 'chauffeur',
      lead: t('chauffeurLead'),
      verified: s.services?.chauffeur === true,
      label: () => t('chauffeur'),
    },
  ];

  const items = candidates.filter((c) => c.verified && c.lead).slice(0, 4);
  if (items.length < 2) return null;

  return (
    <section id="trust" className="section-y">
      <div className="container-x">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="text-h2 mt-3 text-text">{t('title')}</h2>

        <dl className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 bg-bg p-6">
              <dt className="text-h2 tnum text-text">{item.lead}</dt>
              <dd className="text-meta text-text-muted">{item.label()}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
