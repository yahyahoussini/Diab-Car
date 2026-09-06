import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/site/LegalPage';
import { getSettings } from '@/lib/data';
import { formatMAD, formatPhone } from '@/lib/format';
import { absoluteUrl, localizedMetadata } from '@/lib/seo';

export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.notice' });
  return localizedMetadata({ locale, href: '/mentions-legales', title: t('title') });
}

export default async function NoticePage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.notice' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tf = await getTranslations({ locale, namespace: 'footer' });
  const s = await getSettings();
  const sections = [
    { title: t('editor'), text: t('editorText', { legalName: s.legalName, capital: formatMAD(s.capitalMad, locale), rc: s.rc, ice: s.ice, address: s.addressLine, city: s.city, phone: formatPhone(s.phonePrimary), email: s.email }) },
    { title: t('activity'), text: t('activityText') },
    { title: t('hosting'), text: t('hostingText') },
    { title: t('ip'), text: t('ipText', { legalName: s.legalName }) },
    { title: t('credits'), text: t('creditsText') },
  ];
  return <LegalPage crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tf('legal'), url: absoluteUrl(locale, '/mentions-legales') }]} title={t('title')} sections={sections} />;
}
