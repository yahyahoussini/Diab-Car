import { getStore, newId } from './demo-store';
import { availabilityRow, freeUnits, nextAvailable, soldOut } from './demo-availability';
import { summarise } from './summarise';
import { NEEDS_REASON, NEXT_STATES, OCCUPYING_STATUSES as OCCUPYING_ST } from '../reservation-states';

const clone = (v) => JSON.parse(JSON.stringify(v));

const rangesOverlap = (a, b) => new Date(a.startAt) < new Date(b.endAt) && new Date(b.startAt) < new Date(a.endAt);
const now = () => new Date().toISOString();

/* The last nine digits, matching phone_key() in 0011. */
const phoneKey = (phone) => String(phone || '').replace(/[^0-9]/g, '').slice(-9);
const vehicleName = (store, id) => {
  const v = store.vehicles.find((x) => x.id === id);
  return v ? `${v.brand} ${v.model}` : '—';
};

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

/**
 * Fields the `public_settings` view withholds from anonymous readers
 * (supabase/migrations/0005). Stripped here too, so a page that reads one
 * behaves identically in demo and in production instead of working in `npm run
 * dev` and returning undefined on the live site.
 */
const INTERNAL_SETTINGS = ['indexNowKey'];

export const demoAdapter = {
  mode: 'demo',

  /* Settings */
  async getSettings() {
    const s = clone(getStore().settings);
    for (const k of INTERNAL_SETTINGS) delete s[k];
    return s;
  },
  /** Full row, mirroring the staff-only read in the Supabase adapter. */
  async getSettingsAdmin() {
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


  /* ---------------------------------------------------------------- fleet ops
     Parity surface with the Supabase adapter. Availability is NOT decided here:
     these are plain reads and writes. The real allocation logic lives in the
     Postgres RPCs (plan 6.3, prompt 06) — the UI never decides availability
     (CLAUDE.md rule 5). */

  async listUnits({ vehicleId, status } = {}) {
    let rows = getStore().units;
    if (vehicleId) rows = rows.filter((u) => u.vehicleId === vehicleId);
    if (status) rows = rows.filter((u) => u.status === status);
    return clone(rows);
  },
  async getUnit(id) {
    return clone(getStore().units.find((u) => u.id === id) || null);
  },
  async upsertUnit(data) {
    const s = getStore();
    const i = s.units.findIndex((u) => u.id === data.id);
    if (i >= 0) {
      const before = s.units[i];
      s.units[i] = { ...before, ...data };
      if (data.status && data.status !== before.status) {
        s.events.push({
          id: `e-${Date.now()}`, unitId: before.id, type: 'STATUS_CHANGED', at: now(),
          data: { from: before.status, to: data.status }, reason: data.reason || null,
        });
      }
      return clone(s.units[i]);
    }
    const row = { id: data.id || `u-${Date.now()}`, status: 'available', mileageKm: 0, ...data };
    s.units.push(row);
    return clone(row);
  },

  async listCustomers() {
    return clone(getStore().customers);
  },
  async upsertCustomer(data) {
    const s = getStore();
    const i = s.customers.findIndex((c) => c.id === data.id || (data.phone && c.phone === data.phone));
    if (i >= 0) {
      s.customers[i] = { ...s.customers[i], ...data };
      return clone(s.customers[i]);
    }
    const row = { id: data.id || `c-${Date.now()}`, createdAt: now(), ...data };
    s.customers.push(row);
    return clone(row);
  },

  async listReservations({ status, vehicleId, limit } = {}) {
    let rows = getStore().reservations;
    if (status) rows = rows.filter((r) => r.status === status);
    if (vehicleId) rows = rows.filter((r) => r.vehicleId === vehicleId);
    rows = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return clone(limit ? rows.slice(0, limit) : rows);
  },
  async getReservation(idOrRef) {
    const s = getStore();
    return clone(s.reservations.find((r) => r.id === idOrRef || r.reference === idOrRef) || null);
  },
  async createReservation(data) {
    const s = getStore();
    const row = {
      id: `r-${Date.now()}`,
      reference: data.reference || `DC-${Date.now().toString(36).toUpperCase()}`,
      status: 'pending', source: 'web', locale: 'fr', quote: {},
      createdAt: now(), updatedAt: now(), ...data,
    };
    s.reservations.push(row);
    return clone(row);
  },
  async updateReservation(id, patch) {
    const s = getStore();
    const i = s.reservations.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const before = s.reservations[i];
    s.reservations[i] = { ...before, ...patch, updatedAt: now() };
    if (patch.status && patch.status !== before.status && before.unitId) {
      const type = patch.status === 'active' ? 'PICKUP' : patch.status === 'returned' ? 'RETURN' : null;
      if (type) {
        s.events.push({
          id: `e-${Date.now()}`, unitId: before.unitId, reservationId: before.id, type, at: now(),
          data: { from: before.status, to: patch.status, reference: before.reference }, reason: patch.reason || null,
        });
      }
    }
    return clone(s.reservations[i]);
  },

  async listBlocks({ unitId } = {}) {
    const rows = getStore().blocks;
    return clone(unitId ? rows.filter((b) => b.unitId === unitId) : rows);
  },
  async createBlock(data) {
    const s = getStore();
    /* Mirrors the Postgres trigger: a block may not land on a live reservation
       for the same unit, and the error names the conflict (plan 6.3). */
    const clash = s.reservations.find(
      (r) => r.unitId === data.unitId
        && ['confirmed', 'ready', 'active'].includes(r.status)
        && !(new Date(r.endAt) <= new Date(data.startAt) || new Date(r.startAt) >= new Date(data.endAt)),
    );
    if (clash) {
      const err = new Error('BLOCK_CONFLICTS_RESERVATION');
      err.code = 'BLOCK_CONFLICTS_RESERVATION';
      err.detail = { reservationReference: clash.reference, reservedFrom: clash.startAt, reservedTo: clash.endAt };
      throw err;
    }
    const row = { id: `b-${Date.now()}`, kind: 'maintenance', createdAt: now(), ...data };
    s.blocks.push(row);
    return clone(row);
  },
  async deleteBlock(id) {
    const s = getStore();
    s.blocks = s.blocks.filter((b) => b.id !== id);
    return true;
  },

  async listHolds({ vehicleId, live = true } = {}) {
    let rows = getStore().holds;
    if (vehicleId) rows = rows.filter((h) => h.vehicleId === vehicleId);
    if (live) rows = rows.filter((h) => !h.releasedAt && new Date(h.expiresAt) > new Date());
    return clone(rows);
  },
  async createHold(data) {
    const s = getStore();
    const row = {
      id: `h-${Date.now()}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: now(), ...data,
    };
    s.holds.push(row);
    return clone(row);
  },
  async releaseHold(id) {
    const s = getStore();
    const h = s.holds.find((x) => x.id === id);
    if (h) h.releasedAt = now();
    return Boolean(h);
  },

  /* ---------------------------------------------------------------- availability
     Mirrors supabase/migrations/0008 exactly — see demo-availability.js for
     why that matters. The store is plain JS and every check-then-write below
     runs without an await in between, so these are atomic by construction.
     That makes the demo agree with Postgres on the OUTCOME of a race, but it
     is not a proof that Postgres serialises correctly: only
     scripts/test-concurrency.mjs against a real database shows that. */

  async searchAvailability({ startAt, endAt } = {}) {
    const s = getStore();
    return s.vehicles
      .filter((v) => v.published !== false)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.sortOrder || 0) - (b.sortOrder || 0) || a.pricePerDay - b.pricePerDay)
      .map((v) => availabilityRow(s, v, startAt, endAt));
  },

  async nextAvailable({ vehicleId, from }) {
    return nextAvailable(getStore(), vehicleId, from);
  },

  async holdVehicle({ vehicleId, startAt, endAt, sessionToken }) {
    const s = getStore();
    if (!sessionToken || sessionToken.length < 8) return { ok: false, error: 'BAD_SESSION' };
    if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'BAD_DATES' };

    const vehicle = s.vehicles.find((v) => v.id === vehicleId);
    if (!vehicle || vehicle.published === false) return { ok: false, error: 'NOT_FOUND' };

    const free = freeUnits(s, vehicleId, startAt, endAt);
    if (free <= 0) return soldOut(s, vehicleId, startAt, endAt);

    const row = {
      id: `h-${s.holds.length + 1}-${Date.now()}`,
      vehicleId, startAt, endAt, sessionToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: now(),
    };
    s.holds.push(row);
    return {
      ok: true,
      hold: { id: row.id, vehicleId, expiresAt: row.expiresAt, startAt, endAt },
      unitsFree: free - 1,
    };
  },

  async releaseVehicleHold({ holdId, sessionToken }) {
    const s = getStore();
    const h = s.holds.find((x) => x.id === holdId && x.sessionToken === sessionToken && !x.releasedAt);
    if (h) h.releasedAt = now();
    return { ok: Boolean(h) };
  },

  async bookVehicle(payload = {}) {
    const s = getStore();
    const { vehicleId, vehicleSlug, startAt, endAt, holdId, sessionToken, customer = {}, quote: q = {} } = payload;

    if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'BAD_DATES' };
    if (!customer.phone) return { ok: false, error: 'BAD_CUSTOMER' };

    const vehicle = s.vehicles.find((v) => v.id === vehicleId || v.slug === vehicleSlug);
    if (!vehicle || vehicle.published === false) return { ok: false, error: 'NOT_FOUND' };

    /* Release the hold first, so a booking is never blocked by its own hold. */
    if (holdId) {
      const h = s.holds.find((x) => x.id === holdId && x.sessionToken === sessionToken && !x.releasedAt);
      if (h) h.releasedAt = now();
    }

    const free = freeUnits(s, vehicle.id, startAt, endAt);
    if (free <= 0) return soldOut(s, vehicle.id, startAt, endAt);

    const phone = String(customer.phone);
    let cust = s.customers.find((c) => c.phone === phone);
    if (cust) {
      Object.assign(cust, {
        firstName: customer.firstName || cust.firstName,
        lastName: customer.lastName || cust.lastName,
        email: customer.email || cust.email,
        locale: customer.locale || cust.locale,
      });
    } else {
      cust = {
        id: `c-${s.customers.length + 1}-${Date.now()}`,
        firstName: customer.firstName || '-', lastName: customer.lastName || '-',
        phone, email: customer.email || null, locale: customer.locale || 'fr', createdAt: now(),
      };
      s.customers.push(cust);
    }

    const row = {
      id: `r-${s.reservations.length + 1}-${Date.now()}`,
      reference: payload.reference || `DC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      vehicleId: vehicle.id, unitId: null, customerId: cust.id,
      pickupLocationId: payload.pickupLocationId || null,
      dropoffLocationId: payload.dropoffLocationId || null,
      startAt, endAt, status: 'pending', quote: q,
      source: payload.source || 'web', locale: payload.locale || 'fr',
      holdId: holdId || null, notes: payload.notes || null,
      prepBufferMinutes: vehicle.prepBufferMinutes || 120,
      createdAt: now(), updatedAt: now(),
    };
    s.reservations.push(row);

    return {
      ok: true,
      reservation: { id: row.id, reference: row.reference, status: row.status, startAt, endAt },
      unitsFree: free - 1,
    };
  },

  /* Mirrors supabase/migrations/0010 so the admin behaves the same with no
     database. The transitions and the conflict answers are the part that must
     match; the demo has no roles, so the FORBIDDEN branch cannot occur. */

  async setReservationStatus({ id, status, reason }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (!NEXT_STATES[r.status]?.includes(status)) {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: r.status, to: status, allowed: NEXT_STATES[r.status] || [] };
    }
    if (NEEDS_REASON.includes(status) && !String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    r.status = status;
    r.updatedAt = now();
    return { ok: true, status };
  },

  async assignReservationUnit({ id, unitId, reason }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (unitId) {
      const clash = s.reservations.find(
        (x) => x.unitId === unitId && x.id !== id && OCCUPYING_ST.includes(x.status) && rangesOverlap(x, r),
      );
      if (clash) return { ok: false, error: 'CONFLICT', reference: clash.reference, from: clash.startAt, to: clash.endAt };
    }
    r.unitId = unitId || null;
    r.updatedAt = now();
    return { ok: true };
  },

  async moveReservation({ id, startAt, endAt }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'BAD_DATES' };
    const moved = { startAt, endAt };
    if (r.unitId) {
      const clash = s.reservations.find(
        (x) => x.unitId === r.unitId && x.id !== id && OCCUPYING_ST.includes(x.status) && rangesOverlap(x, moved),
      );
      if (clash) return { ok: false, error: 'CONFLICT', reference: clash.reference, from: clash.startAt, to: clash.endAt };
      if (s.blocks.some((b) => b.unitId === r.unitId && rangesOverlap(b, moved))) return { ok: false, error: 'BLOCKED' };
    }
    r.startAt = startAt;
    r.endAt = endAt;
    r.updatedAt = now();
    return { ok: true };
  },

  async overrideReservationPrice({ id, total, reason }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    r.quote = { ...(r.quote || {}), original: r.quote?.original ?? r.quote, total, overridden: true, overrideReason: reason };
    return { ok: true, total };
  },

  async unitsFreeForReservation(id) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return [];
    return clone(
      s.units
        .filter((u) => u.vehicleId === r.vehicleId && !['maintenance', 'blocked', 'out_of_service'].includes(u.status))
        .filter((u) => !s.reservations.some((x) => x.unitId === u.id && x.id !== id && OCCUPYING_ST.includes(x.status) && rangesOverlap(x, r)))
        .filter((u) => !s.blocks.some((b) => b.unitId === u.id && rangesOverlap(b, r)))
        .map((u) => ({ unitId: u.id, plate: u.plate, status: u.status })),
    );
  },

  async getCalendar({ from, to }) {
    const s = getStore();
    const win = { startAt: from, endAt: to };
    const vehicleOf = (id) => s.vehicles.find((v) => v.id === id);
    return clone({
      units: s.units.map((u) => {
        const v = vehicleOf(u.vehicleId);
        return { id: u.id, plate: u.plate, status: u.status, vehicleId: u.vehicleId, vehicle: v ? `${v.brand} ${v.model}` : '-' };
      }),
      reservations: s.reservations
        .filter((r) => OCCUPYING_ST.includes(r.status) && rangesOverlap(r, win))
        .map((r) => ({ id: r.id, unitId: r.unitId, vehicleId: r.vehicleId, reference: r.reference, status: r.status, startAt: r.startAt, endAt: r.endAt })),
      blocks: s.blocks.filter((b) => rangesOverlap(b, win)).map((b) => ({ id: b.id, unitId: b.unitId, kind: b.kind, reason: b.reason, startAt: b.startAt, endAt: b.endAt })),
    });
  },

  /* Mirrors supabase/migrations/0011. The phone key is the same rule: the last
     nine digits, so +212612345678 and 0612345678 are one person. */

  async getCustomerProfile(id) {
    const s = getStore();
    const customer = s.customers.find((c) => c.id === id);
    if (!customer) return null;
    const mine = s.reservations.filter((r) => r.customerId === id);
    const earned = mine.filter((r) => ['active', 'returned', 'closed'].includes(r.status));
    return clone({
      customer,
      reservations: mine
        .map((r) => ({
          id: r.id,
          reference: r.reference,
          status: r.status,
          startAt: r.startAt,
          endAt: r.endAt,
          total: r.quote?.total ?? null,
          vehicle: vehicleName(s, r.vehicleId),
        }))
        .sort((a, b) => String(b.startAt).localeCompare(String(a.startAt))),
      totals: {
        count: mine.length,
        revenue: earned.reduce((sum, r) => sum + (Number(r.quote?.total) || 0), 0),
        cancelled: mine.filter((r) => ['cancelled', 'no_show'].includes(r.status)).length,
        days: earned.reduce((sum, r) => sum + Math.ceil((new Date(r.endAt) - new Date(r.startAt)) / 86400000), 0),
      },
    });
  },

  async listCustomerDuplicates() {
    const s = getStore();
    const groups = new Map();
    for (const c of s.customers) {
      const key = phoneKey(c.phone);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        createdAt: c.createdAt,
        reservations: s.reservations.filter((r) => r.customerId === c.id).length,
      });
    }
    return clone([...groups.entries()].filter(([, list]) => list.length > 1).map(([key, customers]) => ({ key, customers })));
  },

  async mergeCustomers({ keepId, dropId, reason }) {
    const s = getStore();
    if (!keepId || !dropId || keepId === dropId) return { ok: false, error: 'SAME' };
    if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    const keep = s.customers.find((c) => c.id === keepId);
    const drop = s.customers.find((c) => c.id === dropId);
    if (!keep || !drop) return { ok: false, error: 'NOT_FOUND' };

    let moved = 0;
    for (const r of s.reservations) {
      if (r.customerId === dropId) {
        r.customerId = keepId;
        moved += 1;
      }
    }
    keep.email = keep.email || drop.email || null;
    keep.whatsapp = keep.whatsapp || drop.whatsapp || null;
    keep.notes = [keep.notes, drop.notes].map((n) => String(n || '').trim()).filter(Boolean).join('\n') || null;
    keep.updatedAt = now();
    s.customers = s.customers.filter((c) => c.id !== dropId);
    return { ok: true, moved, kept: keep.phone, dropped: drop.phone };
  },

  async setCustomerNotes({ id, notes }) {
    const s = getStore();
    const c = s.customers.find((x) => x.id === id);
    if (!c) return { ok: false, error: 'NOT_FOUND' };
    c.notes = String(notes || '').trim() || null;
    c.updatedAt = now();
    return { ok: true };
  },

  async listAuditLog({ table, rowId, actorId, since, until, limit = 100 } = {}) {
    const s = getStore();
    s.auditLog = s.auditLog || [];
    let rows = s.auditLog;
    if (table) rows = rows.filter((r) => r.tableName === table);
    if (rowId) rows = rows.filter((r) => r.rowId === rowId || r.rowKey === String(rowId));
    if (actorId) rows = rows.filter((r) => r.actorId === actorId);
    if (since) rows = rows.filter((r) => r.at >= since);
    if (until) rows = rows.filter((r) => r.at <= until);
    return clone([...rows].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit));
  },

  async markNotificationRead(id) {
    const s = getStore();
    s.notifications = s.notifications || [];
    const n = s.notifications.find((x) => x.id === id);
    if (n) n.readAt = now();
    return Boolean(n);
  },

  async getFleetSnapshot() {
    const s = getStore();
    s.notifications = s.notifications || [];
    return summarise(s.units, s.reservations, s.notifications.filter((n) => !n.readAt).length);
  },

  /* Notifications (plan 7.4): the bell in the admin. Written by the booking
     action so staff see a new reservation without polling the list. */
  async listNotifications({ unreadOnly = false, limit = 50 } = {}) {
    const s = getStore();
    s.notifications = s.notifications || [];
    let rows = s.notifications;
    if (unreadOnly) rows = rows.filter((n) => !n.readAt);
    return clone([...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit));
  },
  async createNotification(data) {
    const s = getStore();
    s.notifications = s.notifications || [];
    const row = { id: `n-${s.notifications.length + 1}-${Date.now()}`, level: 'info', createdAt: now(), readAt: null, ...data };
    s.notifications.push(row);
    return clone(row);
  },

  async expireHolds() {
    const s = getStore();
    const stamp = now();
    let n = 0;
    for (const h of s.holds) {
      if (!h.releasedAt && new Date(h.expiresAt) <= new Date()) {
        h.releasedAt = stamp;
        n += 1;
      }
    }
    return n;
  },

  async listEvents({ unitId, reservationId, limit = 50 } = {}) {
    let rows = getStore().events;
    if (unitId) rows = rows.filter((e) => e.unitId === unitId);
    if (reservationId) rows = rows.filter((e) => e.reservationId === reservationId);
    return clone([...rows].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit));
  },
  async createEvent(data) {
    const s = getStore();
    const row = { id: `e-${Date.now()}`, at: now(), ...data };
    s.events.push(row);
    return clone(row);
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
