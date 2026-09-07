import { z } from 'zod';
import { getSettings, listSeasons, searchAvailability } from '@/lib/data';
import { quote } from '@/lib/pricing';

/**
 * GET /api/availability — the results page's only data source (plan 6.4, 9.3).
 *
 * Postgres answers "how many are free"; this route adds the money. Pricing
 * lives in one place (src/lib/pricing.js) and runs server-side here, so the
 * per-day figure a visitor sees is computed by the same code that will
 * snapshot the quote at booking time (CLAUDE.md rule 4: nothing appears later
 * that was not shown earlier).
 *
 * `no-store`: an availability answer is true for the moment it was asked and
 * must never be served from a cache (plan 9.3).
 */

export const dynamic = 'force-dynamic';

const isoish = z.string().min(10).refine((v) => !Number.isNaN(Date.parse(v)), 'not a date');

const schema = z
  .object({
    startAt: isoish,
    endAt: isoish,
    pickupLocationId: z.string().uuid().nullish(),
    dropoffLocationId: z.string().uuid().nullish(),
    pickup: z.enum(['agency', 'airport', 'station', 'address']).default('agency'),
    dropoff: z.enum(['agency', 'airport', 'station', 'address']).optional(),
    category: z.string().max(20).optional(),
    transmission: z.enum(['manual', 'automatic']).optional(),
    seats: z.coerce.number().int().min(1).max(9).optional(),
    freeOnly: z.enum(['1', '0']).optional(),
  })
  .refine((d) => Date.parse(d.endAt) > Date.parse(d.startAt), { message: 'endAt must be after startAt', path: ['endAt'] });

export async function GET(request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })) },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const d = parsed.data;

  try {
    const [rows, settings, seasons] = await Promise.all([
      searchAvailability({
        pickupLocationId: d.pickupLocationId || null,
        dropoffLocationId: d.dropoffLocationId || null,
        startAt: d.startAt,
        endAt: d.endAt,
      }),
      getSettings(),
      listSeasons(),
    ]);

    let vehicles = rows.map((r) => {
      /* quote() takes the app's vehicle shape; the RPC returns the availability
         shape. Only the fields pricing actually reads are mapped. */
      const q = quote({
        vehicle: { pricePerDay: Number(r.basePerDay) || 0, deposit: Number(r.deposit) || 0 },
        startAt: d.startAt,
        endAt: d.endAt,
        seasons,
        settings,
        pickupKey: d.pickup,
        dropoffKey: d.dropoff,
      });

      return {
        vehicleId: r.vehicleId,
        slug: r.slug,
        brand: r.brand,
        model: r.model,
        year: r.year,
        category: r.category,
        transmission: r.transmission,
        fuel: r.fuel,
        seats: r.seats,
        doors: r.doors,
        luggage: r.luggage,
        ac: r.ac,
        features: r.features || [],
        photoFolder: r.photoFolder,
        images: r.images || [],
        minDays: r.minDays,
        /* Availability — plan 6.5: the public sees free / last one / none and a
           next date. Internal unit statuses never appear in this payload. */
        unitsTotal: r.unitsTotal,
        unitsFree: r.unitsFree,
        lastOne: r.unitsFree === 1,
        available: r.unitsFree > 0,
        nextAvailableAt: r.nextAvailableAt || null,
        /* Money — rule 4: per day AND total for these dates, together. */
        days: q.days,
        basePerDay: q.basePerDay,
        perDayEffective: q.perDayEffective,
        subtotal: q.subtotal,
        discountPct: q.discountPct,
        total: q.total,
        deposit: q.deposit,
      };
    });

    if (d.category) vehicles = vehicles.filter((v) => v.category === d.category);
    if (d.transmission) vehicles = vehicles.filter((v) => v.transmission === d.transmission);
    if (d.seats) vehicles = vehicles.filter((v) => v.seats >= d.seats);
    if (d.freeOnly === '1') vehicles = vehicles.filter((v) => v.available);

    return Response.json(
      {
        ok: true,
        startAt: d.startAt,
        endAt: d.endAt,
        days: vehicles[0]?.days ?? null,
        count: vehicles.length,
        availableCount: vehicles.filter((v) => v.available).length,
        vehicles,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json({ ok: false, error: 'server' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
