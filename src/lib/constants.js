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

export function vehicleImage(vehicle) {
  if (vehicle?.images?.length) return vehicle.images[0];
  return `/images/cars/${vehicle?.image || 'berline'}.svg`;
}
