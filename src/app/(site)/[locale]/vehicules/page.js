import { getTranslations } from 'next-intl/server';
import Breadcrumbs from '@/components/site/Breadcrumbs';
import VehicleCard from '@/components/site/VehicleCard';
import { carShot } from '@/components/site/CarImage';
import JsonLd from '@/components/site/JsonLd';
import ResultsClient from '@/components/site/results/ResultsClient';
import { photosByVehicle, photosFor, uploadedAlt } from '@/components/site/vehiclePhotos';
import { getSettings, listLocations, listVehiclePhotos, listVehicles } from '@/lib/data';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';
import { whatsappLink } from '@/lib/whatsapp';

/**
 * The fleet page, which is also the results page (plan 4.4).
 *
 * One URL, two jobs. Bare, it is a static, indexable catalogue of the whole
 * fleet — that is the page Google keeps. With `?from&to`, it becomes a live
 * availability view, and the parametrised form is `noindex` so those thousands
 * of date permutations never compete with the canonical page (CLAUDE.md rule 8:
 * one URL = one intent).
 *
 * The server always renders the full fleet. The island hides it once dates
 * arrive, so the markup a crawler and a JavaScript-less visitor receive is
 * complete either way, and ISR still has something worth caching.
 */

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.fleet' });

  /* No searchParams here, deliberately. Touching them — even only to decide a
     robots value — opts the entire route out of static rendering, and this is
     the public page that most wants ISR. The bare URL is indexable and
     canonical to itself; parametrised URLs get `X-Robots-Tag: noindex, follow`
     from src/proxy.js, which Google honours identically and which works on a
     cached response. */
  return localizedMetadata({ locale, href: '/vehicules', title: t('title'), description: t('description') });
}

