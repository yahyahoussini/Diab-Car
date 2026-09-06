import { getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';
import { CheckIcon, WhatsAppIcon } from '@/components/site/icons';
import { getBooking, getSettings, getVehicleById } from '@/lib/data';
import { formatDateTime, formatMAD, formatPhone } from '@/lib/format';
import { localizedMetadata } from '@/lib/seo';
import { bookingFollowUpMessage, whatsappLink } from '@/lib/whatsapp';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.confirmation' });
  return localizedMetadata({ locale, href: '/reservation/confirmation', title: t('title'), noIndex: true });
}

export default async function ConfirmationPage({ params, searchParams }) {
  const { locale } = await params;
  const { ref } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'booking.confirmation' });
  const tb = await getTranslations({ locale, namespace: 'booking' });
  const tv = await getTranslations({ locale, namespace: 'vehicle' });
  const booking = ref ? await getBooking(ref) : null;
  const [settings, vehicle] = await Promise.all([getSettings(), booking ? getVehicleById(booking.vehicleId) : null]);

  return (
    <div className="pt-[calc(var(--header-h)+2rem)] pb-24">
      <div className="container-x max-w-3xl">
        {booking ? (
          <>
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckIcon className="h-8 w-8" />
            </div>
            <h1 className="mt-5 text-display-2 text-text">{t('title')}</h1>
            <p className="mt-2 text-sm text-text-muted">
              {t('reference')} · <bdi className="font-latin-sans font-semibold text-text">{booking.reference}</bdi>
            </p>
            <p className="mt-5 text-lg text-text-2">{t('text', { name: booking.customerName, phone: formatPhone(booking.customerPhone) })}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              {settings?.whatsapp ? (
                <Button href={whatsappLink(settings.whatsapp, bookingFollowUpMessage(locale, booking.reference))} external variant="whatsapp" size="lg">
                  <WhatsAppIcon className="h-5 w-5" />
                  {t('whatsapp')}
                </Button>
              ) : null}
              <Button href="/" variant="secondary" size="lg">
                {t('home')}
              </Button>
            </div>

            <section className="card mt-10 p-6">
              <h2 className="font-display text-2xl text-text">{t('details')}</h2>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <Item label={tb('vehicle')} value={vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year}` : '—'} />
                <Item label={tb('pickup')} value={`${booking.pickupLabel} · ${formatDateTime(booking.startAt, locale)}`} />
                <Item label={tb('dropoff')} value={`${booking.dropoffLabel} · ${formatDateTime(booking.endAt, locale)}`} />
                {booking.flightNumber ? <Item label={tb('flight')} value={booking.flightNumber} /> : null}
                <Item label={tv('quote.total')} value={formatMAD(booking.totalMad, locale)} />
                <Item label={tv('quote.deposit')} value={formatMAD(booking.priceBreakdown?.deposit, locale)} />
              </dl>
            </section>
          </>
        ) : (
          <>
            <h1 className="text-display-2 text-text">{t('title')}</h1>
            <p className="mt-4 text-text-2">{t('notFound')}</p>
            <Button href="/reservation" className="mt-6">
              {tb('title')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.08em] text-text-muted rtl:tracking-normal">{label}</dt>
      <dd className="mt-0.5 font-medium text-text">
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
