import { getTranslations } from 'next-intl/server';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import FaqAccordion from '@/components/site/FaqAccordion';
import VehicleCard from '@/components/site/VehicleCard';
import { CtaBand } from '@/components/site/HomeSections';
import Button from '@/components/ui/Button';
import Reveal, { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { ArrowIcon } from '@/components/site/icons';
import { getSettings, listFaqs, listVehiclePhotos, listVehicles } from '@/lib/data';
import { photosByVehicle, photosFor } from '@/components/site/vehiclePhotos';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, faqJsonLd, localizedMetadata, serviceJsonLd } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.airport' });
  return localizedMetadata({ locale, href: '/aeroport', title: t('title'), description: t('description') });
}

export default async function AirportPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'airport' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tseo = await getTranslations({ locale, namespace: 'seo.airport' });
  const [settings, vehicles, faqs, photoRows] = await Promise.all([getSettings(), listVehicles({ published: true }), listFaqs({ published: true }), listVehiclePhotos({})]);
  /* One read for the page, then a lookup per card — never a query inside the
     map (plan 7.1). */
  const byVehicle = photosByVehicle(photoRows);
  const minPrice = Math.min(...vehicles.map((v) => v.pricePerDay));
  const url = absoluteUrl(locale, '/aeroport');
  const airportFaqs = faqs.filter((f) => ['delivery', 'conditions', 'payment'].includes(f.category)).slice(0, 6);

  return (
    <>
      <PageHero
        crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('airport'), url }]}
        eyebrow={t('eyebrow')}
        title={t('title')}
        answer={t('answer', { price: formatMAD(minPrice, locale) })}
        image="berline"
      >
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href={{ pathname: '/vehicules', query: { pickup: 'aeroport-mohammed-v' } }} size="lg">
            {t('cta')}
            <ArrowIcon />
          </Button>
        </div>
      </PageHero>

      <section className="section-y bg-surface-1/60">
        <div className="container-x">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['distance', 'time', 'toll', 'hours'].map((k) => (
              <StaggerItem key={k} className="card p-6">
                <div className="font-display text-3xl text-accent">
                  <bdi>{t(`facts.${k}.value`)}</bdi>
                </div>
                <div className="mt-1 text-sm text-text-2">{t(`facts.${k}.label`)}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section-y">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <p className="eyebrow mb-3">{t('eyebrow')}</p>
            <h2 className="text-display-2 text-text">{t('how.title')}</h2>
          </Reveal>
          <Stagger className="grid gap-4 lg:col-span-8 sm:grid-cols-2">
            {['1', '2', '3', '4'].map((k) => (
              <StaggerItem key={k} className="card p-6">
                <span className="font-latin-display text-4xl text-accent/40">0{k}</span>
                <h3 className="mt-3 font-sans text-lg font-semibold text-text">{t(`how.steps.${k}.title`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-2">{t(`how.steps.${k}.text`)}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section-y bg-surface-1/60">
        <div className="container-x">
          <h2 className="text-display-3 text-text">{tn('fleet')}</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.filter((v) => v.featured).slice(0, 3).map((v) => (
              <VehicleCard key={v.id} vehicle={v} photos={photosFor(byVehicle, v)} query={{ pickup: 'airport' }} />
            ))}
          </div>
        </div>
      </section>

      <section className="section-y">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <h2 className="text-display-2 text-text">{t('faqTitle')}</h2>
          </Reveal>
          <Reveal className="lg:col-span-8">
            <FaqAccordion faqs={airportFaqs} locale={locale} name="airport-faq" />
          </Reveal>
        </div>
      </section>

      <CtaBand settings={settings} />
      <JsonLd data={[serviceJsonLd({ name: t('title'), description: tseo('description'), url, locale, serviceType: 'Airport car rental delivery', priceFrom: minPrice, areaServed: [{ '@type': 'Airport', name: 'Casablanca Mohammed V International Airport', iataCode: 'CMN' }, { '@type': 'City', name: 'Casablanca' }] }), faqJsonLd(airportFaqs, locale)]} />
    </>
  );
}
