import { getLocale, getTranslations } from 'next-intl/server';
import { dataMode } from '@/lib/data';
import ReviewsCarousel from './ReviewsCarousel';

/**
 * Customer reviews (plan 4.3 §7).
 *
 * Sample reviews exist so the design can be judged before real ones arrive —
 * they must NEVER reach production (plan 4.10). The filter below is the only
 * thing standing between a seeded example and a fake testimonial on a live
 * site, so it keys off `dataMode()`, not an env flag someone might flip.
 *
 * The section renders nothing at all when there is nothing honest to show.
 *
 * @param {{ reviews: object[], settings: object }} props
 */
export default async function Reviews({ reviews = [], settings }) {
  const t = await getTranslations('home.reviews');
  const locale = await getLocale();
  const demo = dataMode() === 'demo';

  const usable = reviews.filter((r) => r.published !== false && (!r.isSample || demo));
  if (usable.length === 0) return null;

  const items = usable.slice(0, 5).map((r) => ({
    id: r.id,
    text: r.text,
    author: r.authorName,
    meta: [r.city, r.createdAt ? new Date(r.createdAt).getFullYear() : null].filter(Boolean).join(' · '),
  }));

  const googleUrl = settings?.googleReviewUrl || settings?.gbpUrl || null;
  const showingSamples = usable.some((r) => r.isSample);

  return (
    <section id="reviews" className="section-y">
      <div className="container-x">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="text-h2 mt-3 text-text">{t('title')}</h2>

        <div className="mt-10 max-w-3xl">
          <ReviewsCarousel items={items} labels={{ previous: t('previous'), next: t('next') }} />
        </div>

        {googleUrl ? (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-meta mt-8 inline-flex items-center gap-2 text-text underline decoration-red-signal underline-offset-4"
          >
            {t('google')}
          </a>
        ) : null}

        {showingSamples ? <p className="text-meta mt-8 text-text-muted">{t('sampleNote')}</p> : null}
      </div>
    </section>
  );
}
