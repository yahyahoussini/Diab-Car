import { getTranslations } from 'next-intl/server';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import FaqAccordion from '@/components/site/FaqAccordion';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import { WhatsAppIcon } from '@/components/site/icons';
import { getSettings, listFaqs } from '@/lib/data';
import { absoluteUrl, faqJsonLd, localizedMetadata } from '@/lib/seo';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.faq' });
  return localizedMetadata({ locale, href: '/faq', title: t('title'), description: t('description') });
}

export default async function FaqPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'faqPage' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const [faqs, settings] = await Promise.all([listFaqs({ published: true }), getSettings()]);
  const url = absoluteUrl(locale, '/faq');
  const categories = [...new Set(faqs.map((f) => f.category || 'general'))];

  return (
    <>
      <PageHero crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('faq'), url }]} eyebrow={t('eyebrow')} title={t('title')} answer={t('intro')} />
      <section className="pb-24">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="space-y-10 lg:col-span-8">
            {categories.map((c) => (
              <Reveal key={c}>
                <h2 className="mb-4 font-display text-2xl text-text">{t(`categories.${c}`)}</h2>
                <FaqAccordion faqs={faqs.filter((f) => (f.category || 'general') === c)} locale={locale} name={`faq-${c}`} defaultOpen={-1} />
              </Reveal>
            ))}
          </div>
          <aside className="lg:col-span-4">
            <div className="card p-6 lg:sticky lg:top-[calc(var(--header-h)+1rem)]">
              <h2 className="font-display text-2xl text-text">{t('stillQuestions')}</h2>
              {settings?.whatsapp ? (
                <Button href={whatsappLink(settings.whatsapp, genericMessage(locale))} external variant="whatsapp" className="mt-4 w-full">
                  <WhatsAppIcon className="h-5 w-5" />
                  {t('askWhatsapp')}
                </Button>
              ) : null}
              <Button href="/contact" variant="secondary" className="mt-2 w-full">
                {tn('contact')}
              </Button>
            </div>
          </aside>
        </div>
      </section>
      <JsonLd data={faqJsonLd(faqs, locale)} />
    </>
  );
}