export default async function FleetPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fleet' });
  const tr = await getTranslations({ locale, namespace: 'results' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tseo = await getTranslations({ locale, namespace: 'seo.fleet' });

  const [all, locations, settings, photoRows] = await Promise.all([
    listVehicles({ published: true }),
    listLocations(),
    getSettings(),
    /* Public-read table, no cookies, no searchParams: the page stays static
       and an admin-uploaded photo still reaches it (plan 7.1). One read for
       the whole grid — a query per card would be a query per card. */
    listVehiclePhotos({}),
  ]);
  const byVehicle = photosByVehicle(photoRows);

  const minPrice = all.length ? Math.min(...all.map((v) => v.pricePerDay)) : 0;
  const url = absoluteUrl(locale, '/vehicules');

  /* A compact photo record per vehicle — base path, widths, formats and
     intrinsic size. The island cannot import the manifest itself: it is a
     client component, and the manifest carries a blur data-URI for every angle
     of every car.

     `src` and `formats` travel with the record because an uploaded photo is
     not where the manifest would put it and has no AVIF variant (the admin
     encodes WebP + JPEG in the browser), so the card can no longer rebuild
     either from the slug. `alt` only when the operator wrote one (rule 8). */
  const photos = {};
  for (const v of all) {
    const rows = photosFor(byVehicle, v);
    const shot = carShot(v, 'front', rows);
    if (!shot) continue;
    const alt = uploadedAlt(rows, 'front', locale);
    photos[v.photoFolder || v.slug] = {
      src: shot.src,
      widths: shot.widths,
      formats: shot.formats,
      width: shot.width,
      height: shot.height,
      ...(alt ? { alt } : {}),
    };
  }

  /* The plain rows the island falls back to before any dates are chosen. */
  const rows = all.map((v) => ({
    slug: v.slug,
    brand: v.brand,
    model: v.model,
    category: v.category,
    transmission: v.transmission,
    fuel: v.fuel,
    seats: v.seats,
    ac: v.ac,
    photoFolder: v.photoFolder || v.slug,
    basePerDay: v.pricePerDay,
    popularityScore: v.popularityScore || 0,
  }));

  const labels = {
    modify: tr('modify'),
    modifyTitle: tr('modifyTitle'),
    days: tr.raw('days'),
    carsReady: tr('carsReady'),
    noDatesEyebrow: tr('noDatesEyebrow'),
    noDatesTitle: tr('noDatesTitle'),
    checking: tr('checking'),
    errorLine: tr('errorLine'),
    showMore: tr.raw('showMore'),
    unavailableGroup: tr.raw('unavailableGroup'),
    continue: tr('continue'),
    agency: tr('agency'),
    liveOn: tr('liveOn'),
    emptyTitle: tr('emptyTitle'),
    emptyBody: tr('emptyBody'),
    emptyModify: tr('emptyModify'),
    emptyPlace: tr('emptyPlace'),
    emptyWhatsapp: tr('emptyWhatsapp'),
    card: {
      perDay: tr('card.perDay'),
      totalForDays: tr.raw('card.totalForDays'),
      fromPrice: tr.raw('card.fromPrice'),
      see: tr('card.see'),
      select: tr.raw('card.select'),
      available: tr('card.available'),
      lastOne: tr('card.lastOne'),
      unavailable: tr('card.unavailable'),
      nextAvailable: tr.raw('card.nextAvailable'),
      seats: tr.raw('card.seats'),
      transmission_automatic: tc('transmission.automatic'),
      transmission_manual: tc('transmission.manual'),
      fuel_petrol: tc('fuel.petrol'),
      fuel_diesel: tc('fuel.diesel'),
      fuel_hybrid: tc('fuel.hybrid'),
      fuel_electric: tc('fuel.electric'),
    },
    filters: {
      all: t('all'),
      moreFilters: tr('moreFilters'),
      reset: t('reset'),
      remove: tr('remove'),
      close: tc('close'),
      sort: t('sort'),
      any: tr('any'),
      anyPrice: tr('anyPrice'),
      maxPriceLabel: tr('maxPriceLabel'),
      comfort: tr('comfort'),
      ac: tr('ac'),
      automatic: tc('transmission.automatic'),
      sevenSeats: tr('sevenSeats'),
      seats: t('seats'),
      seatsMin: tr.raw('seatsMin'),
      transmission: t('transmission'),
      fuel: t('fuel'),
      transmission_automatic: tc('transmission.automatic'),
      transmission_manual: tc('transmission.manual'),
      fuel_petrol: tc('fuel.petrol'),
      fuel_diesel: tc('fuel.diesel'),
      fuel_hybrid: tc('fuel.hybrid'),
      categories: Object.fromEntries(['economy', 'compact', 'sedan', 'suv', 'premium', 'luxury', 'van'].map((c) => [c, tc(`categories.${c}`)])),
      sortOptions: {
        recommended: t('sortOptions.recommended'),
        price_asc: t('sortOptions.price_asc'),
        price_desc: t('sortOptions.price_desc'),
        premium: tr('sortPremium'),
      },
    },
  };

  /* The WhatsApp escape hatch on the empty state carries the searched dates
     and place so staff can answer with a real proposal instead of "which
     dates?" (plan 4.4). Built on the CLIENT from the live search state — the
     server no longer sees the parameters, and the message should reflect what
     the user is looking at now, not whatever the URL said on first load. */
  const whatsapp = settings?.whatsapp
    ? { base: whatsappLink(settings.whatsapp, ''), template: tr.raw('whatsappMessage') }
    : null;

  return (
    <div className="pt-[calc(var(--header-h)+1.5rem)]">
      <div className="container-x">
        <Breadcrumbs items={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: t('title'), url }]} />

        {/* Answer-first block: kept for AI engines and featured snippets, and
            it is the one piece of copy that must survive in the static HTML. */}
        <p className="mt-6 max-w-3xl text-lg text-text-2">{t('intro')}</p>
        <p className="mt-4 max-w-3xl border-s-2 border-red-signal ps-4 text-[15px] leading-relaxed text-text">
          {t('answer', { price: formatMAD(minPrice, locale) })}
        </p>

        <div className="mt-10">
          <ResultsClient
            vehicles={rows}
            photos={photos}
            locations={locations}
            labels={labels}
            locale={locale}
            whatsapp={whatsapp}
          >
            {/* Server-rendered fleet: the indexable content, and what a visitor
                without JavaScript keeps. */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {all.map((v, i) => (
                <div key={v.id} data-vehicle="" data-slug={v.slug}>
                  <VehicleCard vehicle={v} photos={photosFor(byVehicle, v)} fleet={all} priority={i < 3} className="h-full" />
                </div>
              ))}
            </div>
          </ResultsClient>
        </div>
      </div>

      <JsonLd
        data={[
          webPageJsonLd({ url, name: tseo('title'), description: tseo('description'), locale }),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: t('title'),
            numberOfItems: all.length,
            itemListElement: all.map((v, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: `${v.brand} ${v.model}`,
              url: absoluteUrl(locale, { pathname: '/vehicules/[slug]', params: { slug: v.slug } }),
            })),
          },
        ]}
      />
    </div>
  );
}
