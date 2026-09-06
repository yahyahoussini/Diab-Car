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
  };
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
