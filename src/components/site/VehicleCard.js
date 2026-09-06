import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Badge from '@/components/ui/Badge';
import { Price } from '@/components/site/Price';
import { vehicleImage } from '@/lib/constants';
import { cn } from '@/lib/cn';

export default async function VehicleCard({ vehicle, query, priority = false, className }) {
  const t = await getTranslations('common');
  const tv = await getTranslations('vehicle');
  const locale = await getLocale();
  const v = vehicle;
  const href = { pathname: '/vehicules/[slug]', params: { slug: v.slug }, ...(query ? { query } : {}) };
  const name = `${v.brand} ${v.model}`;

  return (
    <article className={cn('card group relative flex flex-col overflow-hidden transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-border-strong hover:shadow-float', className)}>
      <Link href={href} className="bg-surface-1 relative block aspect-[4/3] overflow-hidden" aria-label={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={vehicleImage(v)}
          alt={`${name} ${v.year} — ${t(`categories.${v.category}`)}`}
          width={800}
          height={380}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-x-6 bottom-4 top-8 h-[calc(100%-3rem)] w-[calc(100%-3rem)] object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.35)] transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        <div className="absolute start-3 top-3 flex gap-1.5">
          <Badge tone="neutral" className="bg-surface-1/90 backdrop-blur">
            {t(`categories.${v.category}`)}
          </Badge>
          {v.featured ? <Badge tone="brand">{t('featured')}</Badge> : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-text">
              <Link href={href} className="after:absolute after:inset-0">
                {name}
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              <bdi>{v.year}</bdi> · {tv('orSimilar')}
            </p>
          </div>
          <div className="text-end">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted rtl:tracking-normal">{t('fromPrice')}</div>
            <Price amount={v.pricePerDay} className="font-display text-xl leading-tight text-text" eurClassName="block text-xs font-normal text-text-muted" />
            <div className="text-[11px] text-text-muted">{t('perDay')}</div>
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-text-2">
          <li className="inline-flex items-center gap-1.5">
            <SpecIcon name="seats" />
            {t('seats', { count: v.seats })}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <SpecIcon name="luggage" />
            {t('luggage', { count: v.luggage })}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <SpecIcon name="gear" />
            {t(`transmission.${v.transmission}`)}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <SpecIcon name="fuel" />
            {t(`fuel.${v.fuel}`)}
          </li>
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted">
          <span>{v.mileageLimit ? t('kmPerDay', { km: v.mileageLimit }) : t('unlimitedKm')}</span>
          <span className="relative z-10 inline-flex items-center gap-1 font-semibold text-accent">
            {t('details')}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </article>
  );
}

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
