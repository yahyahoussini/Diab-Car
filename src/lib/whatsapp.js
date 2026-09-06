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

export function vehicleInquiryMessage(locale, { vehicleName, from, to, pickup } = {}) {
  const g = GREETING[locale] || GREETING.fr;
  const dates = from && to ? ` ${from} → ${to}` : '';
  switch (locale) {
    case 'en':
      return `${g} I would like to book the ${vehicleName}${dates}${pickup ? `, pick-up: ${pickup}` : ''}. Is it available?`;
    case 'ar':
      return `${g} أرغب في كراء ${vehicleName}${dates}${pickup ? `، الاستلام: ${pickup}` : ''}. هل هي متوفرة؟`;
    case 'es':
      return `${g} me gustaría reservar el ${vehicleName}${dates}${pickup ? `, recogida: ${pickup}` : ''}. ¿Está disponible?`;
    default:
      return `${g} je souhaite réserver la ${vehicleName}${dates}${pickup ? `, prise en charge : ${pickup}` : ''}. Est-elle disponible ?`;
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
