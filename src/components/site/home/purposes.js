/**
 * Purpose -> which vehicles match (plan 4.3 §2).
 *
 * Deliberately NOT a 'use client' module: both the server (FleetSection, to
 * localize the tile labels) and the client (purposeStore, to filter) import
 * this. Anything exported from a 'use client' file reaches a server component
 * as a client reference, not the value — which is exactly the bug this file
 * exists to avoid.
 */
export const PURPOSES = [
  { key: 'city', categories: ['economy', 'compact'] },
  { key: 'family', categories: ['van', 'sedan'], minSeats: 7 },
  { key: 'suv', categories: ['suv'] },
  { key: 'business', categories: ['sedan', 'premium'] },
  { key: 'premium', categories: ['premium', 'luxury'] },
];

/**
 * Does a card match the active purpose? Reads the data attributes the server
 * wrote on each card wrapper, so filtering never needs the vehicle objects.
 * @param {{ category: string, seats: number }} card
 * @param {string|null} purposeKey
 */
export function matches(card, purposeKey) {
  if (!purposeKey) return true;
  const p = PURPOSES.find((x) => x.key === purposeKey);
  if (!p) return true;
  if (p.minSeats && card.seats >= p.minSeats) return true;
  return p.categories.includes(card.category);
}
