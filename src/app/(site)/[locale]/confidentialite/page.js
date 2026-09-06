import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/site/LegalPage';
import { getSettings } from '@/lib/data';
import { absoluteUrl, localizedMetadata } from '@/lib/seo';

export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.privacy' });
  return localizedMetadata({ locale, href: '/confidentialite', title: t('title') });
}

export default async function PrivacyPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tf = await getTranslations({ locale, namespace: 'footer' });
  const s = await getSettings();
  const sections = ['1', '2', '3', '4', '5', '6'].map((k) => ({ title: t(`sections.${k}.title`), text: t(`sections.${k}.text`, { email: s.email }) }));
  return (
    <LegalPage crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tf('privacy'), url: absoluteUrl(locale, '/confidentialite') }]} title={t('title')} sections={sections}>
      <p>{t('intro')}</p>
    </LegalPage>
  );
}
