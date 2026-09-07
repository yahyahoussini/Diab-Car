import { getTranslations } from 'next-intl/server';
import Breadcrumbs from '@/components/site/Breadcrumbs';
import Funnel from '@/components/site/funnel/Funnel';
import { getSettings, listExtras, listLocations } from '@/lib/data';
import { absoluteUrl, localizedMetadata } from '@/lib/seo';

/**
 * The booking funnel (plan 4.7). One route, four steps.
 *
 * `noindex` — a funnel has nothing to rank for and every parameter
 * combination would be a duplicate (CLAUDE.md rule 8). The proxy already marks
 * parametrised URLs, but this page says so itself because the BARE
 * /reservation is just as useless to a search engine as the parametrised one.
 */

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.booking' });
  return localizedMetadata({ locale, href: '/reservation', title: t('title'), description: t('description'), noIndex: true });
}

export default async function BookingPage({ params, searchParams }) {
  const { locale } = await params;
  const sp = await searchParams;

  const t = await getTranslations({ locale, namespace: 'booking' });
  const tf = await getTranslations({ locale, namespace: 'funnel' });
  const tn = await getTranslations({ locale, namespace: 'nav' });

  const [locations, extras, settings] = await Promise.all([listLocations(), listExtras(), getSettings()]);

  const labels = {
    steps: { s1: tf('steps.s1'), s2: tf('steps.s2'), s3: tf('steps.s3'), s4: tf('steps.s4') },
    next: tf('next'),
    days: tf.raw('days'),
    back: tf('back'),
    chooseCar: tf('chooseCar'),
    selected: tf('selected'),
    holdLeft: tf('holdLeft'),
    holdExpired: tf('holdExpired'),
    holdExpiredBody: tf('holdExpiredBody'),
    recheck: tf('recheck'),
    soldOutTitle: tf('soldOutTitle'),
    soldOutBody: tf('soldOutBody'),
    noCars: tf('noCars'),
    changeDates: tf('changeDates'),
    optionsTitle: tf('optionsTitle'),
    optionsNone: tf('optionsNone'),
    perDay: tf('perDay'),
    perRental: tf('perRental'),
    summaryTitle: tf('summaryTitle'),
    rental: tf('rental'),
    options: tf('options'),
    delivery: tf('delivery'),
    oneWay: tf('oneWay'),
    discount: tf('discount'),
    total: tf('total'),
    deposit: tf('deposit'),
    depositNote: tf.raw('depositNote'),
    payment: tf('payment'),
    consent: tf('consent'),
    consentReceipt: tf.raw('consentReceipt'),
    submit: tf('submit'),
    submitting: tf('submitting'),
    whatsappCheckbox: tf('whatsappCheckbox'),
    firstName: tf('firstName'),
    lastName: tf('lastName'),
    errorCaptcha: tf('errorCaptcha'),
    errorServer: tf('errorServer'),
    errorSoldOut: tf('errorSoldOut'),
  };

  return (
    <div className="pb-24 pt-[calc(var(--header-h)+1.5rem)]">
      <div className="container-x">
        <Breadcrumbs items={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: t('title'), url: absoluteUrl(locale, '/reservation') }]} />

        <h1 className="text-display-2 mt-6 text-text">{t('title')}</h1>

        <div className="mt-8">
          <Funnel
            locations={locations}
            extras={extras}
            settings={{
              depositReleaseDays: settings?.depositReleaseDays || 7,
              cndpReceipt: settings?.cndpReceipt || null,
              responseTime: settings?.responseTime || 10,
            }}
            labels={labels}
            locale={locale}
            /* Present only when Turnstile is configured. The SERVER decides
               whether a token was required; this just renders the widget. */
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
            initial={{ step: sp.step, from: sp.from, to: sp.to, pickup: sp.pickup, dropoff: sp.dropoff, vehicle: sp.vehicle, extras: sp.extras }}
          />
        </div>
      </div>
    </div>
  );
}
