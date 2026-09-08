import { z } from 'zod';
import { getVehicleBySlug, getVehicleCalendar } from '@/lib/data';

/**
 * GET /api/vehicle-calendar — which days this car can be had (plan 4.7, 6.4).
 *
 * The booking flow starts from a CAR now, so the first question is no longer
 * "which cars are free for these dates" but "when is this one free". The
 * answer is one row per day: how many units of the model are free that day.
 *
 * Read this before trusting a day cell: the per-day count is a HINT. Three
 * units — A free Mon–Wed, B free Wed–Fri — give every day a free unit while no
 * single unit covers Mon–Fri, and the exclusion constraint is per unit. The
 * calendar paints from these numbers; the RANGE the customer actually picks is
 * decided by /api/quote, which asks free_units() for that exact window. The UI
 * never decides availability (rule 5).
 *
 * Nothing internal leaves here: no plate, no unit status, no reservation, no
 * customer — only a count per day (plan 6.5).
 */

export const dynamic = 'force-dynamic';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

const schema = z
  .object({
    /* A slug from the page's URL, or an id when the caller already has one. */
    vehicle: z.string().min(1).max(120),
    from: day,
    to: day,
  })
  .refine((d) => d.to >= d.from, { message: 'to must not precede from', path: ['to'] });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })) },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { vehicle, from, to } = parsed.data;

  try {
    let vehicleId = UUID.test(vehicle) ? vehicle : null;
    if (!vehicleId) {
      const row = await getVehicleBySlug(vehicle);
      if (!row || row.published === false) {
        return Response.json({ ok: false, error: 'vehicle' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      vehicleId = row.id;
    }

    const calendar = await getVehicleCalendar({ vehicleId, from, to });
    if (!calendar?.ok) {
      return Response.json({ ok: false, error: 'vehicle' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    /* Availability changes the moment somebody else books, so this is never
       cached — the same rule /api/availability follows (plan 9.3). */
    return Response.json(calendar, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'server' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
