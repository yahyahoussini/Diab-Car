import { getTranslations } from 'next-intl/server';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import LeadForm from '@/components/site/LeadForm';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import { PhoneIcon, WhatsAppIcon } from '@/components/site/icons';
import { getSettings } from '@/lib/data';
import { formatPhone } from '@/lib/format';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.contact' });
  return localizedMetadata({ locale, href: '/contact', title: t('title'), description: t('description') });
}

export default async function ContactPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tf = await getTranslations({ locale, namespace: 'footer' });
  const tseo = await getTranslations({ locale, namespace: 'seo.contact' });
  const s = await getSettings();
  const url = absoluteUrl(locale, '/contact');
  const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(`${s.addressLine}, ${s.city}`)}&output=embed`;

  return (
    <>
      <PageHero crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('contact'), url }]} eyebrow={t('eyebrow')} title={t('title')} answer={t('intro')} />

      <section className="pb-24">
        <div className="container-x grid gap-8 lg:grid-cols-12">
          <Reveal className="space-y-5 lg:col-span-5">
            <div className="card p-6">
              <h2 className="font-display text-2xl text-text">{t('agency')}</h2>
              <address className="mt-3 not-italic text-text-2">
                {s.addressLine}
                <br />
                {s.postalCode} {s.city}, Maroc
              </address>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button href={s.googleMapsUrl} external variant="secondary" size="sm">
                  {t('map')}
                </Button>
              </div>
              <dl className="mt-6 space-y-3 text-sm">
                {s.phonePrimary ? (
                  <div className="flex items-center gap-3">
                    <PhoneIcon className="h-4 w-4 text-accent" />
                    <a href={`tel:${s.phonePrimary}`} className="font-latin-sans font-semibold text-text hover:text-accent">
                      <bdi>{formatPhone(s.phonePrimary)}</bdi>
                    </a>
                  </div>
                ) : null}
                {s.phoneLandline ? (
                  <div className="flex items-center gap-3">
                    <PhoneIcon className="h-4 w-4 text-accent" />
                    <a href={`tel:${s.phoneLandline}`} className="font-latin-sans text-text-2 hover:text-accent">
                      <bdi>{formatPhone(s.phoneLandline)}</bdi>
                    </a>
                  </div>
                ) : null}
                {s.whatsapp ? (
                  <div className="flex items-center gap-3">
                    <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
                    <a href={whatsappLink(s.whatsapp, genericMessage(locale))} target="_blank" rel="noopener noreferrer" className="font-latin-sans font-semibold text-text hover:text-accent">
                      <bdi>{formatPhone(s.whatsapp)}</bdi>
                    </a>
                  </div>
                ) : null}
                {s.email ? (
                  <div className="flex items-center gap-3">
                    <span className="text-accent">@</span>
                    <a href={`mailto:${s.email}`} className="font-latin-sans text-text-2 hover:text-accent">
                      {s.email}
                    </a>
                  </div>
                ) : null}
              </dl>
              <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted rtl:tracking-normal">{t('hours')}</h3>
              <ul className="mt-2 space-y-1 text-sm text-text-2">
                {(s.hours || []).map((h, i) => (
                  <li key={i}>
                    {h.days.map((d) => tf(`days.${d}`)).join(', ')} · <bdi className="tnum">{h.opens}–{h.closes}</bdi>
                  </li>
                ))}
                {s.airportService24h ? <li className="text-accent">{tf('hoursAirport')}</li> : null}
              </ul>
            </div>
            {/* Map facade: iframe is lazy and below the fold */}
            <div className="card overflow-hidden">
              <iframe title="Google Maps" src={mapsEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-72 w-full border-0 grayscale-[0.2] dark:invert-[0.9] dark:hue-rotate-180" allowFullScreen />
            </div>
          </Reveal>
          <Reveal className="lg:col-span-7">
            <LeadForm subject="Contact" title={t('form.title')} whatsapp={s.whatsapp} />
          </Reveal>
        </div>
      </section>
      <JsonLd data={webPageJsonLd({ url, name: tseo('title'), description: tseo('description'), locale })} />
    </>
  );
}
