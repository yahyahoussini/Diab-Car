import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/site/LegalPage';
import { getSettings } from '@/lib/data';
import { absoluteUrl, localizedMetadata } from '@/lib/seo';

export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.terms' });
  return localizedMetadata({ locale, href: '/conditions', title: t('title') });
}

export default async function TermsPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tf = await getTranslations({ locale, namespace: 'footer' });
  const s = await getSettings();
  const sections = Array.from({ length: 10 }, (_, i) => String(i + 1)).map((k) => ({ title: t(`sections.${k}.title`), text: t(`sections.${k}.text`, { legalName: s.legalName }) }));
  return <LegalPage crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tf('terms'), url: absoluteUrl(locale, '/conditions') }]} title={t('title')} subtitle={t('updated')} sections={sections} />;
}
