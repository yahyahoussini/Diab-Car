import { defineRouting } from 'next-intl/routing';

export const locales = ['fr', 'en', 'ar', 'es'];
export const defaultLocale = 'fr';

/** Human labels for the language switcher (native names). */
export const localeLabels = {
  fr: 'Français',
  en: 'English',
  ar: 'العربية',
  es: 'Español',
};

/** BCP-47 tags used for Intl formatting and <html lang>. */
export const localeTags = {
  fr: 'fr-MA',
  en: 'en-GB',
  ar: 'ar-MA',
  es: 'es-ES',
};

/** Open Graph locale codes. */
export const ogLocales = {
  fr: 'fr_FR',
  en: 'en_GB',
  ar: 'ar_AR',
  es: 'es_ES',
};

export const rtlLocales = ['ar'];

/**
 * Localized, keyword-bearing URLs. Internal route folders use the French key
 * (e.g. /vehicules); next-intl rewrites the public URL for each locale.
 * Arabic reuses the English slugs: Latin slugs stay robust in hreflang, logs and
 * WhatsApp shares, and URL keywords are a minor ranking factor for Arabic queries.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
  localeCookie: { name: 'NEXT_LOCALE', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' },
  alternateLinks: false,
  pathnames: {
    '/': '/',
    '/vehicules': {
      fr: '/location-voiture-casablanca',
      en: '/car-rental-casablanca',
      ar: '/car-rental-casablanca',
      es: '/alquiler-coches-casablanca',
    },
    '/vehicules/[slug]': {
      fr: '/location-voiture-casablanca/[slug]',
      en: '/car-rental-casablanca/[slug]',
      ar: '/car-rental-casablanca/[slug]',
      es: '/alquiler-coches-casablanca/[slug]',
    },
    '/aeroport': {
      fr: '/location-voiture-aeroport-casablanca',
      en: '/car-rental-casablanca-airport',
      ar: '/car-rental-casablanca-airport',
      es: '/alquiler-coches-aeropuerto-casablanca',
    },
    '/longue-duree': {
      fr: '/location-voiture-longue-duree-casablanca',
      en: '/long-term-car-rental-casablanca',
      ar: '/long-term-car-rental-casablanca',
      es: '/alquiler-coches-larga-duracion-casablanca',
    },
    '/avec-chauffeur': {
      fr: '/location-voiture-avec-chauffeur-casablanca',
      en: '/car-rental-with-driver-casablanca',
      ar: '/car-rental-with-driver-casablanca',
      es: '/coche-con-conductor-casablanca',
    },
    '/reservation': {
      fr: '/reservation',
      en: '/booking',
      ar: '/booking',
      es: '/reserva',
    },
    '/reservation/confirmation': {
      fr: '/reservation/confirmation',
      en: '/booking/confirmation',
      ar: '/booking/confirmation',
      es: '/reserva/confirmacion',
    },
    '/a-propos': {
      fr: '/a-propos',
      en: '/about',
      ar: '/about',
      es: '/sobre-nosotros',
    },
    '/faq': '/faq',
    '/contact': {
      fr: '/contact',
      en: '/contact',
      ar: '/contact',
      es: '/contacto',
    },
    '/blog': '/blog',
    '/blog/[slug]': '/blog/[slug]',
    '/conditions': {
      fr: '/conditions-generales-de-location',
      en: '/rental-terms',
      ar: '/rental-terms',
      es: '/condiciones-de-alquiler',
    },
    '/mentions-legales': {
      fr: '/mentions-legales',
      en: '/legal-notice',
      ar: '/legal-notice',
      es: '/aviso-legal',
    },
    '/confidentialite': {
      fr: '/politique-de-confidentialite',
      en: '/privacy-policy',
      ar: '/privacy-policy',
      es: '/politica-de-privacidad',
    },
  },
});
