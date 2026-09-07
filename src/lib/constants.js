/** Pure constants and helpers shared by server and client code (no Node deps). */

export const CATEGORIES = ['economy', 'compact', 'sedan', 'suv', 'premium', 'luxury', 'van'];
export const TRANSMISSIONS = ['manual', 'automatic'];
export const FUELS = ['petrol', 'diesel', 'hybrid', 'electric'];
export const FEATURES = ['ac', 'bluetooth', 'apple_carplay', 'usb', 'camera', 'cruise', 'led', 'parking_sensors', 'isofix', 'leather', 'sunroof', '4wd', 'hybrid', 'massage', 'sport', 'gps'];
export const BOOKING_STATUSES = ['pending', 'confirmed', 'active', 'completed', 'cancelled'];
export const CAR_IMAGES = ['citadine', 'berline', 'suv', 'suv-premium', 'coupe', 'van'];
export const LOCALES = ['fr', 'en', 'ar', 'es'];

/** Localized text helper: pick locale, fall back to fr → en → any. */
export function t(obj, locale) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[locale] || obj.fr || obj.en || Object.values(obj).find(Boolean) || '';
}

import manifest from '../../public/images/cars/manifest.json';

/**
 * Best single URL for a vehicle (OG cards, JSON-LD, legacy <img>): the built
 * front photo when scripts/images.mjs has produced one, else the category
 * silhouette. The manifest is a static JSON import - bundled at build, never
 * read with fs at runtime (CLAUDE.md rule 9).
 */
export function vehicleImage(vehicle) {
  if (vehicle?.images?.length) return vehicle.images[0];
  const shot = manifest?.vehicles?.[vehicle?.photoFolder || vehicle?.slug]?.front;
  if (shot) {
    const w = shot.widths.includes(1080) ? 1080 : shot.widths[shot.widths.length - 1];
    return `${shot.src}-${w}.webp`;
  }
  return `/images/cars/${vehicle?.image || 'berline'}.svg`;
}
