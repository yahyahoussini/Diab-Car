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

/**
 * What a `locations` row charges for delivery — a number, or null for
 * « sur devis ».
 *
 * The table carries two fee columns. `delivery_fee_mad` (plan 6.2) is the one
 * the admin writes and the only one that is authoritative; `fee` is the
 * starter's original column, kept alive until it can be dropped. `fee` is
 * `numeric default 0`, so EVERY row that predates the admin screen holds a 0
 * there that means "nobody ever set this", not "delivery is free".
 *
 * Reading them as `deliveryFeeMad ?? fee ?? null` therefore answered 0 for
 * every place the owner had not priced yet, and the live table is exactly that
 * shape: the agency is a true 0, while the airport and all six districts are
 * `fee = 0, delivery_fee_mad = null`. The site quoted free delivery to Aïn
 * Diab, to Anfa and to Mohammed V, and the agency would have had to either
 * absorb the cost or charge at the counter for something the page never showed
 * — rule 11 and rule 4 in one bug.
 *
 * Migration 0002 had the rule right when it backfilled `set delivery_fee_mad =
 * fee where … fee > 0`: a zero in the legacy column is not a price. This is the
 * same test, applied on the way out.
 */
export function deliveryFeeOf(row) {
  /* Three spellings of the same figure, most-resolved first: `deliveryFee` is
     what the adapter has already worked out and what every caller downstream
     reads, `deliveryFeeMad` is the camelCased column, `delivery_fee_mad` the
     raw one. `??` and not `||`, so a genuine 0 — the agency — survives. */
  const own = row?.deliveryFee ?? row?.deliveryFeeMad ?? row?.delivery_fee_mad;
  if (own !== null && own !== undefined && own !== '') {
    const n = Number(own);
    if (Number.isFinite(n)) return n;
  }
  const legacy = Number(row?.fee);
  return Number.isFinite(legacy) && legacy > 0 ? legacy : null;
}
