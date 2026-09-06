import { getTranslations } from 'next-intl/server';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import Reveal, { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { CtaBand } from '@/components/site/HomeSections';
import { CheckIcon } from '@/components/site/icons';
import { getSettings } from '@/lib/data';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.about' });
  return localizedMetadata({ locale, href: '/a-propos', title: t('title'), description: t('description') });
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tseo = await getTranslations({ locale, namespace: 'seo.about' });
  const s = await getSettings();
  const url = absoluteUrl(locale, '/a-propos');

  return (
    <>
      <PageHero crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('about'), url }]} eyebrow={t('eyebrow')} title={t('title')} answer={t('intro', { year: s.foundedYear || 2013 })} image="coupe" />

      <section className="section-y bg-surface-1/60">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <h2 className="text-display-2 text-text">{t('story.title')}</h2>
          </Reveal>
          <Reveal className="space-y-5 text-lg leading-relaxed text-text-2 lg:col-span-7">
            <p>{t('story.p1')}</p>
            <p>{t('story.p2')}</p>
            <p>{t('story.p3')}</p>
          </Reveal>
        </div>
      </section>

      <section className="section-y">
        <div className="container-x">
          <Reveal>
            <h2 className="text-display-2 text-text">{t('values.title')}</h2>
          </Reveal>
          <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['1', '2', '3', '4'].map((k) => (
              <StaggerItem key={k} className="card p-6">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <CheckIcon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-sans text-lg font-semibold text-text">{t(`values.items.${k}.title`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-2">{t(`values.items.${k}.text`)}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section-y bg-surface-1/60">
        <div className="container-x">
          <Reveal className="card p-6 md:p-8">
            <h2 className="font-display text-2xl text-text">{t('legalTitle')}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-text-2">{t('legalText', { legalName: s.legalName, capital: formatMAD(s.capitalMad, locale), rc: s.rc, ice: s.ice })}</p>
          </Reveal>
        </div>
      </section>

      <CtaBand settings={s} />
      <JsonLd data={webPageJsonLd({ url, name: tseo('title'), description: tseo('description'), locale })} />
    </>
  );
}
