import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import CarImage, { hasCarShot } from '@/components/site/CarImage';
import CarSwap from '@/components/site/CarSwap';
import { uploadedAlt } from '@/components/site/vehiclePhotos';
import { formatDate, formatMAD } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * Pick at most ONE badge for a card (plan 4.5), in priority order:
 * MEILLEUR PRIX (lowest per-day in its category, needs the fleet to compare) ·
 * FAMILLE (>= 7 seats) · PREMIUM · AUTOMATIQUE. POPULAIRE needs rental counts
 * that only the availability engine will have (Sprint 2) - not guessed.
 * @param {object} vehicle
 * @param {object[]} [fleet]
 * @returns {'bestPrice'|'family'|'premium'|'automatic'|null}
 */
export function pickBadge(vehicle, fleet = []) {
  const peers = fleet.filter((v) => v.category === vehicle.category && v.published !== false);
  if (peers.length > 1 && peers.every((v) => v.pricePerDay >= vehicle.pricePerDay) && peers.some((v) => v.pricePerDay > vehicle.pricePerDay)) return 'bestPrice';
  if (vehicle.seats >= 7) return 'family';
  if (vehicle.category === 'premium' || vehicle.category === 'luxury') return 'premium';
  if (vehicle.transmission === 'automatic') return 'automatic';
  return null;
}

/**
 * The vehicle card, used on the homepage fleet block, the results page, the
 * airport page and the "similar cars" row (plan 4.5).
 *
 * - One link target: the name is the accessible name, the whole card is
 *   clickable through the stretched link. Badges and state carry real text.
 * - Availability renders ONLY when the caller passes it: without dates there
 *   is no truthful state to show (CLAUDE.md rule 5 - Postgres decides).
 * - Price object: per day always; total + day count when `dates` is given -
 *   never a total the caller did not compute (rule 4).
 * - Photos: whatever the page passes in `photos` (rows from `vehicle_photos`)
 *   outranks the build-time manifest, so a photo swapped in the admin shows up
 *   here with no deploy (plan 7.1). The card never reads them itself - it is
 *   rendered once per vehicle and a query per card would be a query per card.
 * - Motion: lift 6 px, crossfade front -> rear when a rear shot exists,
 *   scanline sweep, specs lift, arrow slide - transforms/opacity only; tap
 *   flips the image on touch (CarSwap).
 *
 * @param {{
 *   vehicle: object,
 *   fleet?: object[],
 *   photos?: object[],
 *   query?: object,
 *   dates?: { from: string, to: string, days: number, total: number } | null,
 *   availability?: 'available'|'last'|'unavailable'|'high' | null,
 *   nextAvailable?: string | null,
 *   priority?: boolean,
 *   className?: string,
 * }} props
 */
