import ReactDOM from 'react-dom';
import { getLocale, getTranslations } from 'next-intl/server';
import HeroTitle, { FadeIn } from '@/components/site/HeroTitle';
import BookingWidget from '@/components/site/BookingWidget';

/* ------------------------------------------------------------------ */
/* The LCP asset                                                       */
/*                                                                     */
/* Today this is the neutral silhouette placeholder (plan 2.5: "until   */
/* real photos exist, neutral silhouettes on the correct backgrounds"); */
/* the real front-¾ photography is section 12 input #4. When it lands,  */
/* swap the three constants below — nothing else in this file changes.  */
/*                                                                     */
/* A plain <img>, not next/image. next.config.mjs has no                */
/* `dangerouslyAllowSVG`, so next/image serves this .svg unoptimized     */
/* anyway — it would add client runtime for zero benefit. More important:*/
/* on an unoptimized source it emits a <link rel="preload"> WITHOUT      */
/* fetchpriority, which Lighthouse's lcp-discovery insight flags as      */
/* priorityHinted:false. ReactDOM.preload below hints it properly.       */
/* When the real .avif/.jpg master lands (section 12 input #4), switch   */
/* back to next/image and drop the manual preload.                       */
/* ------------------------------------------------------------------ */
const HERO_CAR_SRC = '/images/cars/suv-premium.svg';
const HERO_CAR_WIDTH = 800;
const HERO_CAR_HEIGHT = 380;

/**
 * WOW 1 runs once per session (plan 5.2). This has to be a blocking inline
 * script rather than an effect: an effect runs *after* paint, so the 900 ms
 * ignition would already be playing before the flag could shorten it and a
 * returning visitor would see a flash of the long version. Executed while the
 * parser is still inside <body>, it stamps <html data-ignition="seen"> before
 * the hero markup below is even parsed, and globals.css then collapses every
 * ignition keyframe to 300 ms. sessionStorage throws in some private-browsing
 * modes, hence the try/catch — failing means "play the long version", which is
 * the correct fallback.
 */
const IGNITION_SCRIPT =
  "try{if(sessionStorage.getItem('dc.ignition'))document.documentElement.setAttribute('data-ignition','seen');else sessionStorage.setItem('dc.ignition','1')}catch(e){}";

/** Latin digits in every locale, thin-space grouping — same convention as `formatMAD`. */
function latinInt(n) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n).replace(/,/g, ' ');
}

/** "4,9" in fr/es, "4.9" elsewhere — always Latin digits (plan 4.12). */
function latinRating(n, locale) {
  const s = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  return locale === 'fr' || locale === 'es' ? s.replace('.', ',') : s;
}

/**
 * The trust strip of plan 4.2 — under CLAUDE.md rule 11 a candidate only
 * survives if the value is really in `settings`. Nothing here is invented and
 * nothing is defaulted: an absent field means the claim is not ours to make.
 *
 * @param {object} settings
 * @param {string} locale
 * @returns {{id: string, key: string, values?: object, noteKey?: string}[]}
 */
function verifiedTrustItems(settings, locale) {
  const rating = Number(settings?.googleRating ?? settings?.rating ?? 0);
  const reviews = Number(settings?.googleReviewCount ?? settings?.reviewCount ?? 0);
  const founded = Number(settings?.foundedYear ?? 0);
  const gearboxes = Array.isArray(settings?.transmissions) ? settings.transmissions : [];

  return [
    {
      id: 'rating',
      key: 'trust.rating',
      values: { rating: latinRating(rating, locale), count: latinInt(reviews) },
      // Both halves of the claim have to exist: a rating with no review count
      // is not a verifiable fact, and "0 avis" is worse than silence.
      verified: rating > 0 && rating <= 5 && reviews > 0,
    },
    {
      id: 'since',
      key: 'trust.since',
      values: { year: String(founded) },
      verified: founded > 1900 && founded <= new Date().getFullYear(),
    },
    {
      id: 'gearbox',
      key: 'trust.gearbox',
      // Needs settings.transmissions to actually list both. The hero never sees
      // the fleet, so it cannot derive the mix and must not assume it.
      verified: gearboxes.includes('manual') && gearboxes.includes('automatic'),
    },
    {
      id: 'airport',
      key: 'trust.airport',
      noteKey: 'trust.airportNote',
      verified: settings?.airportService24h === true,
    },
  ].filter((item) => item.verified);
}

/**
 * Homepage hero — plan 4.2 (eyebrow, two-line headline, the red line, the car,
 * the booking module, the verified trust strip) choreographed by WOW 1
 * (plan 5.2). Every moving part is a CSS class from globals.css; this file
 * adds no animation of its own and no JavaScript beyond the session flag.
 *
 * @param {object} props
 * @param {object} props.settings Business settings (see `seedSettings`).
 * @param {object[]} props.locations Pickup/delivery locations for the module.
 * @param {number} [props.fleetCount] Published vehicle count (kept for the
 *   caller's contract; the strip does not use it — plan 4.2 lists no fleet
 *   count in the hero, the count belongs to the results header, plan 4.4).
 * @returns {Promise<JSX.Element>}
 */
