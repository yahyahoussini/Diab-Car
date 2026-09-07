import { z } from 'zod';
import { getSettings, getVehicleBySlug, listExtras, listLocations, listSeasons, nextAvailable, searchAvailability } from '@/lib/data';
import { LOCATION_KEY_PATTERN, resolvePickup } from '@/lib/locations';
import { quote } from '@/lib/pricing';

/**
 * GET /api/quote — the full breakdown for one vehicle and one set of dates
 * (plan 6.4, 9.3).
 *
 * Everything the confirmation step will show: season adjustment, duration
 * discount, each extra as its own line, delivery, one-way, deposit. Rule 4
 * says the breakdown comes before confirmation and nothing may appear later
 * that was not shown here, so this response IS the contract — it is what gets
 * snapshotted into `reservations.quote`.
 *
 * Availability rides along, because a quote for a car you cannot have is a
 * trap.
 */

export const dynamic = 'force-dynamic';

const isoish = z.string().min(10).refine((v) => !Number.isNaN(Date.parse(v)), 'not a date');

const schema = z
  .object({
    vehicle: z.string().min(1).max(120),
    startAt: isoish,
    endAt: isoish,
    /* A location key (see src/lib/locations.js). */
    pickup: z.string().regex(LOCATION_KEY_PATTERN).optional(),
    dropoff: z.string().regex(LOCATION_KEY_PATTERN).optional(),
    /* Repeatable: ?extras=gps&extras=seat, or one comma-separated value. */
    extras: z.string().optional(),
    locale: z.enum(['fr', 'en', 'ar', 'es']).default('fr'),
  })
  .refine((d) => Date.parse(d.endAt) > Date.parse(d.startAt), { message: 'endAt must be after startAt', path: ['endAt'] });

export async function GET(request) {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams);
  const extrasParam = url.searchParams.getAll('extras');
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })) },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const d = parsed.data;
  const selected = (extrasParam.length > 1 ? extrasParam : String(d.extras || '').split(','))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key) => ({ key, qty: 1 }));

  try {
    const [vehicle, settings, seasons, extras, locations] = await Promise.all([
      getVehicleBySlug(d.vehicle),
      getSettings(),
      listSeasons(),
      listExtras(),
      listLocations(),
    ]);

    if (!vehicle || vehicle.published === false) {
      return Response.json({ ok: false, error: 'vehicle' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const q = quote({
      vehicle,
      startAt: d.startAt,
      endAt: d.endAt,
      seasons,
      extras,
      selectedExtras: selected,
      settings,
      pickupKey: resolvePickup(locations, d.pickup).feeKey,
      dropoffKey: d.dropoff ? resolvePickup(locations, d.dropoff).feeKey : undefined,
    });

    if (q.days < (vehicle.minDays || 1)) {
      return Response.json(
        { ok: false, error: 'min_days', minDays: vehicle.minDays || 1, days: q.days },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    /* One availability read for this car, from the same source the results
       page uses, so the two can never disagree. */
    const rows = await searchAvailability({ startAt: d.startAt, endAt: d.endAt });
    const row = rows.find((r) => r.slug === vehicle.slug || r.vehicleId === vehicle.id);
    const unitsFree = row?.unitsFree ?? 0;

    const locationName = (key) => {
      const { location } = resolvePickup(locations, key);
      return location?.name?.[d.locale] || location?.name?.fr || key;
    };

    return Response.json(
      {
        ok: true,
        vehicle: { id: vehicle.id, slug: vehicle.slug, brand: vehicle.brand, model: vehicle.model, category: vehicle.category, photoFolder: vehicle.photoFolder },
        startAt: d.startAt,
        endAt: d.endAt,
        pickup: { key: d.pickup, label: locationName(d.pickup) },
        dropoff: d.dropoff ? { key: d.dropoff, label: locationName(d.dropoff) } : null,
        availability: {
          unitsFree,
          available: unitsFree > 0,
          lastOne: unitsFree === 1,
          nextAvailableAt: unitsFree === 0 ? await nextAvailable({ vehicleId: vehicle.id, from: d.startAt }) : null,
        },
        /* The breakdown, line by line. Anything shown at confirmation must
           already be here (rule 4). */
        quote: {
          days: q.days,
          basePerDay: q.basePerDay,
          perDayEffective: q.perDayEffective,
          seasonAdjustment: q.seasonAdjustment,
          subtotal: q.subtotal,
          discountPct: q.discountPct,
          discountAmount: q.discountAmount,
          extras: q.extras,
          extrasTotal: q.extrasTotal,
          deliveryFee: q.deliveryFee,
          oneWayFee: q.oneWayFee,
          total: q.total,
          deposit: q.deposit,
          currency: 'MAD',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json({ ok: false, error: 'server' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
