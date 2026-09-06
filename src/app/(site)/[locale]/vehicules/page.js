import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import Breadcrumbs from '@/components/site/Breadcrumbs';
import FleetFilters from '@/components/site/FleetFilters';
import VehicleCard from '@/components/site/VehicleCard';
import JsonLd from '@/components/site/JsonLd';
import Reveal from '@/components/ui/Reveal';
import BookingWidget from '@/components/site/BookingWidget';
import { CATEGORIES, listLocations, listVehicles } from '@/lib/data';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.fleet' });
  return localizedMetadata({ locale, href: '/vehicules', title: t('title'), description: t('description') });
}

export default async function FleetPage({ params, searchParams }) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'fleet' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tseo = await getTranslations({ locale, namespace: 'seo.fleet' });

  const [all, locations] = await Promise.all([listVehicles({ published: true }), listLocations()]);
  const filtered = await listVehicles({
    published: true,
    category: CATEGORIES.includes(sp.category) ? sp.category : undefined,
    transmission: sp.transmission || undefined,
    fuel: sp.fuel || undefined,
    seats: sp.seats || undefined,
    maxPrice: sp.maxPrice || undefined,
    sort: sp.sort || undefined,
  });
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, all.filter((v) => v.category === c).length]));
  const minPrice = all.length ? Math.min(...all.map((v) => v.pricePerDay)) : 0;

  // Dates chosen in the widget travel to each vehicle page.
  const query = {};
  ['from', 'ft', 'to', 'tt', 'pickup', 'dropoff'].forEach((k) => sp[k] && (query[k] = sp[k]));
  const hasDates = Boolean(sp.from && sp.to);

  const url = absoluteUrl(locale, '/vehicules');

  return (
    <div className="pt-[calc(var(--header-h)+1.5rem)]">
      <div className="container-x">
        <Breadcrumbs items={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: t('title'), url }]} />
        <Reveal className="mt-6 max-w-3xl">
          <h1 className="text-display-2 text-text">{t('title')}</h1>
          <p className="mt-4 text-lg text-text-2">{t('intro')}</p>
          {/* Answer-first block for AI engines and featured snippets */}
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent-soft/60 px-5 py-4 text-[15px] leading-relaxed text-text">{t('answer', { price: formatMAD(minPrice, locale) })}</p>
        </Reveal>

        <Reveal className="mt-8">
          <BookingWidget locations={locations} compact initial={{ from: sp.from, ft: sp.ft, to: sp.to, tt: sp.tt, pickup: sp.pickup, dropoff: sp.dropoff }} />
        </Reveal>

        <div className="mt-10">
          <Suspense fallback={<div className="skeleton h-24 rounded-2xl" />}>
            <FleetFilters counts={counts} total={all.length} />
          </Suspense>
        </div>

        <p className="mt-6 text-sm text-text-muted" aria-live="polite">
          {t('results', { count: filtered.length })}
        </p>

        {filtered.length ? (
          <div className="mt-4 grid gap-5 pb-20 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((v, i) => (
              <VehicleCard key={v.id} vehicle={v} query={hasDates ? query : undefined} priority={i < 3} />
            ))}
          </div>
        ) : (
          <div className="card mt-4 mb-20 p-10 text-center text-text-2">{t('empty')}</div>
        )}
      </div>

      <JsonLd
        data={[
          webPageJsonLd({ url, name: tseo('title'), description: tseo('description'), locale }),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: t('title'),
            numberOfItems: filtered.length,
            itemListElement: filtered.map((v, i) => ({ '@type': 'ListItem', position: i + 1, name: `${v.brand} ${v.model}`, url: absoluteUrl(locale, { pathname: '/vehicules/[slug]', params: { slug: v.slug } }) })),
          },
        ]}
      />
    </div>
  );
}