export default async function VehicleCard({ vehicle, photos = [], fleet = [], query, dates = null, availability = null, nextAvailable = null, priority = false, className }) {
  const t = await getTranslations('card');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const v = vehicle;
  const name = `${v.brand} ${v.model}`;
  const href = { pathname: '/vehicules/[slug]', params: { slug: v.slug }, ...(query ? { query } : {}) };
  const badge = pickBadge(v, fleet);
  const rear = hasCarShot(v, 'rear', photos);
  const unavailable = availability === 'unavailable';
  /* Rule 8: an alt the operator wrote for this language beats the generated
     one, which only knows the car's name. Empty falls back. */
  const angleAlt = (angle) => uploadedAlt(photos, angle, locale) || t('photoAlt', { name, angle: t(`angles.${angle}`) });

  /* Max 3 specs; luggage joins on desktop only (plan 4.5). */
  const specs = [tc(`transmission.${v.transmission}`), t('seats', { count: v.seats }), tc(`fuel.${v.fuel}`)];

  return (
    <article
      data-vcard=""
      className={cn(
        'vcard card group relative flex flex-col overflow-hidden transition-[transform,border-color] duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:-translate-y-1.5 hover:border-border-strong',
        unavailable && 'opacity-90',
        className,
      )}
    >
      {/* ---- media: chamfered, front -> rear crossfade, scanline ---- */}
      <div className="chamfer relative aspect-[4/3] overflow-hidden bg-surface-1">
        <CarImage
          vehicle={v}
          photos={photos}
          angle="front"
          alt={angleAlt('front')}
          priority={priority}
          data-has-rear={rear ? 'true' : 'false'}
          className={cn('vcard-front absolute inset-0', unavailable && 'grayscale')}
          imgClassName="p-4"
        />
        {rear ? <CarImage vehicle={v} photos={photos} angle="rear" alt="" aria-hidden="true" className="vcard-rear absolute inset-0" imgClassName="p-4" /> : null}
        <span className="vcard-scan" aria-hidden="true" />

        {/* meta row over the image: badge (max one) and the availability state */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {badge ? <span className="text-meta rounded-full bg-bg/90 px-2.5 py-1 text-text backdrop-blur">{t(`badge.${badge}`)}</span> : <span />}
          {availability ? <AvailabilityState kind={availability} t={t} date={nextAvailable ? formatDate(nextAvailable, locale) : null} /> : null}
        </div>

        {rear ? (
          <CarSwap
            enabled
            label={t('flip')}
            className="absolute bottom-3 end-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg/90 text-text backdrop-blur lg:hidden"
          />
        ) : null}
      </div>

      {/* ---- body ---- */}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-meta text-text-muted">{tc(`categories.${v.category}`)}</p>
        <h3 className="text-h3 mt-1 text-text">
          <Link href={href} className="after:absolute after:inset-0 after:z-10">
            {name}
          </Link>
        </h3>
        <span className="redline mt-3" aria-hidden="true" />

        <ul className="text-meta mt-3 flex flex-wrap gap-x-2 text-text-2 transition-transform duration-[var(--dur-hover)] ease-[var(--ease-out)] group-hover:-translate-y-0.5">
          {specs.map((s, i) => (
            <li key={s} className="inline-flex items-center gap-2">
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              {s}
            </li>
          ))}
          <li className="hidden items-center gap-2 lg:inline-flex">
            <span aria-hidden="true">·</span>
            {t('luggage', { count: v.luggage })}
          </li>
        </ul>

        {/* price object (rule 4): per day, then total for the dates when known */}
        <div className="mt-5">
          <p className="text-meta text-text-muted">{t('from')}</p>
          <p className="price mt-1 text-[1.75rem]">
            <span className="price-value">{formatMAD(v.pricePerDay, locale, { withUnit: false })}</span>
            <span className="price-unit">MAD</span>
            <span className="price-period">{t('perDay')}</span>
          </p>
          {dates && dates.days > 0 ? (
            <p className="text-meta tnum mt-1 text-text-2">{t('total', { total: formatMAD(dates.total, locale), count: dates.days })}</p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <span className="text-meta text-text-muted">{t('orSimilar')}</span>
          <span className="text-meta inline-flex items-center gap-2 text-text">
            {t('book')}
            <svg viewBox="0 0 24 24" className="vcard-arrow h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </article>
  );
}

/** Availability state pill (plan 4.5). Red dot = available; hollow = unavailable; arrow = high demand. */
function AvailabilityState({ kind, t, date }) {
  const label = kind === 'unavailable' && date ? t('state.availableFrom', { date }) : t(`state.${kind}`);
  const mark =
    kind === 'unavailable' ? (
      <span className="inline-block h-2 w-2 rounded-full border border-current" aria-hidden="true" />
    ) : kind === 'high' ? (
      <span aria-hidden="true">↗</span>
    ) : (
      <span className="inline-block h-2 w-2 rounded-full bg-red-signal" aria-hidden="true" />
    );
  return (
    <span className={cn('text-meta inline-flex items-center gap-1.5 rounded-full bg-bg/90 px-2.5 py-1 backdrop-blur', kind === 'unavailable' ? 'text-text-muted' : 'text-text')}>
      {mark}
      {label}
    </span>
  );
}

/** Spec icons still imported by the vehicle page - kept as-is. */
export function SpecIcon({ name, className = 'h-4 w-4 text-text-muted' }) {
  const common = { viewBox: '0 0 24 24', className, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'seats':
      return (
        <svg {...common}>
          <path d="M6 19V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10M4 19h16M8 13h8" />
        </svg>
      );
    case 'luggage':
      return (
        <svg {...common}>
          <rect x="5" y="7" width="14" height="13" rx="2" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 11v6M15 11v6" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="6" cy="5" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="18" cy="5" r="2" />
          <circle cx="6" cy="19" r="2" />
          <circle cx="12" cy="19" r="2" />
          <path d="M6 7v10M12 7v10M18 7v5H6" />
        </svg>
      );
    case 'fuel':
      return (
        <svg {...common}>
          <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2 21h14M4 10h10M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-2-2" />
        </svg>
      );
    case 'doors':
      return (
        <svg {...common}>
          <path d="M3 20h18M5 20V8l6-5h8v17M15 12h.01" />
        </svg>
      );
    case 'year':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common} strokeWidth={2.5}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common} strokeWidth={2.5}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    default:
      return null;
  }
}
