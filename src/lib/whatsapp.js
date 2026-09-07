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

/**
 * From the results page: dates and place, no car chosen yet (plan 4.4's empty
 * state and the results WhatsApp escape hatch). Enough for staff to answer
 * "yes, we have something" without a round of questions.
 *
 * @param {string} locale
 * @param {{from?:string, to?:string, place?:string}} [search]
 */
export function searchInquiryMessage(locale, { from, to, place } = {}) {
  const g = GREETING[locale] || GREETING.fr;
  const dates = from && to ? ` ${from} → ${to}` : '';
  switch (locale) {
    case 'en':
      return `${g} I am looking for a car${dates}${place ? `, pick-up: ${place}` : ''}. What do you have available?`;
    case 'ar':
      return `${g} أبحث عن سيارة${dates}${place ? `، الاستلام: ${place}` : ''}. ما المتوفر لديكم؟`;
    case 'es':
      return `${g} busco un coche${dates}${place ? `, recogida: ${place}` : ''}. ¿Qué tenéis disponible?`;
    default:
      return `${g} je cherche une voiture${dates}${place ? `, prise en charge : ${place}` : ''}. Qu’avez-vous de disponible ?`;
  }
}

/**
 * After a reservation is created (plan 4.7): everything the agent needs to
 * confirm in one message — reference, car, exact dates, place, and the total
 * that was displayed.
 *
 * This is the most important template on the site. Diab Car takes no payment
 * online (plan 9.5), so this thread IS the confirmation step; anything missing
 * here becomes a question the customer has to answer twice.
 *
 * @param {string} locale
 * @param {{reference:string, vehicleName?:string, from?:string, to?:string, pickup?:string, dropoff?:string, total?:string}} booking
 */
export function bookingConfirmedMessage(locale, { reference, vehicleName, from, to, pickup, dropoff, total } = {}) {
  const g = GREETING[locale] || GREETING.fr;
  const car = vehicleName ? ` ${vehicleName}` : '';
  const when = from && to ? ` ${from} → ${to}` : '';
  /* Only mentioned when it differs — a one-way return is the exception. */
  const back = dropoff && dropoff !== pickup ? dropoff : null;

  switch (locale) {
    case 'en':
      return `${g} booking ${reference}:${car}${when}${pickup ? `, pick-up ${pickup}` : ''}${back ? `, return ${back}` : ''}${total ? `, total shown ${total}` : ''}. Please confirm.`;
    case 'ar':
      return `${g} الحجز ${reference}:${car}${when}${pickup ? `، الاستلام ${pickup}` : ''}${back ? `، الإرجاع ${back}` : ''}${total ? `، المجموع المعروض ${total}` : ''}. يرجى التأكيد.`;
    case 'es':
      return `${g} reserva ${reference}:${car}${when}${pickup ? `, recogida ${pickup}` : ''}${back ? `, devolución ${back}` : ''}${total ? `, total mostrado ${total}` : ''}. Confirmen, por favor.`;
    default:
      return `${g} réservation ${reference} :${car}${when}${pickup ? `, prise en charge ${pickup}` : ''}${back ? `, restitution ${back}` : ''}${total ? `, total affiché ${total}` : ''}. Merci de confirmer.`;
  }
}
