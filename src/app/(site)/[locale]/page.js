import { getTranslations } from 'next-intl/server';
import Hero from '@/components/site/Hero';
import Divider from '@/components/ui/Divider';
import FleetSection from '@/components/site/home/FleetSection';
import AirportBanner from '@/components/site/home/AirportBanner';
import HowItWorks from '@/components/site/home/HowItWorks';
import Trust from '@/components/site/home/Trust';
import Reviews from '@/components/site/home/Reviews';
import DriveMorocco from '@/components/site/home/DriveMorocco';
import FaqSection from '@/components/site/home/FaqSection';
import CtaBand from '@/components/site/home/CtaBand';
import JsonLd from '@/components/site/JsonLd';
import { getSettings, listFaqs, listLocations, listReviews, listVehiclePhotos, listVehicles } from '@/lib/data';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';

export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.home' });
  const th = await getTranslations({ locale, namespace: 'home.hero' });
  return localizedMetadata({ locale, href: '/', title: t('title'), description: t('description'), ogTitle: `${th('title1')} ${th('title2')}`, ogKicker: th('eyebrow') });
}

/**
 * The homepage, in the conversion order of plan 4.3:
 *   hero + module · purpose tiles · fleet · airport · how it works ·
 *   trust · reviews · Drive Morocco · FAQ · CTA · footer
 *
 * The road divider (plan 2.4) separates the sections; it replaced the brand
 * marquee, which section 10 marked for deletion.
 *
 * Sections render nothing when they have nothing honest to show — Trust
 * suppresses itself below two verified facts, Reviews below one usable review
 * (CLAUDE.md rule 11) — so the page never carries an empty shell.
 */
export default async function HomePage({ params }) {
  const { locale } = await params;
  /* `vehicle_photos` has a public read policy, so this extra read costs the
     page nothing it cannot cache — and it is what lets a photo swapped in the
     admin reach the fleet block with no deploy (plan 7.1). Read once here,
     grouped once inside FleetSection. */
  const [settings, vehicles, locations, faqs, reviews, vehiclePhotos] = await Promise.all([
    getSettings(),
    listVehicles({ published: true }),
    listLocations(),
    listFaqs({ published: true }),
    listReviews({ published: true }),
    listVehiclePhotos({}),
  ]);
  const t = await getTranslations({ locale, namespace: 'seo.home' });

  return (
    <>
      <Hero settings={settings} locations={locations} fleetCount={vehicles.length} />
      <Divider />
      <FleetSection vehicles={vehicles} photos={vehiclePhotos} />
      <Divider />
      <AirportBanner settings={settings} />
      <Divider />
      <HowItWorks />
      <Divider />
      <Trust settings={settings} />
      <Divider />
      <Reviews reviews={reviews} settings={settings} />
      <Divider />
      <DriveMorocco />
      <Divider />
      <FaqSection faqs={faqs} />
      <CtaBand settings={settings} />
      <JsonLd data={webPageJsonLd({ url: absoluteUrl(locale, '/'), name: t('title'), description: t('description'), locale })} />
    </>
  );
}
