/** Build a wa.me deep link with a pre-filled, localized message. */
export function whatsappLink(number, message) {
  const digits = (number || '').replace(/[^\d]/g, '');
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

const GREETING = {
  fr: 'Bonjour Diab Car,',
  en: 'Hello Diab Car,',
  ar: 'مرحباً دياب كار،',
  es: 'Hola Diab Car,',
};

/**
 * The message behind "Réserver par WhatsApp" (plan 4.6).
 *
 * Everything the staff member needs to answer without a second exchange: which
 * car, which dates, where, and the price the customer was actually shown. That
 * last one matters — with no online payment (plan 9.5) the WhatsApp thread IS
 * the confirmation channel, and a quote the agent cannot see is a quote they
 * will re-invent.
 *
 * `vehicleName` falls back to a generic phrase rather than interpolating
 * `undefined`: calling this with no rental used to produce "je souhaite
 * réserver la **undefined**" (STATUS issue 4), because a `= {}` default only
 * fires when the whole argument is missing.
 *
 * @param {string} locale
 * @param {{vehicleName?:string, from?:string, to?:string, pickup?:string, price?:string}} [rental]
 */
export function vehicleInquiryMessage(locale, { vehicleName, from, to, pickup, price } = {}) {
  const g = GREETING[locale] || GREETING.fr;
  const dates = from && to ? ` ${from} → ${to}` : '';

  /* The article belongs to the NAMED case only — "réserver la Dacia Logan" is
     right, "réserver la une voiture" is not. So the fallback carries its own
     determiner and the article is prepended only when there is a model to
     attach it to. */
  const ARTICLE = { fr: 'la ', en: 'the ', es: 'el ', ar: '' };
  const FALLBACK = { fr: 'une voiture', en: 'a car', es: 'un coche', ar: 'سيارة' };
  const car = vehicleName ? `${ARTICLE[locale] ?? ARTICLE.fr}${vehicleName}` : FALLBACK[locale] || FALLBACK.fr;

  switch (locale) {
    case 'en':
      return `${g} I would like to book ${car}${dates}${pickup ? `, pick-up: ${pickup}` : ''}${price ? `, price shown: ${price}` : ''}. Is it available?`;
    case 'ar':
      return `${g} أرغب في كراء ${car}${dates}${pickup ? `، الاستلام: ${pickup}` : ''}${price ? `، السعر المعروض: ${price}` : ''}. هل هي متوفرة؟`;
    case 'es':
      return `${g} me gustaría reservar ${car}${dates}${pickup ? `, recogida: ${pickup}` : ''}${price ? `, precio mostrado: ${price}` : ''}. ¿Está disponible?`;
    default:
      return `${g} je souhaite réserver ${car}${dates}${pickup ? `, prise en charge : ${pickup}` : ''}${price ? `, prix affiché : ${price}` : ''}. Est-elle disponible ?`;
  }
}

export function genericMessage(locale) {
  switch (locale) {
    case 'en':
      return `${GREETING.en} I have a question about a car rental in Casablanca.`;
    case 'ar':
      return `${GREETING.ar} لدي سؤال حول كراء سيارة في الدار البيضاء.`;
    case 'es':
      return `${GREETING.es} tengo una pregunta sobre un alquiler de coche en Casablanca.`;
    default:
      return `${GREETING.fr} j’ai une question concernant une location de voiture à Casablanca.`;
  }
}

export function bookingFollowUpMessage(locale, reference) {
  switch (locale) {
    case 'en':
      return `${GREETING.en} I just sent booking request ${reference}. Could you confirm availability?`;
    case 'ar':
      return `${GREETING.ar} أرسلت للتو طلب الحجز ${reference}. هل يمكنكم تأكيد التوفر؟`;
    case 'es':
      return `${GREETING.es} acabo de enviar la solicitud de reserva ${reference}. ¿Pueden confirmar la disponibilidad?`;
    default:
      return `${GREETING.fr} je viens d’envoyer la demande de réservation ${reference}. Pouvez-vous confirmer la disponibilité ?`;
  }
}
