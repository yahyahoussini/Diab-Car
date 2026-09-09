import { z } from 'zod';
import { getSettings, listExtras, listLocations } from '@/lib/data';
import { deliveryFeeFor } from '@/lib/pricing';
import { resolvePickup } from '@/lib/locations';

/**
 * GET /api/booking-options — the catalogue step 2 of the booking pop-up is
 * built from (plan 6.2, owner's Sept 2026 flow).
 *
 * The owner's requirement was "from the admin dashboard I can set the delivery
 * destinations with the price, and other options I can add later". That is
 * only true if the pop-up READS the catalogue instead of being written against
 * it: a new place or a new option added on /admin/tarifs has to appear for
 * customers without anyone shipping code. So the two lists come from the
 * database at open time, and the component renders whatever it is handed.
 *
 * Every fee is resolved through `deliveryFeeFor()` — the same function
 * `quote()` uses — rather than read straight off the row. `locations.
 * delivery_fee_mad` is not the price on its own: null falls back to the
 * category default and, failing that, means « sur devis ». Reading the column
 * directly is exactly how a screen ends up promising 0 MAD for a delivery the
 * quote then charges 300 for, which rule 4 forbids.
 *
 * Public data only: a place's public name, city and fee, and an option's name
 * and price — the same facts already printed on the vehicle page. No customer
 * data, no internal columns (plan 6.5).
 */

export const dynamic = 'force-dynamic';

const schema = z.object({ locale: z.enum(['fr', 'en', 'ar', 'es']).default('fr') });

/** The place list, agency first, then everything the agency delivers to. */
const KIND_ORDER = { agency: 0, airport: 1, district: 2, city: 3, custom: 4, address: 5 };

export async function GET(request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ ok: false, error: 'validation' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const { locale } = parsed.data;
  const name = (row) => row?.name?.[locale] || row?.name?.fr || row?.key || '';

  try {
    const [locations, extras, settings] = await Promise.all([listLocations(), listExtras(), getSettings()]);

    const places = locations
      .filter((l) => l.active !== false)
      .map((l) => {
        const { feeKey } = resolvePickup(locations, l.key);
        const fee = deliveryFeeFor(l, feeKey, settings);
        return {
          key: l.key,
          kind: l.kind || 'custom',
          city: l.city || null,
          /* Already on the public contact page and in the local-business
             structured data — a street the customer is being asked to drive to
             is not a secret (plan 6.5). */
          address: l.address || null,
          name: name(l),
          /* What the customer will actually be charged, not what the column
             happens to hold. */
          fee: fee.onRequest ? null : fee.amount,
          onRequest: fee.onRequest,
        };
      })
      .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name, locale));

    const options = extras
      .filter((e) => e.active !== false)
      .map((e) => ({ key: e.key, name: name(e), type: e.type === 'flat' ? 'flat' : 'per_day', price: Number(e.price) || 0 }));

    return Response.json(
      { ok: true, places, options, minAge: settings?.minAge ?? null },
      /* Short and shared: the catalogue changes when the owner edits it, not
         per visitor, but a price correction must not sit in a CDN for an hour
         while the quote endpoint already charges the new figure. */
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch {
    return Response.json({ ok: false, error: 'server' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
