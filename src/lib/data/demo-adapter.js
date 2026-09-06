import { getStore, newId } from './demo-store';

const clone = (v) => JSON.parse(JSON.stringify(v));
const now = () => new Date().toISOString();

function applyVehicleFilters(list, { published, category, transmission, seats, fuel, minPrice, maxPrice, featured, sort } = {}) {
  let out = list;
  if (published !== undefined) out = out.filter((v) => v.published === published);
  if (featured !== undefined) out = out.filter((v) => v.featured === featured);
  if (category) out = out.filter((v) => (Array.isArray(category) ? category.includes(v.category) : v.category === category));
  if (transmission) out = out.filter((v) => v.transmission === transmission);
  if (fuel) out = out.filter((v) => v.fuel === fuel);
  if (seats) out = out.filter((v) => v.seats >= Number(seats));
  if (minPrice) out = out.filter((v) => v.pricePerDay >= Number(minPrice));
  if (maxPrice) out = out.filter((v) => v.pricePerDay <= Number(maxPrice));
  switch (sort) {
    case 'price_asc':
      out = [...out].sort((a, b) => a.pricePerDay - b.pricePerDay);
      break;
    case 'price_desc':
      out = [...out].sort((a, b) => b.pricePerDay - a.pricePerDay);
      break;
    case 'newest':
      out = [...out].sort((a, b) => b.year - a.year);
      break;
    default:
      out = [...out].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);
  }
  return clone(out);
}

