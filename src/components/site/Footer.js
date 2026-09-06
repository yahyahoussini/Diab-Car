import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Logo from '@/components/site/Logo';
import { formatMAD, formatPhone } from '@/lib/format';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

const NAV = [
  { key: 'fleet', href: '/vehicules' },
  { key: 'blog', href: '/blog' },
  { key: 'faq', href: '/faq' },
  { key: 'about', href: '/a-propos' },
  { key: 'contact', href: '/contact' },
];
const SERVICES = [
  { key: 'airport', href: '/aeroport' },
  { key: 'longTerm', href: '/longue-duree' },
  { key: 'chauffeur', href: '/avec-chauffeur' },
  { key: 'book', href: '/reservation' },
];

export default async function Footer({ settings }) {
  const locale = await getLocale();
  const t = await getTranslations('footer');
  const tn = await getTranslations('nav');
  const s = settings || {};
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-auto border-t border-border bg-surface-1">
      <div className="pointer-events-none absolute inset-0 zellige" aria-hidden="true" />
      <div className="container-x relative">
        <div className="grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link href="/">
              <Logo />
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-text-2">{t('about', { year: s.foundedYear || 2013 })}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[s.facebookUrl && { label: 'Facebook', href: s.facebookUrl }, s.instagramUrl && { label: 'Instagram', href: s.instagramUrl }, s.tiktokUrl && { label: 'TikTok', href: s.tiktokUrl }]
                .filter(Boolean)
                .map((so) => (
                  <a key={so.label} href={so.href} target="_blank" rel="noopener noreferrer" className="font-latin-sans rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-2 transition-colors hover:border-accent hover:text-accent">
                    {so.label}
                  </a>
                ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-text-muted rtl:tracking-normal">{t('navigation')}</h3>
            <ul className="mt-4 space-y-2.5">
              {NAV.map((n) => (
                <li key={n.key}>
                  <Link href={n.href} className="text-sm text-text-2 transition-colors hover:text-accent">
                    {tn(n.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-text-muted rtl:tracking-normal">{t('services')}</h3>
            <ul className="mt-4 space-y-2.5">
              {SERVICES.map((n) => (
                <li key={n.key}>
                  <Link href={n.href} className="text-sm text-text-2 transition-colors hover:text-accent">
                    {tn(n.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-4">
            <h3 className="font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-text-muted rtl:tracking-normal">{t('contact')}</h3>
            <address className="mt-4 space-y-2.5 text-sm not-italic text-text-2">
              <p>
                {s.addressLine}
                <br />
                {s.postalCode} {s.city}, Maroc
              </p>
              {s.phonePrimary ? (
                <p>
                  <a href={`tel:${s.phonePrimary}`} className="font-latin-sans transition-colors hover:text-accent">
                    <bdi>{formatPhone(s.phonePrimary)}</bdi>
                  </a>
                </p>
              ) : null}
              {s.whatsapp ? (
                <p>
                  <a href={whatsappLink(s.whatsapp, genericMessage(locale))} target="_blank" rel="noopener noreferrer" className="font-latin-sans transition-colors hover:text-accent">
                    WhatsApp · <bdi>{formatPhone(s.whatsapp)}</bdi>
                  </a>
                </p>
              ) : null}
              {s.email ? (
                <p>
                  <a href={`mailto:${s.email}`} className="font-latin-sans transition-colors hover:text-accent">
                    {s.email}
                  </a>
                </p>
              ) : null}
            </address>
            <h3 className="mt-6 font-sans text-[13px] font-semibold uppercase tracking-[0.14em] text-text-muted rtl:tracking-normal">{t('hours')}</h3>
            <ul className="mt-3 space-y-1 text-sm text-text-2">
              {(s.hours || []).map((h, i) => (
                <li key={i}>
                  {h.days.map((d) => t(`days.${d}`)).join(', ')} · <bdi className="tnum">{h.opens}–{h.closes}</bdi>
                </li>
              ))}
              {s.airportService24h ? <li className="text-accent">{t('hoursAirport')}</li> : null}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border py-6 text-xs text-text-muted md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p>{t('rights', { year, name: s.name || 'Diab Car' })}</p>
            {s.rc ? <p className="font-latin-sans">{t('legalLine', { legalName: s.legalName, rc: s.rc, ice: s.ice, capital: formatMAD(s.capitalMad, locale) })}</p> : null}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/conditions" className="transition-colors hover:text-accent">
              {t('terms')}
            </Link>
            <Link href="/mentions-legales" className="transition-colors hover:text-accent">
              {t('legal')}
            </Link>
            <Link href="/confidentialite" className="transition-colors hover:text-accent">
              {t('privacy')}
            </Link>
            <a href="https://brandhub.ma" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-accent">
              {t('madeBy')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
