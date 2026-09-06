import { localeTags } from '@/i18n/routing';

const NBSP_THIN = ' ';

/** "1 250 MAD" — Latin digits in every locale, thin no-break space grouping. */
export function formatMAD(amount, locale = 'fr', { withUnit = true } = {}) {
  const n = Math.round(Number(amount) || 0);
  const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n).replace(/,/g, NBSP_THIN);
  if (!withUnit) return grouped;
  const unit = locale === 'ar' ? 'درهم' : 'MAD';
  return `${grouped}${NBSP_THIN}${unit}`;
}

export function formatEUR(amountMad, eurRate = 10.8, locale = 'fr') {
  const eur = Math.round((Number(amountMad) || 0) / (Number(eurRate) || 10.8));
  const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(eur).replace(/,/g, NBSP_THIN);
  return locale === 'en' ? `€${grouped}` : `${grouped}${NBSP_THIN}€`;
}

export function formatDate(iso, locale = 'fr', style = 'medium') {
  if (!iso) return '';
  const opts = style === 'short' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(`${localeTags[locale] || 'fr-MA'}-u-nu-latn`, { ...opts, timeZone: 'Africa/Casablanca' }).format(new Date(iso));
}

export function formatDateTime(iso, locale = 'fr') {
  if (!iso) return '';
  return new Intl.DateTimeFormat(`${localeTags[locale] || 'fr-MA'}-u-nu-latn`, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Casablanca',
  }).format(new Date(iso));
}

export function formatTime(iso, locale = 'fr') {
  if (!iso) return '';
  return new Intl.DateTimeFormat(`${localeTags[locale] || 'fr-MA'}-u-nu-latn`, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Casablanca' }).format(new Date(iso));
}

/** "+212 6 59 77 55 82" display form for Moroccan numbers. */
export function formatPhone(e164 = '') {
  const m = e164.replace(/\s+/g, '').match(/^\+212(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) return `+212 ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
  return e164;
}

/** Local dialing form "06 59 77 55 82". */
export function formatPhoneLocal(e164 = '') {
  const m = e164.replace(/\s+/g, '').match(/^\+212(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) return `0${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
  return e164;
}

/** Combine yyyy-mm-dd + HH:mm (Casablanca local, UTC+1) into an ISO string. */
export function toISO(date, time = '10:00') {
  if (!date) return '';
  return new Date(`${date}T${time}:00+01:00`).toISOString();
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(str = '') {
  return str
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