export const demoAdapter = {
  mode: 'demo',

  /* Settings */
  async getSettings() {
    return clone(getStore().settings);
  },
  async updateSettings(patch) {
    const s = getStore();
    s.settings = { ...s.settings, ...patch, updatedAt: now() };
    return clone(s.settings);
  },

  /* Vehicles */
  async listVehicles(filters) {
    return applyVehicleFilters(getStore().vehicles, filters);
  },
  async getVehicleBySlug(slug) {
    const v = getStore().vehicles.find((x) => x.slug === slug);
    return v ? clone(v) : null;
  },
  async getVehicleById(id) {
    const v = getStore().vehicles.find((x) => x.id === id);
    return v ? clone(v) : null;
  },
  async upsertVehicle(data) {
    const s = getStore();
    if (data.id) {
      const i = s.vehicles.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.vehicles[i] = { ...s.vehicles[i], ...data, updatedAt: now() };
        return clone(s.vehicles[i]);
      }
    }
    const v = { rating: 0, reviewCount: 0, images: [], features: [], published: false, featured: false, sortOrder: 999, ...data, id: newId('v'), createdAt: now(), updatedAt: now() };
    s.vehicles.push(v);
    return clone(v);
  },
  async deleteVehicle(id) {
    const s = getStore();
    s.vehicles = s.vehicles.filter((x) => x.id !== id);
    return true;
  },

  /* Seasons / extras / locations */
  async listSeasons() {
    return clone(getStore().seasons);
  },
  async upsertSeason(data) {
    const s = getStore();
    if (data.id) {
      const i = s.seasons.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.seasons[i] = { ...s.seasons[i], ...data };
        return clone(s.seasons[i]);
      }
    }
    const row = { active: true, multiplier: 1, ...data, id: newId('s') };
    s.seasons.push(row);
    return clone(row);
  },
  async deleteSeason(id) {
    const s = getStore();
    s.seasons = s.seasons.filter((x) => x.id !== id);
    return true;
  },
  async listExtras() {
    return clone(getStore().extras);
  },
  async upsertExtra(data) {
    const s = getStore();
    if (data.id) {
      const i = s.extras.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.extras[i] = { ...s.extras[i], ...data };
        return clone(s.extras[i]);
      }
    }
    const row = { active: true, type: 'per_day', ...data, id: newId('x') };
    s.extras.push(row);
    return clone(row);
  },
  async deleteExtra(id) {
    const s = getStore();
    s.extras = s.extras.filter((x) => x.id !== id);
    return true;
  },
  async listLocations() {
    return clone(getStore().locations);
  },

  /* FAQ */
  async listFaqs({ published } = {}) {
    let list = getStore().faqs;
    if (published !== undefined) list = list.filter((f) => f.published === published);
    return clone([...list].sort((a, b) => a.sortOrder - b.sortOrder));
  },
  async upsertFaq(data) {
    const s = getStore();
    if (data.id) {
      const i = s.faqs.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.faqs[i] = { ...s.faqs[i], ...data };
        return clone(s.faqs[i]);
      }
    }
    const row = { published: true, sortOrder: 999, category: 'general', ...data, id: newId('f') };
    s.faqs.push(row);
    return clone(row);
  },
  async deleteFaq(id) {
    const s = getStore();
    s.faqs = s.faqs.filter((x) => x.id !== id);
    return true;
  },

  /* Posts */
  async listPosts({ published } = {}) {
    let list = getStore().posts;
    if (published !== undefined) list = list.filter((p) => p.published === published);
    return clone([...list].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)));
  },
  async getPostBySlug(slug) {
    const p = getStore().posts.find((x) => x.slug === slug);
    return p ? clone(p) : null;
  },
  async getPostById(id) {
    const p = getStore().posts.find((x) => x.id === id);
    return p ? clone(p) : null;
  },
  async upsertPost(data) {
    const s = getStore();
    if (data.id) {
      const i = s.posts.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.posts[i] = { ...s.posts[i], ...data, updatedAt: now() };
        return clone(s.posts[i]);
      }
    }
    const row = { published: false, tags: [], cover: 'berline', ...data, id: newId('p'), publishedAt: data.publishedAt || now(), updatedAt: now() };
    s.posts.push(row);
    return clone(row);
  },
  async deletePost(id) {
    const s = getStore();
    s.posts = s.posts.filter((x) => x.id !== id);
    return true;
  },

  /* Reviews */
  async listReviews({ published } = {}) {
    let list = getStore().reviews;
    if (published !== undefined) list = list.filter((r) => r.published === published);
    return clone([...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  },
  async upsertReview(data) {
    const s = getStore();
    if (data.id) {
      const i = s.reviews.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.reviews[i] = { ...s.reviews[i], ...data };
        return clone(s.reviews[i]);
      }
    }
    const row = { published: false, source: 'google', rating: 5, isSample: false, ...data, id: newId('r'), createdAt: now() };
    s.reviews.push(row);
    return clone(row);
  },
  async deleteReview(id) {
    const s = getStore();
    s.reviews = s.reviews.filter((x) => x.id !== id);
    return true;
  },

  /* Bookings */
  async createBooking(data) {
    const s = getStore();
    const row = { status: 'pending', source: 'web', notes: '', ...data, id: newId('b'), createdAt: now() };
    s.bookings.unshift(row);
    return clone(row);
  },
  async listBookings({ status, limit } = {}) {
    let list = getStore().bookings;
    if (status) list = list.filter((b) => b.status === status);
    list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (limit) list = list.slice(0, limit);
    return clone(list);
  },
  async getBooking(idOrRef) {
    const b = getStore().bookings.find((x) => x.id === idOrRef || x.reference === idOrRef);
    return b ? clone(b) : null;
  },
  async updateBooking(id, patch) {
    const s = getStore();
    const i = s.bookings.findIndex((x) => x.id === id);
    if (i < 0) return null;
    s.bookings[i] = { ...s.bookings[i], ...patch, updatedAt: now() };
    return clone(s.bookings[i]);
  },

  /* Stats */
  async getStats() {
    const s = getStore();
    const month = new Date().toISOString().slice(0, 7);
    const monthBookings = s.bookings.filter((b) => b.createdAt.startsWith(month) && b.status !== 'cancelled');
    const revenue = monthBookings.reduce((sum, b) => sum + (b.totalMad || 0), 0);
    const pending = s.bookings.filter((b) => b.status === 'pending').length;
    const active = s.bookings.filter((b) => ['confirmed', 'active'].includes(b.status)).length;
    const published = s.vehicles.filter((v) => v.published).length;
    return { monthBookings: monthBookings.length, revenueMad: revenue, pending, active, fleetPublished: published, fleetTotal: s.vehicles.length };
  },
};
