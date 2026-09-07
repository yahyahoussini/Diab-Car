import { getTranslations } from 'next-intl/server';
import Confirmation from '@/components/site/funnel/Confirmation';
import { getSettings } from '@/lib/data';
import { localizedMetadata } from '@/lib/seo';

/**
 * The confirmation screen (plan 4.7).
 *
 * `noindex` — it is per-customer and has nothing to rank for (rule 8).
 *
 * The server contributes only the agency's WhatsApp number, the response-time
 * promise and the copy. The booking itself is carried by the client from the
 * funnel's own session: `reservations` is staff-only under RLS, and adding an
 * anonymous read keyed by reference would let anyone who guessed a DC- code
 * see a stranger's booking (plan 9.4).
 */

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.confirmation' });
  return localizedMetadata({ locale, href: '/reservation/confirmation', title: t('title'), noIndex: true });
}

export default async function ConfirmationPage({ params, searchParams }) {
  const { locale } = await params;
  const { ref } = await searchParams;

  const tf = await getTranslations({ locale, namespace: 'funnel' });
  const settings = await getSettings();

  const labels = {
    kicker: tf('confirm.kicker'),
    title: tf('confirm.title'),
    reference: tf('confirm.reference'),
    whatsapp: tf('confirm.whatsapp'),
    calendar: tf('confirm.calendar'),
    nextTitle: tf('confirm.nextTitle'),
    nextBody: tf.raw('confirm.nextBody'),
    notFound: tf('confirm.notFound'),
    notFoundBody: tf('confirm.notFoundBody'),
    skip: tf('confirm.skip'),
    dates: tf('summaryTitle'),
    pickup: tf('delivery'),
    total: tf('total'),
    deposit: tf('deposit'),
    payment: tf('payment'),
  };

  return (
    <div className="relative pb-24 pt-[calc(var(--header-h)+2.5rem)]">
      <div className="container-x max-w-2xl">
        <Confirmation
          reference={typeof ref === 'string' ? ref : null}
          whatsappNumber={settings?.whatsapp || null}
          locale={locale}
          labels={labels}
          responseMinutes={settings?.responseTime || 10}
        />
      </div>
    </div>
  );
}
