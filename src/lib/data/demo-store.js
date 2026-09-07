import {
  seedBookings,
  seedExtras,
  seedFaqs,
  seedLocations,
  seedPosts,
  seedReviews,
  seedSeasons,
  seedSettings,
  seedVehicles,
} from './seed';

/**
 * In-memory store used when Supabase is not configured. Lives on globalThis so
 * it survives HMR in development and is shared across requests in one server
 * process. Writes are NOT persisted across restarts — the admin shows a banner.
 */
const clone = (v) => JSON.parse(JSON.stringify(v));

function createStore() {
  return {
    settings: clone(seedSettings),
    vehicles: clone(seedVehicles),
    seasons: clone(seedSeasons),
    extras: clone(seedExtras),
    locations: clone(seedLocations),
    faqs: clone(seedFaqs),
    posts: clone(seedPosts),
    reviews: clone(seedReviews),
    bookings: clone(seedBookings),

    /* Fleet operations (plan 6.1). The real tables arrive with the migrations
       in supabase/migrations; these keep `npm run dev` working with no
       Supabase env at all (CLAUDE.md rule 12) and give the availability engine
       something to develop against. */
    units: seedUnits(),
    customers: [],
    reservations: [],
    blocks: [],
    holds: [],
    events: [],
  };
}

/**
 * One unit per physical car, derived from each vehicle's unitsCount — the same
 * expansion scripts/seed.mjs does against Postgres, so demo and Supabase agree
 * on how many cars exist.
 */
function seedUnits() {
  const units = [];
  for (const v of seedVehicles) {
    for (let i = 0; i < (v.unitsCount || 1); i += 1) {
      units.push({
        id: `u-${v.slug}-${i + 1}`,
        vehicleId: v.id,
        plate: `TBD-${v.slug}-${i + 1}`,
        year: v.year,
        mileageKm: 0,
        fuelPct: 100,
        status: 'available',
        currentLocationId: 'l-agence-zerktouni',
        notes: null,
      });
    }
  }
  return units;
}

export function getStore() {
  if (!globalThis.__diabcarStore) globalThis.__diabcarStore = createStore();
  return globalThis.__diabcarStore;
}

export function resetStore() {
  globalThis.__diabcarStore = createStore();
  return globalThis.__diabcarStore;
}

export function newId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
