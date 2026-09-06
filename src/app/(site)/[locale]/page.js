import { getTranslations } from 'next-intl/server';
import Hero from '@/components/site/Hero';
import Marquee from '@/components/site/Marquee';
import { AirportBanner, BlogTeasers, Categories, CtaBand, FaqSection, FeaturedFleet, PricingTable, Reviews, Steps, WhyUs } from '@/components/site/HomeSections';
import JsonLd from '@/components/site/JsonLd';
import { getSettings, listFaqs, listLocations, listPosts, listReviews, listVehicles } from '@/lib/data';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';

export const revalidate = 300;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.home' });
  const th = await getTranslations({ locale, namespace: 'home.hero' });
  return localizedMetadata({ locale, href: '/', title: t('title'), description: t('description'), ogTitle: `${th('title1')} ${th('title2')}`, ogKicker: th('eyebrow') });
}

export default async function HomePage({ params }) {
  const { locale } = await params;
  const [settings, vehicles, locations, faqs, posts, reviews] = await Promise.all([
    getSettings(),
    listVehicles({ published: true }),
    listLocations(),
    listFaqs({ published: true }),
    listPosts({ published: true }),
    listReviews({ published: true }),
  ]);
  const t = await getTranslations({ locale, namespace: 'seo.home' });

  return (
    <>
      <Hero settings={settings} locations={locations} fleetCount={vehicles.length} />
      <Marquee className="mt-16" />
      <Categories vehicles={vehicles} />
      <FeaturedFleet vehicles={vehicles} />
      <WhyUs />
      <PricingTable vehicles={vehicles} />
      <AirportBanner />
      <Steps />
      <Reviews reviews={reviews} settings={settings} />
      <FaqSection faqs={faqs} />
      <BlogTeasers posts={posts} />
      <CtaBand settings={settings} />
      <JsonLd data={webPageJsonLd({ url: absoluteUrl(locale, '/'), name: t('title'), description: t('description'), locale })} />
    </>
  );
}
