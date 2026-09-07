/**
 * Drive times from Casablanca (plan 4.3 §8).
 *
 * These are ordinary road-distance figures by the usual motorway route —
 * common knowledge, not a Diab Car promise — so they are rendered with an
 * "approx." qualifier and never as a guarantee. Real traffic, tolls and the
 * Ramadan timetable all move them.
 *
 * `x` / `y` are positions inside the 400 × 520 viewBox of MoroccoMap.
 */
export const APPROXIMATE = true;

export const CITIES = [
  { key: 'casablanca', km: 0, minutes: 0, x: 150, y: 196, home: true },
  { key: 'rabat', km: 90, minutes: 65, x: 178, y: 165 },
  { key: 'marrakech', km: 240, minutes: 150, x: 156, y: 274 },
  { key: 'fes', km: 300, minutes: 180, x: 226, y: 168 },
  { key: 'tanger', km: 340, minutes: 195, x: 186, y: 88 },
  { key: 'essaouira', km: 380, minutes: 250, x: 104, y: 282 },
  { key: 'agadir', km: 460, minutes: 270, x: 106, y: 336 },
];

/**
 * Only link to a route that actually exists. City pages are P2 (plan §3), so
 * today the single relevant destination is the road-trip guide.
 */
export const GUIDE_SLUG = 'casablanca-marrakech-rabat-tanger-en-voiture-peages-2026';
export const GUIDE_CITIES = new Set(['marrakech', 'rabat', 'tanger']);

/** "2 h 30" / "45 min" — the unit words come from messages, never hardcoded. */
export function splitDuration(minutes) {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
