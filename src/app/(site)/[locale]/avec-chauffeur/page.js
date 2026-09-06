import { getTranslations } from 'next-intl/server';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import LeadForm from '@/components/site/LeadForm';
import Reveal, { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { CtaBand } from '@/components/site/HomeSections';
import { getSettings, listExtras } from '@/lib/data';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, localizedMetadata, serviceJsonLd } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.chauffeur' });
  return localizedMetadata({ locale, href: '/avec-chauffeur', title: t('title'), description: t('description') });
}

export default async function ChauffeurPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'chauffeur' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tseo = await getTranslations({ locale, namespace: 'seo.chauffeur' });
  const [settings, extras] = await Promise.all([getSettings(), listExtras()]);
  const dayPrice = extras.find((x) => x.key === 'chauffeur')?.price || 400;
  const url = absoluteUrl(locale, '/avec-chauffeur');
  const pricing = [
    { k: 'day', v: dayPrice },
    { k: 'halfDay', v: Math.round(dayPrice * 0.6) },
    { k: 'transfer', v: 350 },
  ];

  return (
    <>
      <PageHero
        crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('chauffeur'), url }]}
        eyebrow={t('eyebrow')}
        title={t('title')}
        answer={t('answer', { price: formatMAD(dayPrice, locale) })}
        image="coupe"
      />

      <section className="section-y bg-surface-1/60">
        <div className="container-x">
          <Reveal>
            <h2 className="text-display-2 text-text">{t('uses.title')}</h2>
          </Reveal>
          <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['transfer', 'business', 'wedding', 'tours'].map((k) => (
              <StaggerItem key={k} className="card p-6">
                <h3 className="font-sans text-lg font-semibold text-text">{t(`uses.items.${k}.title`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-2">{t(`uses.items.${k}.text`)}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section-y">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <h2 className="text-display-2 text-text">{t('pricing.title')}</h2>
              <dl className="mt-6 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface-1">
                {pricing.map((p) => (
                  <div key={p.k} className="flex items-center justify-between px-5 py-4">
                    <dt className="text-text-2">{t(`pricing.${p.k}`)}</dt>
                    <dd className="font-display text-xl text-text">
                      <bdi className="tnum">{formatMAD(p.v, locale)}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-text-muted">{t('pricing.note')}</p>
            </Reveal>
          </div>
          <Reveal className="lg:col-span-7">
            <LeadForm subject="Demande chauffeur" title={t('cta')} whatsapp={settings?.whatsapp} fields={[{ name: 'need', label: t('uses.title'), options: ['transfer', 'business', 'wedding', 'tours'].map((k) => ({ value: k, label: t(`uses.items.${k}.title`) })) }]} />
          </Reveal>
        </div>
      </section>

      <CtaBand settings={settings} />
      <JsonLd data={serviceJsonLd({ name: t('title'), description: tseo('description'), url, locale, serviceType: 'Chauffeur service', priceFrom: dayPrice })} />
    </>
  );
}
