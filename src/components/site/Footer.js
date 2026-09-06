import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Logo from '@/components/site/Logo';
import LanguageSwitcher from '@/components/site/LanguageSwitcher';
import { formatPhone } from '@/lib/format';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

/* Canonical week order — settings.hours[].days may arrive in any order. */
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/* Column 1 — plan 4.10 "Navigation". Every href exists in src/i18n/routing.js. */
const NAVIGATION_LINKS = [
  { key: 'fleet', href: '/vehicules' },
  { key: 'airport', href: '/aeroport' },
  { key: 'faq', href: '/faq' },
  { key: 'contact', href: '/contact' },
  { key: 'about', href: '/a-propos' },
  { key: 'blog', href: '/blog' },
];

/* Column 2 — plan 4.10 "Services & lieux". Only routes that exist today; the
   neighbourhood / delivery pages (/quartier/[q], /livraison) join this column
   when prompt 13 lands them in routing.js. Nothing is invented here. */
const SERVICE_LINKS = [
  { key: 'longTerm', href: '/longue-duree' },
  { key: 'chauffeur', href: '/avec-chauffeur' },
  { key: 'book', href: '/reservation' },
];

const LINK_CLASS =
  'inline-block py-2 text-[15px] leading-6 text-text-2 transition-colors duration-[var(--dur-micro)] ease-[var(--ease-out)] hover:text-text';

/** Up-right arrow for links that leave the site. Mirrored in RTL (plan 4.12). */
function ExternalArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="ms-1.5 inline-block h-3 w-3 align-[-1px] rtl:-scale-x-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

/**
 * Collapse a set of weekday keys into consecutive runs, so
 * ['mon','tue','wed','thu','fri','sat'] reads "Lun – Sam" instead of six
 * comma-separated labels. Unknown keys are dropped rather than rendered.
 */
function dayLabel(days, t) {
  const indexes = WEEK.map((d, i) => (days.includes(d) ? i : -1)).filter((i) => i >= 0);
  if (!indexes.length) return '';
  const runs = [];
  for (const i of indexes) {
    const last = runs[runs.length - 1];
    if (last && i === last[last.length - 1] + 1) last.push(i);
    else runs.push([i]);
  }
  return runs
    .map((run) => {
      if (run.length >= 3) return `${t(`days.${WEEK[run[0]]}`)} – ${t(`days.${WEEK[run[run.length - 1]]}`)}`;
      return run.map((i) => t(`days.${WEEK[i]}`)).join(', ');
    })
    .join(' · ');
}

/**
 * Site footer — plan 4.10: dark editorial block, big wordmark, tagline, three
 * link columns (Navigation / Services & lieux / Contact), opening hours,
 * language row, legal row, "Site par BrandHub".
 *
 * The block is dark in BOTH themes: the `dark` class re-scopes the BLACKLINE
 * token set inside the element, so every colour still comes from a token and
 * red text / thin red lines automatically resolve to --red-signal (5.10:1),
 * never the fill-only --red (3.03:1 as text on near-black).
 *
 * Every field of `settings` is optional. A missing value hides its row — no
 * blank label, no dangling separator, no "undefined" (CLAUDE.md rule 11).
 *
 * @param {Object} props
 * @param {Object} [props.settings] Business settings (see src/lib/data/seed.js).
 */
