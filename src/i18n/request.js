import { locale as getRootLocale } from 'next/root-params';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing, localeTags } from './routing';

/**
 * Number/date formats shared by every locale.
 * Prices are always MAD with Latin digits (Moroccan CLDR default), thousands
 * separated by a thin space – matches receipts, road signs and the admin.
 */
const formats = {
  number: {
    mad: { style: 'currency', currency: 'MAD', currencyDisplay: 'code', maximumFractionDigits: 0, numberingSystem: 'latn' },
    eur: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, numberingSystem: 'latn' },
    int: { maximumFractionDigits: 0, numberingSystem: 'latn' },
  },
  dateTime: {
    short: { day: '2-digit', month: '2-digit', year: 'numeric', numberingSystem: 'latn' },
    medium: { day: 'numeric', month: 'short', year: 'numeric', numberingSystem: 'latn' },
    long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' },
    time: { hour: '2-digit', minute: '2-digit', hour12: false, numberingSystem: 'latn' },
  },
};

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    let candidate;
    try {
      candidate = await getRootLocale();
    } catch {
      candidate = undefined;
    }
    locale = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Africa/Casablanca',
    formats,
    // Intl tag actually used for formatting (ar-MA keeps Latin digits).
    now: new Date(),
    onError(error) {
      if (process.env.NODE_ENV === 'development') console.warn('[i18n]', error.message);
    },
    getMessageFallback({ namespace, key }) {
      return `${namespace ? namespace + '.' : ''}${key}`;
    },
  };
});

export { localeTags };