export default async function Hero({ settings, locations, fleetCount = 0 }) {
  /* The LCP image, preloaded with an explicit priority hint. ReactDOM.preload
     is React's resource-hint API and works from a server component; it emits
     <link rel="preload" as="image" fetchpriority="high"> into <head>, which is
     exactly what Lighthouse's lcp-discovery insight asks for. */
  ReactDOM.preload(HERO_CAR_SRC, { as: 'image', fetchPriority: 'high' });

  const t = await getTranslations('home.hero');
  const locale = await getLocale();
  const trust = verifiedTrustItems(settings, locale);
  const notes = trust.filter((item) => item.noteKey);

  return (
    <section data-testid="hero" className="relative overflow-hidden pb-4 pt-[calc(var(--header-h)+2.5rem)] lg:pb-10">
      {/* Must be the first thing the parser reaches inside the hero — see IGNITION_SCRIPT. */}
      <script dangerouslySetInnerHTML={{ __html: IGNITION_SCRIPT }} />

      <div className="container-x">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          {/* ---- Text column ------------------------------------------- */}
          <div className="lg:col-span-5">
            <FadeIn delay={0.05}>
              <p className="eyebrow">{t('eyebrow')}</p>
            </FadeIn>

            <HeroTitle lines={[t('title1'), t('title2')]} className="mt-5 text-display-1 text-text" />

            {/* THE RED LINE (plan 4.2: 40 → 120 px on load). The element is
                120 px wide and `.ignite-line` carries scaleX 0 → 1 from the
                inline start, mirrored in RTL by globals.css. */}
            <div data-testid="hero-redline" className="ignite-line mt-7 h-0.5 w-[120px] bg-red-signal" aria-hidden="true" />

            <FadeIn delay={0.4}>
              <p className="mt-7 max-w-md text-base leading-relaxed text-text-2 md:text-lg">{t('subtitle')}</p>
            </FadeIn>
          </div>

          {/* ---- Car column — THE LCP ELEMENT --------------------------- */}
          {/* DOM order puts it after the headline and before the module, which
              is exactly the mobile stack plan 4.2 asks for; on lg it becomes
              the 7/12 right column (~58% of the hero width). */}
          <div className="lg:col-span-7">
            <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
              {/* The chamfered frame the car breaks out of. The aspect box is
                  what reserves the height, so nothing shifts: CLS stays 0. */}
              <div
                className="chamfer aspect-[16/10] w-full rounded-b-[var(--radius-card)] border border-border bg-surface-1"
                aria-hidden="true"
              />
              {/* 108% of the frame, centred → the car overflows it by ~8%.
                  `.ignite-car` moves transform ONLY — no opacity (Chrome drops
                  opacity:0 elements as LCP candidates) and no filter (a blur
                  re-rasterises the image and pushes LCP out by ~0.5 s). */}
              <div className="ignite-car pointer-events-none absolute inset-0 grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid="hero-car"
                  src={HERO_CAR_SRC}
                  alt={t('carAlt')}
                  width={HERO_CAR_WIDTH}
                  height={HERO_CAR_HEIGHT}
                  fetchPriority="high"
                  decoding="async"
                  className="h-auto w-[108%] max-w-none object-contain"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ---- Booking module ------------------------------------------ */}
        {/* `.ignite-module` fades from opacity .01 (never 0) with a 6 px rise. */}
        <div data-testid="hero-booking" className="ignite-module relative z-10 mt-10 lg:mt-14">
          <BookingWidget locations={locations} />
        </div>

        {/* ---- Trust strip — verified facts only (rule 11) -------------- */}
        {trust.length > 0 ? (
          <FadeIn delay={0.55} className="mt-6">
            <ul data-testid="hero-trust" aria-label={t('trust.label')} className="flex flex-wrap items-center gap-y-2">
              {trust.map((item, i) => (
                <li
                  key={item.id}
                  className={`text-meta flex items-center gap-2 text-text-muted ${i ? 'ms-6 border-s border-border ps-6' : ''}`}
                >
                  {item.id === 'rating' ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-red-signal" fill="currentColor" aria-hidden="true">
                      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z" />
                    </svg>
                  ) : null}
                  <span>{t(item.key, item.values)}</span>
                </li>
              ))}
            </ul>
            {notes.length > 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-text-muted">
                {notes.map((item) => t(item.noteKey)).join(' ')}
              </p>
            ) : null}
          </FadeIn>
        ) : null}
      </div>
    </section>
  );
}
