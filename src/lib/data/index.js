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

export { CATEGORIES, TRANSMISSIONS, FUELS, FEATURES, BOOKING_STATUSES, CAR_IMAGES, LOCALES, t, vehicleImage } from '@/lib/constants';
