import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Breadcrumbs from '@/components/site/Breadcrumbs';
import JsonLd from '@/components/site/JsonLd';
import VehicleCard, { SpecIcon } from '@/components/site/VehicleCard';
import VehicleQuote from '@/components/site/VehicleQuote';
import Badge from '@/components/ui/Badge';
import Reveal, { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { getSettings, getVehicleBySlug, listExtras, listLocations, listSeasons, listVehicles, t as pick, vehicleImage } from '@/lib/data';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, localizedMetadata, ogImageUrl, vehicleJsonLd } from '@/lib/seo';

export const revalidate = 300;

export async function generateStaticParams() {
  const vehicles = await listVehicles({ published: true });
  return vehicles.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const v = await getVehicleBySlug(slug);
  if (!v || !v.published) return {};
  const t = await getTranslations({ locale, namespace: 'seo.vehicle' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const name = `${v.brand} ${v.model}`;
  const price = formatMAD(v.pricePerDay, locale);
  return localizedMetadata({
    locale,
    href: { pathname: '/vehicules/[slug]', params: { slug } },
    title: t('title', { name, price }),
    description: t('description', { name, price, transmission: tc(`transmission.${v.transmission}`).toLowerCase(), seats: v.seats, deposit: formatMAD(v.deposit, locale), mileage: v.mileageLimit ? tc('kmPerDay', { km: v.mileageLimit }) : tc('unlimitedKm').toLowerCase() }),
    type: 'website',
    images: [{ url: ogImageUrl(locale, { title: `${name} ${v.year}`, subtitle: pick(v.description, locale), kicker: tc(`categories.${v.category}`), car: v.image, price: `${formatMAD(v.pricePerDay, 'en')} / ${locale === 'ar' ? 'يوم' : locale === 'en' ? 'day' : locale === 'es' ? 'día' : 'jour'}` }), width: 1200, height: 630, alt: name }],
  });
}

export default async function VehiclePage({ params, searchParams }) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const v = await getVehicleBySlug(slug);
  if (!v || !v.published) notFound();

  const [settings, seasons, extras, locations, all] = await Promise.all([getSettings(), listSeasons(), listExtras(), listLocations(), listVehicles({ published: true })]);
  const t = await getTranslations({ locale, namespace: 'vehicle' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tf = await getTranslations({ locale, namespace: 'fleet' });

  const name = `${v.brand} ${v.model}`;
  const url = absoluteUrl(locale, { pathname: '/vehicules/[slug]', params: { slug } });
  const similar = all.filter((x) => x.id !== v.id && (x.category === v.category || Math.abs(x.pricePerDay - v.pricePerDay) < v.pricePerDay * 0.35)).slice(0, 3);
  const mileage = v.mileageLimit ? tc('kmPerDay', { km: v.mileageLimit }) : tc('unlimitedKm');

  const specs = [
    { icon: 'year', label: t('year'), value: String(v.year) },
    { icon: 'gear', label: t('gearbox'), value: tc(`transmission.${v.transmission}`) },
    { icon: 'fuel', label: t('fuelType'), value: tc(`fuel.${v.fuel}`) },
    { icon: 'seats', label: t('seatsLabel'), value: String(v.seats) },
    { icon: 'doors', label: t('doorsLabel'), value: String(v.doors) },
    { icon: 'luggage', label: t('luggageLabel'), value: String(v.luggage) },
  ];

  return (
    <div className="pt-[calc(var(--header-h)+1.5rem)]">
      <div className="container-x">
        <Breadcrumbs items={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tf('title'), href: '/vehicules', url: absoluteUrl(locale, '/vehicules') }, { name, url }]} />

        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Reveal>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{tc(`categories.${v.category}`)}</Badge>
                {v.featured ? <Badge>{tc('featured')}</Badge> : null}
              </div>
              <h1 className="mt-3 text-display-2 text-text">
                {name} <span className="text-text-muted">{v.year}</span>
              </h1>
              <p className="mt-1 text-sm text-text-muted">{t('orSimilar')}</p>
            </Reveal>

            <Reveal className="bg-surface-1 relative mt-6 aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] border border-border" delay={0.1}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={vehicleImage(v)} alt={`${name} ${v.year}`} width={800} height={380} fetchPriority="high" decoding="async" className="absolute inset-x-10 bottom-8 top-12 h-[calc(100%-5rem)] w-[calc(100%-5rem)] object-contain drop-shadow-[0_40px_50px_rgba(0,0,0,0.4)]" />
            </Reveal>

            <Stagger className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {specs.map((s) => (
                <StaggerItem key={s.label} className="card p-3 text-center">
                  <SpecIcon name={s.icon} className="mx-auto h-5 w-5 text-accent" />
                  <div className="mt-1.5 text-[11px] uppercase tracking-[0.08em] text-text-muted rtl:tracking-normal">{s.label}</div>
                  <div className="text-sm font-semibold text-text">
                    <bdi>{s.value}</bdi>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal className="mt-10">
              <p className="text-lg leading-relaxed text-text-2">{pick(v.description, locale)}</p>
            </Reveal>

            <Reveal className="mt-10">
              <h2 className="font-display text-2xl text-text">{t('features')}</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {(v.features || []).map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[15px] text-text-2">
                    <SpecIcon name="check" className="h-4 w-4 text-success" />
                    {tc(`features.${f}`)}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="mt-10 grid gap-5 md:grid-cols-2">
              <div className="card p-6">
                <h2 className="font-display text-2xl text-text">{t('included')}</h2>
                <ul className="mt-4 space-y-2 text-[15px] text-text-2">
                  {[t('includedItems.insurance'), t('includedItems.mileage', { mileage }), t('includedItems.delivery'), t('includedItems.assistance'), t('includedItems.driver'), t('includedItems.taxes')].map((s) => (
                    <li key={s} className="flex gap-2.5">
                      <SpecIcon name="check" className="mt-1 h-4 w-4 shrink-0 text-success" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card p-6">
                <h2 className="font-display text-2xl text-text">{t('notIncluded')}</h2>
                <ul className="mt-4 space-y-2 text-[15px] text-text-2">
                  {[t('notIncludedItems.fuel'), t('notIncludedItems.tolls'), t('notIncludedItems.extras'), t('notIncludedItems.oneWay')].map((s) => (
                    <li key={s} className="flex gap-2.5">
                      <SpecIcon name="x" className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal className="mt-10 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/50 p-6">
              <h2 className="font-display text-2xl text-text">{t('conditions')}</h2>
              <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-[0.08em] text-text-muted rtl:tracking-normal">{tc('deposit')}</dt>
                  <dd className="font-semibold text-text">
                    <bdi className="tnum">{formatMAD(v.deposit, locale)}</bdi>
                    <span className="block text-xs font-normal text-text-2">{t('depositNote', { days: settings?.depositReleaseDays || 7 })}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.08em] text-text-muted rtl:tracking-normal">{t('minAgeLabel')}</dt>
                  <dd className="font-semibold text-text">{t('minAgeValue', { age: v.minAge || settings?.minAge || 21 })}</dd>
                  <dd className="text-xs text-text-2">{t('license', { years: settings?.minLicenseYears || 1 })}</dd>
                </div>
              </dl>
            </Reveal>
          </div>

          <aside className="lg:col-span-4">
            <VehicleQuote vehicle={v} seasons={seasons} extras={extras} settings={settings} locations={locations} initial={{ from: sp.from, ft: sp.ft, to: sp.to, tt: sp.tt, pickup: sp.pickup }} />
          </aside>
        </div>

        {similar.length ? (
          <section className="section-y">
            <h2 className="text-display-3 text-text">{t('similar')}</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((s) => (
                <VehicleCard key={s.id} vehicle={s} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <JsonLd data={vehicleJsonLd(v, locale, url)} />
    </div>
  );
}
