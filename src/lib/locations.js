/**
 * Resolving a pick-up value.
 *
 * Two vocabularies collided here, and the collision was silent:
 *
 *   - the booking module and every URL it produces carry a LOCATION KEY —
 *     `agence-zerktouni`, `aeroport-mohammed-v`, `autre-adresse`. That is the
 *     real-world thing the customer chose.
 *   - `src/lib/pricing.js` needs a FEE CATEGORY — `agency` | `airport` |
 *     `address` — because that is what decides the delivery fee.
 *
 * `/api/availability` originally validated `pickup` against the fee category,
 * so every real search from the module was rejected with a 400 and the results
 * page rendered zero cars. The same mismatch made `submitBooking` look up
 * `locations.find(l => l.key === 'agency')`, which never matched, so every
 * reservation was written with a null pickup_location_id.
 *
 * One resolver, used by both, tolerant of either vocabulary: the key is
 * authoritative, the fee category is derived from the location's `kind`.
 */

/** The module's sentinel for "somewhere else, I'll type it". */
export const OTHER_LOCATION_KEY = 'autre-adresse';

/** Fee categories `pricing.quote()` understands. */
const FEE_KEYS = ['agency', 'airport', 'station', 'address'];

/**
 * `kind` (plan 6.2) → fee category. A city or a district is a delivery, which
 * is priced as an address; only the agency itself is free by default.
 */
const KIND_TO_FEE = {
  agency: 'agency',
  airport: 'airport',
  district: 'address',
  city: 'address',
  custom: 'address',
};

/**
 * @param {object[]} locations
 * @param {string|undefined} value a location key, slug, id, or a bare fee category
 * @returns {{ location: object|null, feeKey: 'agency'|'airport'|'station'|'address', key: string|null }}
 */
export function resolvePickup(locations = [], value) {
  if (!value) return { location: null, feeKey: 'agency', key: null };

  const location = locations.find((l) => l.key === value || l.slug === value || l.id === value) || null;
  if (location) {
    return { location, feeKey: KIND_TO_FEE[location.kind] || 'address', key: location.key || location.slug || null };
  }

  /* "Somewhere else" is a delivery to a typed address — priced as one even
     though no location row exists for it. */
  if (value === OTHER_LOCATION_KEY) return { location: null, feeKey: 'address', key: value };

  /* Already a fee category (the funnel's own vocabulary, and older links). */
  if (FEE_KEYS.includes(value)) return { location: null, feeKey: value, key: value };

  /* Unknown: treat as the agency rather than inventing a delivery charge the
     customer never agreed to (CLAUDE.md rule 4). */
  return { location: null, feeKey: 'agency', key: value };
}

/** A pick-up value is safe to accept from a URL if it looks like a slug. */
export const LOCATION_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
