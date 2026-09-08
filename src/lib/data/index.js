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
/** Full settings row including internal fields. Staff only — admin pages and
    server routes, never a public page (see supabase/migrations/0005). */
export const getSettingsAdmin = async () => (await db()).getSettingsAdmin();
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

/* Notifications (plan 7.4) — the admin bell. */
export const listNotifications = async (f) => (await db()).listNotifications(f);
export const createNotification = async (d) => (await db()).createNotification(d);
export const markNotificationRead = async (id) => (await db()).markNotificationRead(id);

/* Journal (plan 7.1) and the dashboard strip. */
export const listAuditLog = async (f) => (await db()).listAuditLog(f);
export const getFleetSnapshot = async () => (await db()).getFleetSnapshot();

/* Operational writes (plan 7.1). Each is one RPC so the audit reason travels
   in the same transaction as the write — see supabase/migrations/0010. */
export const setReservationStatus = async (a) => (await db()).setReservationStatus(a);
export const assignReservationUnit = async (a) => (await db()).assignReservationUnit(a);
export const moveReservation = async (a) => (await db()).moveReservation(a);
export const overrideReservationPrice = async (a) => (await db()).overrideReservationPrice(a);
export const unitsFreeForReservation = async (id) => (await db()).unitsFreeForReservation(id);
export const getCalendar = async (a) => (await db()).getCalendar(a);
export const getCustomerProfile = async (id) => (await db()).getCustomerProfile(id);
export const listCustomerDuplicates = async () => (await db()).listCustomerDuplicates();
export const mergeCustomers = async (a) => (await db()).mergeCustomers(a);
export const setCustomerNotes = async (a) => (await db()).setCustomerNotes(a);

/* Availability (plan 6.3/6.4). Postgres decides; these only ask.
   The adapters share one shape so the funnel never branches on the backend. */
export const searchAvailability = async (a) => (await db()).searchAvailability(a);
export const nextAvailable = async (a) => (await db()).nextAvailable(a);
export const holdVehicle = async (a) => (await db()).holdVehicle(a);
export const releaseVehicleHold = async (a) => (await db()).releaseVehicleHold(a);
export const bookVehicle = async (p, o) => (await db()).bookVehicle(p, o);

export { CATEGORIES, TRANSMISSIONS, FUELS, FEATURES, BOOKING_STATUSES, CAR_IMAGES, LOCALES, t, vehicleImage } from '@/lib/constants';
