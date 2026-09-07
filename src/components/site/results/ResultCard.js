'use client';

import { cn } from '@/lib/cn';

/**
 * A results card (plan 4.4 / 4.5), rendered on the CLIENT.
 *
 * Why not `VehicleCard`: that one is an async server component (it calls
 * getTranslations), so it cannot be rendered from an island that re-renders
 * after every fetch. And it cannot simply be made client-side either —
 * `CarImage` statically imports the whole photo manifest, and pulling that into
 * the browser would ship every blur data-URI on the site to every visitor.
 *
 * So this card takes plain, already-localized props, and its `<picture>` is
 * built from a compact per-vehicle photo record ({ widths, width, height })
 * the server passes down: about a kilobyte for the whole fleet instead of the
 * manifest. The blur placeholder is deliberately absent — these cards are
 * lazy-loaded below the fold, where a flat surface reads better than a
 * low-resolution smear anyway.
 *
 * What it shows that the homepage card does not: per-day AND total for the
 * chosen dates, together, because rule 4 says once dates are known both appear
 * and nothing may show up later that was not shown here.
 *
 * @param {{
 *   v: object, photo: {widths:number[], width:number, height:number}|null,
 *   href: string, selected: boolean, onSelect: () => void,
 *   index: number, stagger: boolean, labels: Record<string,string>,
 *   money: (n:number) => string,
 * }} props
 */
export default function ResultCard({ v, photo, href, selected, onSelect, index, stagger, labels, money }) {
  const unavailable = !v.available;

  return (
    <article
      data-result-card={selected}
      data-slug={v.slug}
      className={cn(
        'vcard card group relative flex h-full flex-col overflow-hidden transition-[opacity,transform] duration-[--dur-hover]',
        stagger && 'card-enter',
        unavailable && 'opacity-70',
      )}
      style={stagger ? { '--enter-delay': `${Math.min(index, 11) * 40}ms` } : undefined}
    >
      {/* The whole card is a selection target except its CTA (plan 4.4). A
          button rather than a click handler on the article, so it is reachable
          by keyboard and announced as pressable. */}
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
      >
        <span className="sr-only">{labels.select.replace('{car}', `${v.brand} ${v.model}`)}</span>
      </button>

      <div className="chamfer relative aspect-[16/10] overflow-hidden bg-surface-2">
        {photo ? (
          <picture>
            <source type="image/avif" srcSet={photo.widths.map((w) => `/images/cars/${v.photoFolder}/front-${w}.avif ${w}w`).join(', ')} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
            <source type="image/webp" srcSet={photo.widths.map((w) => `/images/cars/${v.photoFolder}/front-${w}.webp ${w}w`).join(', ')} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
            <img
              src={`/images/cars/${v.photoFolder}/front-${photo.widths[photo.widths.length - 1]}.webp`}
              alt={`${v.brand} ${v.model}`}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </picture>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/images/cars/${SILHOUETTE[v.category] || 'berline'}.svg`} alt={`${v.brand} ${v.model}`} width={800} height={380} loading="lazy" decoding="async" className="h-full w-full object-contain p-4 opacity-70" />
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span />
          <AvailabilityDot v={v} labels={labels} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-meta font-semibold text-text">
          {v.brand} {v.model}
        </h3>
        <p className="text-meta mt-1 text-text-muted">
          {[labels[`transmission_${v.transmission}`], labels.seats.replace('{n}', String(v.seats)), labels[`fuel_${v.fuel}`]].filter(Boolean).join(' · ')}
        </p>

        <div className="mt-auto pt-5">
          {v.days ? (
            <>
              {/* Rule 4: per day and total for the dates, together. */}
              <p className="price text-text">
                {money(v.perDayEffective)}
                <span className="text-meta font-normal text-text-muted"> {labels.perDay}</span>
              </p>
              <p className="text-meta mt-1 text-text-2">
                {labels.totalForDays.replace('{total}', money(v.total)).replace('{days}', String(v.days))}
              </p>
            </>
          ) : (
            <p className="price text-text">
              {labels.fromPrice.replace('{price}', money(v.basePerDay))}
            </p>
          )}

          {unavailable && v.nextAvailableAt ? (
            <p className="text-meta mt-3 text-text-muted">{labels.nextAvailable.replace('{date}', formatDay(v.nextAvailableAt, labels.locale))}</p>
          ) : null}

          <a
            href={href}
            className="relative z-20 mt-4 inline-flex items-center gap-2 text-meta font-semibold text-text underline decoration-red-signal underline-offset-4"
          >
            {labels.see}
            <svg viewBox="0 0 24 24" className="vcard-arrow h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </article>
  );
}

const SILHOUETTE = { economy: 'citadine', compact: 'citadine', sedan: 'berline', suv: 'suv', premium: 'suv-premium', luxury: 'suv-premium', van: 'van' };

/** Plan 6.5: the public sees free / last one / none. Never an internal status. */
function AvailabilityDot({ v, labels }) {
  if (!v.days) return null;
  const kind = !v.available ? 'unavailable' : v.lastOne ? 'last' : 'available';
  const text = kind === 'unavailable' ? labels.unavailable : kind === 'last' ? labels.lastOne : labels.available;
  return (
    <span className="text-meta inline-flex items-center gap-1.5 rounded-full bg-bg/85 px-2.5 py-1 font-semibold text-text backdrop-blur-sm">
      <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', kind === 'unavailable' ? 'bg-text-muted' : 'bg-red-signal')} aria-hidden="true" />
      {text}
    </span>
  );
}

function formatDay(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale || 'fr', { day: '2-digit', month: 'short' }).format(new Date(iso)).toUpperCase();
  } catch {
    return '';
  }
}
