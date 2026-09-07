import { isSupabaseConfigured } from '@/lib/auth/session';
import { demoAdapter } from './demo-adapter';

/**
 * Single data access point. Supabase when configured, otherwise the in-memory
 * demo store so the whole app (site + admin) runs with zero configuration.
 */
let adapter;
export async function db() {
  if (adapter) return adapter;
  if (isSupabaseConfigured()) {
    const { supabaseAdapter } = await import('./supabase-adapter');
    adapter = supabaseAdapter;
  } else {
    adapter = demoAdapter;
  }
  return adapter;
}

export function dataMode() {
  return isSupabaseConfigured() ? 'supabase' : 'demo';
}

/* Convenience wrappers used across the site */
export const getSettings = async () => (await db()).getSettings();
export const listVehicles = async (f) => (await db()).listVehicles(f);
export const getVehicleBySlug = async (slug) => (await db()).getVehicleBySlug(slug);
export const getVehicleById = async (id) => (await db()).getVehicleById(id);
export const listSeasons = async () => (await db()).listSeasons();
export const listExtras = async () => (await db()).listExtras();
export const listLocations = async () => (await db()).listLocations();
export const listFaqs = async (f) => (await db()).listFaqs(f);
export const listPosts = async (f) => (await db()).listPosts(f);
export const getPostBySlug = async (slug) => (await db()).getPostBySlug(slug);
export const listReviews = async (f) => (await db()).listReviews(f);
export const createBooking = async (d) => (await db()).createBooking(d);
export const getBooking = async (id) => (await db()).getBooking(id);

/* Fleet operations (plan 6.1). Identical surface in both adapters, so the app
   never branches on which one is live. */
export const listUnits = async (f) => (await db()).listUnits(f);
export const getUnit = async (id) => (await db()).getUnit(id);
export const upsertUnit = async (d) => (await db()).upsertUnit(d);
export const listCustomers = async () => (await db()).listCustomers();
export const upsertCustomer = async (d) => (await db()).upsertCustomer(d);
export const listReservations = async (f) => (await db()).listReservations(f);
export const getReservation = async (id) => (await db()).getReservation(id);
export const createReservation = async (d) => (await db()).createReservation(d);
export const updateReservation = async (id, p) => (await db()).updateReservation(id, p);
export const listBlocks = async (f) => (await db()).listBlocks(f);
export const createBlock = async (d) => (await db()).createBlock(d);
export const deleteBlock = async (id) => (await db()).deleteBlock(id);
export const listHolds = async (f) => (await db()).listHolds(f);
export const createHold = async (d) => (await db()).createHold(d);
export const releaseHold = async (id) => (await db()).releaseHold(id);
export const listEvents = async (f) => (await db()).listEvents(f);
export const createEvent = async (d) => (await db()).createEvent(d);

export { CATEGORIES, TRANSMISSIONS, FUELS, FEATURES, BOOKING_STATUSES, CAR_IMAGES, LOCALES, t, vehicleImage } from '@/lib/constants';