export default async function Footer({ settings }) {
  const locale = await getLocale();
  const t = await getTranslations('footer');
  const tn = await getTranslations('nav');
  const s = settings || {};
  const year = new Date().getFullYear();

  const tagline = (typeof s.tagline === 'string' ? s.tagline : s.tagline?.[locale]) || '';

  /* ---- Contact ---------------------------------------------------- */
  const cityLine = [s.postalCode, s.city].filter(Boolean).join(' ');
  const addressLines = [s.addressLine, cityLine, (s.addressLine || s.city) ? t('country') : ''].filter(Boolean);

  const contactRows = [
    s.phoneLandline && {
      key: 'landline',
      label: t('labels.landline'),
      value: formatPhone(s.phoneLandline),
      href: `tel:${s.phoneLandline}`,
      isPhone: true,
    },
    s.phonePrimary && {
      key: 'mobile',
      label: t('labels.mobile'),
      value: formatPhone(s.phonePrimary),
      href: `tel:${s.phonePrimary}`,
      isPhone: true,
    },
    s.whatsapp && {
      key: 'whatsapp',
      label: t('labels.whatsapp'),
      value: formatPhone(s.whatsapp),
      href: whatsappLink(s.whatsapp, genericMessage(locale)),
      isPhone: true,
      external: true,
    },
    /* Fax is not dialable from a browser — shown, never linked. */
    s.fax && { key: 'fax', label: t('labels.fax'), value: formatPhone(s.fax), isPhone: true },
    s.email && { key: 'email', label: t('labels.email'), value: s.email, href: `mailto:${s.email}` },
  ].filter(Boolean);

  const hasContact = addressLines.length > 0 || contactRows.length > 0;

  /* ---- Hours ------------------------------------------------------ */
  const hours = (Array.isArray(s.hours) ? s.hours : []).filter((h) => h && Array.isArray(h.days) && h.days.length > 0);
  const airport24h = s.airportService24h === true;
  const hasHours = hours.length > 0 || airport24h;

  /* ---- Legal ------------------------------------------------------ */
  const legalName = s.legalName || s.name || '';
  const cndp = typeof s.cndpReceipt === 'string' ? s.cndpReceipt.trim() : '';
  const legalBits = [
    legalName ? t('copyright', { year: String(year), legalName }) : `© ${year}`,
    s.rc ? t('rc', { rc: s.rc }) : null,
    s.ice ? t('ice', { ice: s.ice }) : null,
    /* CNDP receipt is empty until the declaration is filed — the line simply
       does not exist rather than showing an empty number (CLAUDE.md rule 11). */
    cndp ? t('cndp', { n: cndp }) : null,
  ].filter(Boolean);

  const socials = [
    s.facebookUrl && { label: 'Facebook', href: s.facebookUrl },
    s.instagramUrl && { label: 'Instagram', href: s.instagramUrl },
    s.tiktokUrl && { label: 'TikTok', href: s.tiktokUrl },
  ].filter(Boolean);

  return (
    <footer className="dark relative mt-auto border-t border-border bg-bg text-text">
      <div className="container-x">
        {/* ---- Wordmark + three columns ---------------------------- */}
        <div className="grid gap-12 py-16 lg:grid-cols-12 lg:gap-10 lg:py-24">
          <div className="lg:col-span-4">
            <Link href="/" className="inline-block" data-testid="footer-wordmark">
              <Logo className="[&>span]:text-[clamp(2.5rem,8vw,5.5rem)] [&>span]:leading-[0.9]" />
            </Link>
            <span className="mt-6 block w-[120px]" aria-hidden="true">
              <span className="redline" data-active="true" />
            </span>
            {tagline ? <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-text-2">{tagline}</p> : null}
            {socials.length ? (
              <ul className="mt-8 flex flex-wrap gap-2">
                {socials.map((so) => (
                  <li key={so.label}>
                    <a
                      href={so.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-latin-sans inline-flex min-h-10 items-center rounded-[var(--radius-chip)] border border-border px-4 text-xs font-semibold text-text-2 transition-colors duration-[var(--dur-micro)] hover:border-border-strong hover:text-text"
                    >
                      {so.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="group lg:col-span-2">
            <h2 id="footer-navigation" className="eyebrow">
              {t('navigation')}
            </h2>
            <span className="redline mt-3" aria-hidden="true" />
            <nav aria-labelledby="footer-navigation" className="mt-3">
              <ul>
                {NAVIGATION_LINKS.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className={LINK_CLASS}>
                      {tn(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="group lg:col-span-2">
            <h2 id="footer-services" className="eyebrow">
              {t('servicesPlaces')}
            </h2>
            <span className="redline mt-3" aria-hidden="true" />
            <nav aria-labelledby="footer-services" className="mt-3">
              <ul>
                {SERVICE_LINKS.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className={LINK_CLASS}>
                      {tn(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {hasContact ? (
            <div className="group lg:col-span-4">
              <h2 id="footer-contact" className="eyebrow">
                {t('contact')}
              </h2>
              <span className="redline mt-3" aria-hidden="true" />
              <address className="mt-5 not-italic">
                <dl className="space-y-4">
                  {addressLines.length ? (
                    <div>
                      <dt className="eyebrow">{t('labels.address')}</dt>
                      <dd className="mt-1.5 text-[15px] leading-relaxed text-text-2">
                        {s.googleMapsUrl ? (
                          <a
                            href={s.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block transition-colors duration-[var(--dur-micro)] hover:text-text"
                          >
                            {addressLines.map((line, i) => (
                              <span key={i} className="block">
                                {line}
                                {i === addressLines.length - 1 ? <ExternalArrow /> : null}
                              </span>
                            ))}
                          </a>
                        ) : (
                          addressLines.map((line, i) => (
                            <span key={i} className="block">
                              {line}
                            </span>
                          ))
                        )}
                      </dd>
                    </div>
                  ) : null}

                  {contactRows.map((row) => {
                    const value = row.isPhone ? (
                      <bdi className="tnum font-latin-sans">{row.value}</bdi>
                    ) : (
                      <span className="font-latin-sans break-all">{row.value}</span>
                    );
                    return (
                      <div key={row.key}>
                        <dt className="eyebrow">{row.label}</dt>
                        <dd className="mt-1.5 text-[15px] leading-6 text-text-2">
                          {row.href ? (
                            <a
                              href={row.href}
                              {...(row.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                              className="inline-flex min-h-11 items-center transition-colors duration-[var(--dur-micro)] hover:text-text"
                            >
                              {value}
                              {row.external ? <ExternalArrow /> : null}
                            </a>
                          ) : (
                            <span className="inline-flex min-h-11 items-center">{value}</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </address>
            </div>
          ) : null}
        </div>

        {/* ---- Hours + language ------------------------------------ */}
        <div className="grid gap-10 border-t border-border py-12 md:grid-cols-2">
          {hasHours ? (
            <section aria-labelledby="footer-hours">
              <h2 id="footer-hours" className="eyebrow">
                {t('hours')}
              </h2>
              <ul className="mt-4 space-y-2 text-[15px] leading-6">
                {hours.map((h, i) => {
                  const label = dayLabel(h.days, t);
                  if (!label) return null;
                  return (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="text-text">{label}</span>
                      {h.opens && h.closes ? (
                        <bdi className="tnum text-text-2">
                          {h.opens} {'–'} {h.closes}
                        </bdi>
                      ) : null}
                    </li>
                  );
                })}
                {airport24h ? (
                  <li className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-signal" aria-hidden="true" />
                    <span className="text-text">{t('hoursAirport')}</span>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="footer-language">
            <h2 id="footer-language" className="eyebrow">
              {t('language')}
            </h2>
            <LanguageSwitcher variant="list" className="mt-4 max-w-md [&_button]:min-h-12" />
          </section>
        </div>

        {/* ---- Legal row ------------------------------------------- */}
        <div className="border-t border-border py-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-10">
            <p data-testid="footer-legal" className="tnum max-w-xl text-xs leading-relaxed text-text-muted">
              {legalBits.map((bit, i) => (
                <span key={i}>
                  {i > 0 ? (
                    <span className="mx-2 text-text-muted" aria-hidden="true">
                      {'·'}
                    </span>
                  ) : null}
                  {bit}
                </span>
              ))}
            </p>
            <nav aria-label={t('legalLinks')} className="shrink-0">
              <ul className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                <li>
                  <Link
                    href="/conditions"
                    className="inline-block py-1.5 text-text-muted transition-colors duration-[var(--dur-micro)] hover:text-text"
                  >
                    {t('terms')}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/mentions-legales"
                    className="inline-block py-1.5 text-text-muted transition-colors duration-[var(--dur-micro)] hover:text-text"
                  >
                    {t('legal')}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/confidentialite"
                    className="inline-block py-1.5 text-text-muted transition-colors duration-[var(--dur-micro)] hover:text-text"
                  >
                    {t('privacy')}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <p className="mt-6 text-xs text-text-muted">
            <a
              href="https://brandhub.ma"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block py-1.5 transition-colors duration-[var(--dur-micro)] hover:text-text"
            >
              {t('madeBy')}
              <ExternalArrow />
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
