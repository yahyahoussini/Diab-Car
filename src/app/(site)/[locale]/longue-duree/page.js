import { getTranslations } from 'next-intl/server';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import LeadForm from '@/components/site/LeadForm';
import FaqAccordion from '@/components/site/FaqAccordion';
import Reveal, { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { Price } from '@/components/site/Price';
import { getSettings, listFaqs } from '@/lib/data';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, faqJsonLd, localizedMetadata, serviceJsonLd } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.longTerm' });
  return localizedMetadata({ locale, href: '/longue-duree', title: t('title'), description: t('description') });
}

export default async function LongTermPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'longTerm' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tseo = await getTranslations({ locale, namespace: 'seo.longTerm' });
  const [settings, faqs] = await Promise.all([getSettings(), listFaqs({ published: true })]);
  const monthly = settings.monthlyFrom || { economy: 6500, suv: 9500, premium: 19000 };
  const url = absoluteUrl(locale, '/longue-duree');
  const relevantFaqs = faqs.filter((f) => ['longterm', 'payment', 'insurance'].includes(f.category)).slice(0, 5);
  const months = [1, 3, 6, 12, 24];

  return (
    <>
      <PageHero
        crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('longTerm'), url }]}
        eyebrow={t('eyebrow')}
        title={t('title')}
        answer={t('answer', { price: formatMAD(monthly.economy, locale) })}
        image="suv"
      />

      <section className="section-y bg-surface-1/60">
        <div className="container-x">
          <Reveal>
            <h2 className="text-display-2 text-text">{t('tiers.title')}</h2>
          </Reveal>
          <Stagger className="mt-8 grid gap-4 md:grid-cols-3">
            {['economy', 'suv', 'premium'].map((k, i) => (
              <StaggerItem key={k} className={`card p-6 ${i === 1 ? 'border-accent/50 ring-1 ring-accent/30' : ''}`}>
                <div className="text-sm font-semibold text-text-muted">{t(`tiers.${k}`)}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-sm text-text-muted">{tc('fromPrice')}</span>
                </div>
                <Price amount={monthly[k]} className="font-display text-4xl text-text" suffix={t('tiers.perMonth')} eurClassName="block text-sm font-normal text-text-muted" />
                <ul className="mt-5 space-y-1.5 text-sm text-text-2">
                  {['1', '2', '3', '4'].map((b) => (
                    <li key={b}>· {t(`benefits.items.${b}.title`)}</li>
                  ))}
                </ul>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="mt-4 text-sm text-text-muted">{t('tiers.note')}</p>
        </div>
      </section>

      <section className="section-y">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <h2 className="text-display-2 text-text">{t('benefits.title')}</h2>
            </Reveal>
            <Stagger className="mt-8 space-y-6">
              {['1', '2', '3', '4'].map((k) => (
                <StaggerItem key={k} className="flex gap-4">
                  <span className="font-latin-display mt-1 text-2xl text-accent">0{k}</span>
                  <div>
                    <h3 className="font-sans text-lg font-semibold text-text">{t(`benefits.items.${k}.title`)}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-text-2">{t(`benefits.items.${k}.text`)}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
          <Reveal className="lg:col-span-7">
            <LeadForm
              subject="Devis longue durée"
              title={t('form.title')}
              whatsapp={settings?.whatsapp}
              fields={[
                { name: 'duration', label: t('form.duration'), options: months.map((m) => ({ value: String(m), label: t('form.months', { count: m }) })) },
                { name: 'category', label: t('form.category'), options: ['economy', 'sedan', 'suv', 'premium', 'van'].map((c) => ({ value: c, label: tc(`categories.${c}`) })) },
              ]}
            />
          </Reveal>
        </div>
      </section>

      <section className="section-y bg-surface-1/60">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <h2 className="text-display-2 text-text">{tn('faq')}</h2>
          </Reveal>
          <Reveal className="lg:col-span-8">
            <FaqAccordion faqs={relevantFaqs} locale={locale} name="lt-faq" />
          </Reveal>
        </div>
      </section>

      <JsonLd data={[serviceJsonLd({ name: t('title'), description: tseo('description'), url, locale, serviceType: 'Long-term car rental' }), faqJsonLd(relevantFaqs, locale)]} />
    </>
  );
}
