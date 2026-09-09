import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Button from '@/components/ui/Button';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal, { Stagger, StaggerItem } from '@/components/ui/Reveal';
import VehicleCard from '@/components/site/VehicleCard';
import FaqAccordion from '@/components/site/FaqAccordion';
import JsonLd from '@/components/site/JsonLd';
import { ArrowIcon, CheckIcon, GoogleIcon, StarIcon, WhatsAppIcon } from '@/components/site/icons';
import { Price } from '@/components/site/Price';
import { CATEGORIES, t as pick } from '@/lib/constants';
import { formatDate, formatMAD } from '@/lib/format';
import { faqJsonLd } from '@/lib/seo';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

const CATEGORY_IMAGE = { economy: 'citadine', compact: 'citadine', sedan: 'berline', suv: 'suv', premium: 'coupe', luxury: 'suv-premium', van: 'van' };

/* ------------------------------------------------------------------ */
export async function Categories({ vehicles }) {
  const t = await getTranslations('home.categories');
  const tc = await getTranslations('common');
  const groups = CATEGORIES.map((c) => {
    const list = vehicles.filter((v) => v.category === c);
    return { key: c, count: list.length, from: list.length ? Math.min(...list.map((v) => v.pricePerDay)) : null };
  }).filter((g) => g.count);

  return (
    <section className="section-y">
      <div className="container-x">
        <SectionHeading eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
        <Stagger className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {groups.map((g) => (
            <StaggerItem key={g.key}>
              <Link href={{ pathname: '/vehicules', query: { category: g.key } }} className="card group flex h-full flex-col justify-between overflow-hidden p-4 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-accent/60">
                <div className="bg-surface-1 -mx-4 -mt-4 aspect-[5/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/images/cars/${CATEGORY_IMAGE[g.key]}.svg`} alt="" width={800} height={380} loading="lazy" decoding="async" className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="mt-3">
                  <h3 className="font-sans text-[15px] font-semibold text-text">{tc(`categories.${g.key}`)}</h3>
                  <p className="mt-0.5 text-xs text-text-muted">{t('count', { count: g.count })}</p>
                  <p className="mt-2 text-sm text-text-2">
                    <span className="text-text-muted">{tc('fromPrice')} </span>
                    <Price amount={g.from} className="font-semibold text-accent" />
                  </p>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function FeaturedFleet({ vehicles }) {
  const t = await getTranslations('home.fleet');
  const featured = vehicles.filter((v) => v.featured).slice(0, 6);
  return (
    <section className="section-y bg-surface-1/60">
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow={t('eyebrow')} title={t('title')} />
          <Reveal>
            <Button href="/vehicules" variant="secondary">
              {t('cta')}
              <ArrowIcon />
            </Button>
          </Reveal>
        </div>
        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((v, i) => (
            <StaggerItem key={v.id}>
              {/* Below the fold on every viewport: eager-loading these competed with
                  the hero for bandwidth and showed up as three extra image preloads. */}
              <VehicleCard vehicle={v} priority={false} className="h-full" />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
const WHY_ICONS = {
  price: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h18v10H3zM7 12h.01M17 12h.01" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
  deposit: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  airport: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 16l20-6-2.5-2.5L13 10 7 6l-2 1 4 5-5 1.5L2 16zM8 20h12" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3.3-6.95L21 3v6h-6" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
};

export async function WhyUs() {
  const t = await getTranslations('home.why');
  return (
    <section className="section-y">
      <div className="container-x">
        <SectionHeading eyebrow={t('eyebrow')} title={t('title')} align="center" />
        <Stagger className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {['price', 'deposit', 'airport', 'support'].map((k, i) => (
            <StaggerItem key={k} className="h-full">
              <div className="card relative h-full overflow-hidden p-6">
                <span className="font-latin-display absolute end-5 top-4 text-5xl text-accent/15" aria-hidden="true">
                  0{i + 1}
                </span>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{WHY_ICONS[k]}</div>
                <h3 className="mt-5 font-sans text-lg font-semibold text-text">{t(`items.${k}.title`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-2">{t(`items.${k}.text`)}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function PricingTable({ vehicles }) {
  const t = await getTranslations('home.pricing');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const rows = CATEGORIES.map((c) => {
    const list = vehicles.filter((v) => v.category === c);
    if (!list.length) return null;
    return {
      key: c,
      from: Math.min(...list.map((v) => v.pricePerDay)),
      deposit: Math.min(...list.map((v) => v.deposit)),
      mileage: list.every((v) => !v.mileageLimit) ? tc('unlimitedKm') : tc('kmPerDay', { km: Math.min(...list.map((v) => v.mileageLimit || 999)) }),
    };
  }).filter(Boolean);

  return (
    <section className="section-y bg-surface-1/60">
      <div className="container-x">
        <SectionHeading eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
        <Reveal className="mt-10 overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface-1">
          <table className="w-full min-w-[720px] text-start text-sm">
            <thead>
              <tr className="border-b border-border text-[12px] uppercase tracking-[0.1em] text-text-muted rtl:tracking-normal">
                {['category', 'from', 'deposit', 'mileage', 'insurance', 'fuel', 'cancel'].map((k) => (
                  <th key={k} scope="col" className="px-4 py-3 text-start font-semibold">
                    {t(`rows.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                  <th scope="row" className="px-4 py-3 text-start font-semibold text-text">
                    {tc(`categories.${r.key}`)}
                  </th>
                  <td className="px-4 py-3 text-accent">
                    <Price amount={r.from} className="font-semibold" suffix={tc('perDay')} />
                  </td>
                  <td className="px-4 py-3 text-text-2">
                    <bdi className="tnum">{formatMAD(r.deposit, locale)}</bdi>
                  </td>
                  <td className="px-4 py-3 text-text-2">{r.mileage}</td>
                  <td className="px-4 py-3 text-text-2">{t('included')}</td>
                  <td className="px-4 py-3 text-text-2">{t('fuelPolicy')}</td>
                  <td className="px-4 py-3 text-text-2">{t('cancelPolicy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
        <p className="mt-4 text-sm text-text-muted">{t('note')}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function AirportBanner() {
  const t = await getTranslations('home.airport');
  return (
    <section className="section-y">
      <div className="container-x">
        <Reveal className="relative overflow-hidden rounded-[calc(var(--radius-card)+8px)] border border-border bg-text px-6 py-12 text-bg md:px-12 md:py-16 dark:bg-surface-1 dark:text-text">
          <div className="absolute -end-20 -top-24 h-72 w-72 rounded-full bg-accent-fill/25 blur-3xl" aria-hidden="true" />
          <div className="relative grid items-center gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="eyebrow mb-3 text-accent-fill dark:text-accent">{t('eyebrow')}</p>
              <h2 className="text-display-2">{t('title')}</h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed opacity-85">{t('text')}</p>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {['tracking', 'night', 'meet'].map((k) => (
                  <li key={k} className="inline-flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-accent-fill dark:text-accent" />
                    {t(`points.${k}`)}
                  </li>
                ))}
              </ul>
              <Button href="/aeroport" size="lg" className="mt-8">
                {t('cta')}
                <ArrowIcon />
              </Button>
            </div>
            <div className="relative lg:col-span-5">
              <div className="parallax-view">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/cars/berline.svg" alt="" width={800} height={380} loading="lazy" decoding="async" className="w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.5)]" />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function Steps() {
  const t = await getTranslations('home.steps');
  return (
    <section className="section-y bg-surface-1/60">
      <div className="container-x">
        <SectionHeading eyebrow={t('eyebrow')} title={t('title')} align="center" />
        <Stagger className="relative mt-12 grid gap-8 md:grid-cols-3">
          <div className="pointer-events-none absolute inset-x-[16%] top-8 hidden h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent md:block" aria-hidden="true" />
          {['1', '2', '3'].map((k) => (
            <StaggerItem key={k} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/40 bg-surface-1 font-latin-display text-2xl text-accent shadow-card">
                <bdi>{k}</bdi>
              </div>
              <h3 className="mt-5 font-display text-2xl text-text">{t(`items.${k}.title`)}</h3>
              <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-text-2">{t(`items.${k}.text`)}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function Reviews({ reviews = [], settings }) {
  const t = await getTranslations('home.reviews');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const list = reviews.filter((r) => r.published).slice(0, 6);
  if (!list.length) return null;
  const hasSamples = list.some((r) => r.isSample);
  const ordered = [...list.filter((r) => r.lang === locale), ...list.filter((r) => r.lang !== locale)];

  return (
    <section className="section-y">
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow={t('eyebrow')} title={t('title')} />
          {settings?.gbpUrl ? (
            <Reveal>
              <a href={settings.gbpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-4 py-2 text-sm font-semibold text-text-2 hover:text-text">
                <GoogleIcon className="h-4 w-4" />
                {t('leave')}
              </a>
            </Reveal>
          ) : null}
        </div>
        <div className="-mx-5 mt-10 overflow-x-auto px-5 pb-4 [scrollbar-width:none]">
          <Stagger className="flex snap-x gap-4">
            {ordered.map((r) => (
              <StaggerItem key={r.id} className="w-[min(85vw,22rem)] shrink-0 snap-start">
                <figure className="card flex h-full flex-col p-6" lang={r.lang} dir={r.lang === 'ar' ? 'rtl' : 'ltr'}>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-0.5 text-accent" role="img" aria-label={`${r.rating}/5`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <StarIcon key={i} className={`h-4 w-4 ${i < r.rating ? '' : 'opacity-25'}`} />
                      ))}
                    </div>
                    {r.isSample ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">{tc('sample')}</span> : <GoogleIcon className="h-4 w-4" />}
                  </div>
                  <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-text-2">“{r.text}”</blockquote>
                  <figcaption className="mt-5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-text">{r.authorName}</span>
                    <span className="text-text-muted">{formatDate(r.createdAt, locale)}</span>
                  </figcaption>
                </figure>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
        {hasSamples ? <p className="text-xs text-text-muted">{t('sampleNote')}</p> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function FaqSection({ faqs = [], limit = 6, withSchema = true }) {
  const t = await getTranslations('home.faq');
  const locale = await getLocale();
  const list = faqs.slice(0, limit);
  return (
    <section className="section-y bg-surface-1/60">
      <div className="container-x grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHeading eyebrow={t('eyebrow')} title={t('title')} />
          <Reveal className="mt-6">
            <Button href="/faq" variant="secondary">
              {t('cta')}
              <ArrowIcon />
            </Button>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-8">
          <FaqAccordion faqs={list} locale={locale} name="home-faq" />
        </Reveal>
      </div>
      {withSchema ? <JsonLd data={faqJsonLd(list, locale)} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function BlogTeasers({ posts = [] }) {
  const t = await getTranslations('home.blog');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const list = posts.slice(0, 3);
  if (!list.length) return null;
  return (
    <section className="section-y">
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow={t('eyebrow')} title={t('title')} />
          <Reveal>
            <Button href="/blog" variant="secondary">
              {t('cta')}
              <ArrowIcon />
            </Button>
          </Reveal>
        </div>
        <Stagger className="mt-10 grid gap-5 md:grid-cols-3">
          {list.map((p) => (
            <StaggerItem key={p.id} className="h-full">
              <article className="card group relative flex h-full flex-col overflow-hidden">
                <div className="bg-surface-1 aspect-[16/9] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/images/cars/${p.cover || 'berline'}.svg`} alt="" width={800} height={380} loading="lazy" decoding="async" className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <time dateTime={p.publishedAt} className="text-xs text-text-muted">
                    {formatDate(p.publishedAt, locale)}
                  </time>
                  <h3 className="mt-2 font-display text-xl leading-snug text-text">
                    <Link href={{ pathname: '/blog/[slug]', params: { slug: p.slug } }} className="after:absolute after:inset-0">
                      {pick(p.title, locale)}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-2">{pick(p.excerpt, locale)}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                    {tc('readMore')}
                    <ArrowIcon className="h-3.5 w-3.5" />
                  </span>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export async function CtaBand({ settings }) {
  const t = await getTranslations('home.cta');
  const locale = await getLocale();
  return (
    <section className="section-y">
      <div className="container-x">
        <Reveal className="relative overflow-hidden rounded-[calc(var(--radius-card)+8px)] border border-accent/30 bg-gradient-to-br from-accent-soft via-surface-1 to-surface-1 p-8 text-center md:p-14">
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-display-2 text-text">{t('title')}</h2>
            <p className="mt-4 text-lg text-text-2">{t('text')}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/vehicules" size="xl">
                {t('primary')}
                <ArrowIcon />
              </Button>
              {settings?.whatsapp ? (
                <Button href={whatsappLink(settings.whatsapp, genericMessage(locale))} external variant="whatsapp" size="xl">
                  <WhatsAppIcon className="h-5 w-5" />
                  {t('secondary')}
                </Button>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
