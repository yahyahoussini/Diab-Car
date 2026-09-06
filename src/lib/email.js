import { formatDateTime, formatMAD } from '@/lib/format';

/**
 * Booking notifications via Resend (free tier: 3,000/month). Silently skipped
 * when RESEND_API_KEY is not set, so the booking flow never depends on email.
 */
export async function sendBookingEmails({ booking, vehicle, settings }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM || 'Diab Car <reservations@diabcar.ma>';
    const notify = process.env.BOOKING_NOTIFY_EMAIL || settings?.email;
    const locale = booking.locale || 'fr';
    const name = `${vehicle.brand} ${vehicle.model} ${vehicle.year}`;
    const rows = [
      ['Référence', booking.reference],
      ['Véhicule', name],
      ['Prise en charge', `${booking.pickupLabel} — ${formatDateTime(booking.startAt, 'fr')}`],
      ['Restitution', `${booking.dropoffLabel} — ${formatDateTime(booking.endAt, 'fr')}`],
      ['Vol', booking.flightNumber || '—'],
      ['Options', (booking.extras || []).map((e) => e.key).join(', ') || '—'],
      ['Total estimé', formatMAD(booking.totalMad, 'fr')],
      ['Caution', formatMAD(booking.priceBreakdown?.deposit, 'fr')],
      ['Client', `${booking.customerName} · ${booking.customerPhone} · ${booking.customerEmail} · ${booking.customerCountry} · ${booking.driverAge} ans`],
      ['Message', booking.notes || '—'],
      ['Langue', locale],
    ];
    const table = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows
      .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5c5c5c">${k}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(String(v))}</td></tr>`)
      .join('')}</table>`;

    const jobs = [];
    if (notify) {
      jobs.push(resend.emails.send({ from, to: notify, subject: `Nouvelle demande ${booking.reference} — ${name}`, html: `<h2 style="font-family:Archivo,Helvetica Neue,Arial,sans-serif">Nouvelle demande de réservation</h2>${table}` }));
    }
    if (booking.customerEmail) {
      const subject = { fr: `Votre demande ${booking.reference} — Diab Car`, en: `Your request ${booking.reference} — Diab Car`, ar: `طلبكم ${booking.reference} — Diab Car`, es: `Su solicitud ${booking.reference} — Diab Car` }[locale];
      const intro = {
        fr: 'Merci. Nous vérifions la disponibilité et vous confirmons sur WhatsApp en moins de 10 minutes (08h–23h).',
        en: 'Thank you. We are checking availability and will confirm on WhatsApp within 10 minutes (8am–11pm).',
        ar: 'شكراً لكم. نتحقق من التوفر ونؤكد لكم على واتساب خلال 10 دقائق (08:00–23:00).',
        es: 'Gracias. Estamos comprobando la disponibilidad y le confirmaremos por WhatsApp en menos de 10 minutos (8h–23h).',
      }[locale];
      jobs.push(
        resend.emails.send({
          from,
          to: booking.customerEmail,
          subject,
          html: `<div dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><h2 style="font-family:Archivo,Helvetica Neue,Arial,sans-serif">Diab Car</h2><p>${intro}</p>${table}<p style="color:#5c5c5c;font-size:12px">${settings?.legalName || 'DIAB CAR SARL'} · ${settings?.addressLine || ''}, ${settings?.city || 'Casablanca'}</p></div>`,
        }),
      );
    }
    await Promise.allSettled(jobs);
    return { ok: true };
  } catch (error) {
    console.error('[email]', error);
    return { ok: false, error: error.message };
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
