import { t as pickText } from '@/lib/constants';

/**
 * Threading admin-uploaded photos onto the public site (plan 2.5 / 7.1).
 *
 * `CarImage` will show a row from `vehicle_photos` in preference to the
 * build-time manifest, but only if somebody hands it the rows. Nothing on the
 * public site knows about a single vehicle's photos, so every page that renders
 * cars reads the whole table ONCE per request — it is a public-read table of a
 * few dozen rows, one round trip for the page — groups it here, and passes each
 * card the array for its own vehicle.
 *
 * Why a lookup and not a fetch per card: the fleet page renders up to thirty
 * cards, and a query per card would turn one round trip into thirty on a route
 * that is supposed to be cached by ISR.
 *
 * Server-side module. It borrows the i18n picker from lib/constants, which
 * statically imports the photo manifest, so it belongs on the server for the
 * same reason CarImage does: that manifest carries a blur data-URI for every
 * angle of every car and must never ship to a browser.
 */

/* One frozen array for every vehicle without photos, so a card's `photos` prop
   keeps the same identity between renders instead of a fresh []. */
const NONE = Object.freeze([]);

/**
 * @param {object[]} rows rows from `listVehiclePhotos({})`
 * @returns {Map<string, object[]>} vehicleId → its rows, source order kept
 */
export function photosByVehicle(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.vehicleId) continue;
    const list = map.get(row.vehicleId);
    if (list) list.push(row);
    else map.set(row.vehicleId, [row]);
  }
  return map;
}

/**
 * The rows for one vehicle. Never null, so a caller can spread it straight into
 * a prop without a guard.
 *
 * @param {Map<string, object[]>} map
 * @param {{ id?: string }} vehicle
 * @returns {object[]}
 */
export function photosFor(map, vehicle) {
  const id = vehicle?.id;
  return (id && map.get(id)) || NONE;
}

/**
 * The operator's own alt text for an angle, in this language (rule 8).
 *
 * `vehicle_photos.alt` is i18n jsonb and usually empty, so this returns '' far
 * more often than not and the caller falls back to its generated alt. When it
 * is filled in, it wins: whoever uploaded the photo knows what is in the frame,
 * and the template only knows the car's name.
 *
 * The row it reads is the one `CarImage` will actually render — first by sort
 * order within the angle. That rule is duplicated from CarImage on purpose:
 * the alt has to describe the photo that ends up on screen, and CarImage does
 * not hand its choice back.
 *
 * @param {object[]} photos rows for ONE vehicle
 * @param {'front'|'side'|'rear'|'interior'|'dash'} angle
 * @param {string} locale
 * @returns {string} '' when there is nothing written for this language
 */
export function uploadedAlt(photos, angle = 'front', locale) {
  if (!Array.isArray(photos) || photos.length === 0) return '';
  const forAngle = photos.filter((p) => (p.angle || 'front') === angle);
  if (forAngle.length === 0) return '';
  const row = [...forAngle].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100))[0];
  return pickText(row.alt, locale).trim();
}
