/**
 * Pricing engine — pure functions, shared by the booking widget (client),
 * Server Actions and the admin. All amounts in MAD.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function countDays(startAt, endAt) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  // Rental days: any started 24h period counts, with a 1h grace period.
  return Math.max(1, Math.ceil((end - start - 60 * 60 * 1000) / DAY_MS));
}

function seasonMultiplierFor(date, seasons = []) {
  const day = date.toISOString().slice(0, 10);
  const season = seasons.find((s) => s.active !== false && s.startDate <= day && day <= s.endDate);
  return season ? Number(season.multiplier) || 1 : 1;
}

export function tierDiscount(days, tiers = []) {
  const sorted = [...tiers].sort((a, b) => b.minDays - a.minDays);
  const tier = sorted.find((t) => days >= t.minDays);
  return tier ? Number(tier.discountPct) || 0 : 0;
}

/**
 * @param {object} p
 * @param {object} p.vehicle        { pricePerDay, deposit }
 * @param {string} p.startAt         ISO datetime
 * @param {string} p.endAt           ISO datetime
 * @param {Array}  p.seasons         [{ startDate, endDate, multiplier, active }]
 * @param {Array}  p.extras          catalogue [{ key, type, price }]
 * @param {Array}  p.selectedExtras  [{ key, qty }]
 * @param {object} p.settings        { pricingTiers, airportDeliveryFee, cityDeliveryFee, oneWayFee }
 * @param {string} p.pickupKey       agency | airport | station | address
 * @param {string} p.dropoffKey
 */
export function quote({ vehicle, startAt, endAt, seasons = [], extras = [], selectedExtras = [], settings = {}, pickupKey = 'agency', dropoffKey }) {
  const days = countDays(startAt, endAt);
  const basePerDay = Number(vehicle?.pricePerDay) || 0;
  if (!days || !basePerDay) {
    return { days, basePerDay, subtotal: 0, discountPct: 0, discountAmount: 0, seasonAdjustment: 0, extrasTotal: 0, extras: [], deliveryFee: 0, oneWayFee: 0, total: 0, deposit: Number(vehicle?.deposit) || 0, perDayEffective: 0 };
  }

  // Season-adjusted subtotal, day by day.
  let subtotal = 0;
  const start = new Date(startAt);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    subtotal += basePerDay * seasonMultiplierFor(d, seasons);
  }
  subtotal = Math.round(subtotal);
  const seasonAdjustment = subtotal - basePerDay * days;

  const discountPct = tierDiscount(days, settings.pricingTiers || []);
  const discountAmount = Math.round((subtotal * discountPct) / 100);

  const extraLines = selectedExtras
    .map(({ key, qty = 1 }) => {
      const def = extras.find((e) => e.key === key && e.active !== false);
      if (!def) return null;
      const unit = Number(def.price) || 0;
      const total = def.type === 'per_day' ? unit * days * qty : unit * qty;
      return { key, qty, type: def.type, unit, total, name: def.name };
    })
    .filter(Boolean);
  const extrasTotal = extraLines.reduce((s, l) => s + l.total, 0);

  const deliveryFee = pickupKey === 'airport' ? Number(settings.airportDeliveryFee) || 0 : pickupKey === 'address' ? Number(settings.cityDeliveryFee) || 0 : 0;
  const oneWayFee = dropoffKey && dropoffKey !== pickupKey ? Number(settings.oneWayFee) || 0 : 0;

  const total = subtotal - discountAmount + extrasTotal + deliveryFee + oneWayFee;
  return {
    days,
    basePerDay,
    subtotal,
    seasonAdjustment,
    discountPct,
    discountAmount,
    extras: extraLines,
    extrasTotal,
    deliveryFee,
    oneWayFee,
    total,
    deposit: Number(vehicle?.deposit) || 0,
    perDayEffective: Math.round(total / days),
  };
}

/** Booking reference: DC-YYMMDD-XXXX (unambiguous alphabet). */
export function makeReference(date = new Date()) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  const yymmdd = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `DC-${yymmdd}-${suffix}`;
}
