import { getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';

/**
 * The airport banner (plan 4.3 §4): ATTERRIR. RÉCUPÉRER. ROULER. over a runway
 * line that grows as the section scrolls into view.
 *
 * The runway is a CSS scroll-driven animation — it reuses the `grow-x`
 * keyframe already in globals.css, bound to `view()` with an inline style so
 * no new CSS is needed. Where `animation-timeline` is unsupported, and under
 * prefers-reduced-motion (globals.css zeroes every duration), the line simply
 * renders full width. Nothing here depends on the motion to be understood.
 *
 * The car crossing the runway is PROMPT 14.
 *
 * @param {{ settings: object }} props
 */
export default async function AirportBanner({ settings }) {
  const t = await getTranslations('home.airport');

  /* Only claims settings can actually support (CLAUDE.md rule 11). The
     agency's own announcement confirms airport service; flight tracking and a
     no-night-surcharge policy are NOT recorded anywhere, so they do not render. */
  const points = [];
  if (settings?.airportService24h) points.push(t('points.open'));
  if (settings?.services?.delivery) points.push(t('points.delivery'));
  if (settings?.responseTime) points.push(t('points.confirm'));

  return (
    <section id="aeroport" className="section-y">
      <div className="container-x">
        <p className="eyebrow">{t('eyebrow')}</p>

        <h2 className="mt-5 text-text">
          <span className="text-display-2 block">{t('line1')}</span>
          <span className="text-display-2 block">{t('line2')}</span>
          <span className="text-display-2 block">{t('line3')}</span>
        </h2>

        {/* The runway. Origin flips in RTL so it grows toward the reading edge. */}
        <div className="mt-8 h-0.5 w-full overflow-hidden">
          <div
            className="h-full w-full origin-left bg-red-signal rtl:origin-right"
            style={{ animation: 'grow-x linear both', animationTimeline: 'view()', animationRange: 'entry 0% cover 40%' }}
            aria-hidden="true"
          />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <p className="text-text-2 lg:col-span-6">{t('text')}</p>
          {points.length > 0 ? (
            <ul className="text-meta flex flex-col gap-3 text-text-2 lg:col-span-4 lg:col-start-9">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-signal" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-10">
          <Button href="/aeroport" size="lg">
            {t('cta')}
            <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </section>
  );
}
