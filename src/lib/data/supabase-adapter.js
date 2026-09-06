import { createPublicClient, createSessionClient } from '@/lib/supabase/server';

/* camelCase <-> snake_case mapping between the app model and Postgres columns */
const toSnake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const rowToModel = (row) => (row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) : row);
const modelToRow = (m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [toSnake(k), v]));

function fail(error) {
  throw new Error(`[supabase] ${error.message}`);
}

async function readClient() {
  return createPublicClient();
}
async function writeClient() {
  return createSessionClient();
}

async function selectAll(table, build) {
  const sb = await readClient();
  let q = sb.from(table).select('*');
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) fail(error);
  return (data || []).map(rowToModel);
}

async function upsert(table, model) {
  const sb = await writeClient();
  const row = modelToRow(model);
  if (!row.id) delete row.id;
  const { data, error } = await sb.from(table).upsert(row).select().single();
  if (error) fail(error);
  return rowToModel(data);
}

async function remove(table, id) {
  const sb = await writeClient();
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) fail(error);
  return true;
}

export const supabaseAdapter = {
  mode: 'supabase',

  async getSettings() {
    const sb = await readClient();
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async updateSettings(patch) {
    return upsert('settings', { ...patch, id: 1, updatedAt: new Date().toISOString() });
  },

  async listVehicles({ published, category, transmission, seats, fuel, minPrice, maxPrice, featured, sort } = {}) {
    return selectAll('vehicles', (q) => {
      if (published !== undefined) q = q.eq('published', published);
      if (featured !== undefined) q = q.eq('featured', featured);
      if (category) q = Array.isArray(category) ? q.in('category', category) : q.eq('category', category);
      if (transmission) q = q.eq('transmission', transmission);
      if (fuel) q = q.eq('fuel', fuel);
      if (seats) q = q.gte('seats', Number(seats));
      if (minPrice) q = q.gte('price_per_day', Number(minPrice));
      if (maxPrice) q = q.lte('price_per_day', Number(maxPrice));
      if (sort === 'price_asc') q = q.order('price_per_day', { ascending: true });
      else if (sort === 'price_desc') q = q.order('price_per_day', { ascending: false });
      else if (sort === 'newest') q = q.order('year', { ascending: false });
      else q = q.order('featured', { ascending: false }).order('sort_order', { ascending: true });
      return q;
    });
  },
  async getVehicleBySlug(slug) {
    const sb = await readClient();
    const { data, error } = await sb.from('vehicles').select('*').eq('slug', slug).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async getVehicleById(id) {
    const sb = await readClient();
    const { data, error } = await sb.from('vehicles').select('*').eq('id', id).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async upsertVehicle(data) {
    return upsert('vehicles', { ...data, updatedAt: new Date().toISOString() });
  },
  async deleteVehicle(id) {
    return remove('vehicles', id);
  },

  async listSeasons() {
    return selectAll('seasons', (q) => q.order('start_date'));
  },
  async upsertSeason(data) {
    return upsert('seasons', data);
  },
  async deleteSeason(id) {
    return remove('seasons', id);
  },
  async listExtras() {
    return selectAll('extras', (q) => q.order('key'));
  },
  async upsertExtra(data) {
    return upsert('extras', data);
  },
  async deleteExtra(id) {
    return remove('extras', id);
  },
  async listLocations() {
    return selectAll('locations', (q) => q.eq('active', true).order('key'));
  },

  async listFaqs({ published } = {}) {
    return selectAll('faqs', (q) => {
      if (published !== undefined) q = q.eq('published', published);
      return q.order('sort_order');
    });
  },
  async upsertFaq(data) {
    return upsert('faqs', data);
  },
  async deleteFaq(id) {
    return remove('faqs', id);
  },

  async listPosts({ published } = {}) {
    return selectAll('posts', (q) => {
      if (published !== undefined) q = q.eq('published', published);
      return q.order('published_at', { ascending: false });
    });
  },
  async getPostBySlug(slug) {
    const sb = await readClient();
    const { data, error } = await sb.from('posts').select('*').eq('slug', slug).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async getPostById(id) {
    const sb = await readClient();
    const { data, error } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async upsertPost(data) {
    return upsert('posts', { ...data, updatedAt: new Date().toISOString() });
  },
  async deletePost(id) {
    return remove('posts', id);
  },

  async listReviews({ published } = {}) {
    return selectAll('reviews', (q) => {
      if (published !== undefined) q = q.eq('published', published);
      return q.order('created_at', { ascending: false });
    });
  },
  async upsertReview(data) {
    return upsert('reviews', data);
  },
  async deleteReview(id) {
    return remove('reviews', id);
  },

  async createBooking(data) {
    // Public insert allowed by RLS (anon) — customers create their own request.
    const sb = await readClient();
    const { data: row, error } = await sb.from('bookings').insert(modelToRow({ status: 'pending', source: 'web', ...data })).select().single();
    if (error) fail(error);
    return rowToModel(row);
  },
  async listBookings({ status, limit } = {}) {
    const sb = await writeClient();
    let q = sb.from('bookings').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) fail(error);
    return (data || []).map(rowToModel);
  },
  async getBooking(idOrRef) {
    const sb = await writeClient();
    const { data, error } = await sb.from('bookings').select('*').or(`id.eq.${idOrRef},reference.eq.${idOrRef}`).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async updateBooking(id, patch) {
    const sb = await writeClient();
    const { data, error } = await sb.from('bookings').update(modelToRow({ ...patch, updatedAt: new Date().toISOString() })).eq('id', id).select().single();
    if (error) fail(error);
    return rowToModel(data);
  },

  async getStats() {
    const sb = await writeClient();
    const month = new Date().toISOString().slice(0, 7);
    const [{ data: bookings }, { count: fleetTotal }, { count: fleetPublished }] = await Promise.all([
      sb.from('bookings').select('status,total_mad,created_at'),
      sb.from('vehicles').select('id', { count: 'exact', head: true }),
      sb.from('vehicles').select('id', { count: 'exact', head: true }).eq('published', true),
    ]);
    const list = bookings || [];
    const monthBookings = list.filter((b) => b.created_at?.startsWith(month) && b.status !== 'cancelled');
    return {
      monthBookings: monthBookings.length,
      revenueMad: monthBookings.reduce((s, b) => s + (b.total_mad || 0), 0),
      pending: list.filter((b) => b.status === 'pending').length,
      active: list.filter((b) => ['confirmed', 'active'].includes(b.status)).length,
      fleetPublished: fleetPublished || 0,
      fleetTotal: fleetTotal || 0,
    };
  },
};
