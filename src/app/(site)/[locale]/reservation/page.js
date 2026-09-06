import { getTranslations } from 'next-intl/server';
import BookingForm from '@/components/site/BookingForm';
import Breadcrumbs from '@/components/site/Breadcrumbs';
import { getSettings, listExtras, listLocations, listSeasons, listVehicles, vehicleImage } from '@/lib/data';
import { absoluteUrl, localizedMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.booking' });
  return localizedMetadata({ locale, href: '/reservation', title: t('title'), description: t('description') });
}

export default async function BookingPage({ params, searchParams }) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'booking' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const [vehicles, locations, extras, seasons, settings] = await Promise.all([listVehicles({ published: true }), listLocations(), listExtras(), listSeasons(), getSettings()]);

  // Only serialisable, minimal vehicle data reaches the client.
  const slim = vehicles.map((v) => ({ slug: v.slug, brand: v.brand, model: v.model, year: v.year, category: v.category, pricePerDay: v.pricePerDay, deposit: v.deposit, minAge: v.minAge, imageUrl: vehicleImage(v) }));

  return (
    <div className="pt-[calc(var(--header-h)+1.5rem)] pb-20">
      <div className="container-x">
        <Breadcrumbs items={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: t('title'), url: absoluteUrl(locale, '/reservation') }]} />
        <div className="mt-6 max-w-3xl">
          <h1 className="text-display-2 text-text">{t('title')}</h1>
          <p className="mt-3 text-lg text-text-2">{t('subtitle')}</p>
        </div>
        <div className="mt-8">
          <BookingForm vehicles={slim} locations={locations} extras={extras} seasons={seasons} settings={{ pricingTiers: settings.pricingTiers, airportDeliveryFee: settings.airportDeliveryFee, cityDeliveryFee: settings.cityDeliveryFee, oneWayFee: settings.oneWayFee, minAge: settings.minAge, depositReleaseDays: settings.depositReleaseDays }} initial={{ vehicle: sp.vehicle, from: sp.from, ft: sp.ft, to: sp.to, tt: sp.tt, pickup: sp.pickup, dropoff: sp.dropoff, extras: sp.extras }} />
        </div>
      </div>
    </div>
  );
}
