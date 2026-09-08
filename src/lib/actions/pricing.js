'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/server';
import {
  deleteExtra,
  deleteLocation,
  deleteSeason,
  updateSettings,
  upsertExtra,
  upsertLocation,
  upsertSeason,
} from '@/lib/data';
import { CATEGORIES } from '@/lib/constants';

/**
 * The money desk (plan 7.1, 6.4).
 *
 * Everything here changes a number that a customer will be quoted, so three
 * rules run through the whole file:
 *
 *  1. `owner|manager` only, checked again on every action. The page guard is
 *     the door; this is the lock (plan 7.2).
 *  2. Every write carries a REASON. Postgres refuses a blank one
 *     (REASON_REQUIRED in 0012) and the reason is written to `audit_log` in
 *     the same transaction as the change — so a price that moved always has a
 *     sentence next to it in the Journal.
 *  3. `revalidatePath('/', 'layout')` after every success. A season, a tier or
 *     a delivery fee is read by the booking module, the results page, every
 *     vehicle page and the JSON-LD offer — there is no single route to
 *     invalidate, so the whole tree goes.
 *
 * The actions RETURN their outcome with a French sentence already attached.
 * The adapters speak in codes (REASON_REQUIRED, KEY_TAKEN, BAD_DATES…), the
 * operator does not, and translating in one place keeps the same refusal from
 * being worded three different ways in three components.
 */

const PRICING_ROLES = ['owner', 'manager'];

const MESSAGES = {
  FORBIDDEN: 'Votre rôle ne permet pas de modifier les tarifs.',
  REASON_REQUIRED: 'Le motif est obligatoire : il part au Journal avec la modification.',
  BAD_DATES: 'La date de fin doit être postérieure ou égale à la date de début.',
  KEY_REQUIRED: 'La clé est obligatoire.',
  KEY_TAKEN: 'Cette clé est déjà prise par une autre ligne.',
  SLUG_TAKEN: 'Cette clé est déjà prise par une autre ligne.',
  INVALID_VALUE: 'Une valeur est refusée par la base de données.',
  NOT_FOUND: 'Cette ligne n’existe plus : rechargez la page.',
  VALIDATION: 'Formulaire incomplet ou valeur hors limites.',
  RPC_FAILED: 'Enregistrement refusé par la base de données.',
  SERVER: 'Enregistrement impossible. Réessayez, puis prévenez Yahya si cela persiste.',
};

const describe = (code) => MESSAGES[code] || MESSAGES.SERVER;

function refuse(code, text) {
  return { ok: false, error: code, message: text || describe(code) };
}

function invalid(parsed) {
  const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')).filter(Boolean))];
  return {
    ok: false,
    error: 'VALIDATION',
    fields,
    message: fields.length ? `Champs invalides : ${fields.join(', ')}.` : MESSAGES.VALIDATION,
  };
}

/* Seasons, tiers, extras, deposits, delivery fees and the misc fees are all
   quoted on the public site, so nothing here is narrower than the whole tree. */
function revalidate() {
  revalidatePath('/', 'layout');
  revalidatePath('/admin/tarifs');
}

/**
 * Run a THROWING write (upsert*, updateSettings).
 *
 * `err.code` is the RPC's own refusal string; anything without one is a real
 * fault and reads as SERVER rather than being shown raw to the operator.
 */
async function write(run) {
  try {
    const row = await run();
    revalidate();
    return { ok: true, row: row ?? null };
  } catch (error) {
    return refuse(error?.code || 'SERVER');
  }
}

/**
 * Run a DELETE.
 *
 * The two adapters disagree by design — the demo store returns `true` or
 * `{ok:true}`, `admin_delete()` throws its refusal through `rpcRow` — so both
 * shapes are normalised here instead of at six call sites.
 */
async function remove(run) {
  try {
    const result = await run();
    if (result && result.ok === false) return refuse(result.error || 'RPC_FAILED');
    revalidate();
    return { ok: true };
  } catch (error) {
    return refuse(error?.code || 'SERVER');
  }
}

/* ------------------------------------------------------------------ schemas */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Rows are uuid in Postgres and `s-summer` style in the demo store, so an id
   is validated as "a short opaque string" — the same tolerance customers.js
   uses. It is never parsed, only passed back to the row it came from. */
const id = z.uuid().or(z.string().trim().min(1).max(64));

/* min(4): a one-character motive is a blank one with extra steps, and the
   Journal is read months later by someone who was not in the room. */
const reason = z.string().trim().min(4).max(200);

const name4 = z.object({
  fr: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).optional().default(''),
  ar: z.string().trim().max(120).optional().default(''),
  es: z.string().trim().max(120).optional().default(''),
});

const seasonSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(80),
  startDate: z.string().regex(DATE),
  endDate: z.string().regex(DATE),
  multiplier: z.number().min(0.1).max(5),
  active: z.boolean().default(true),
  reason,
});

const extraSchema = z.object({
  id: id.optional(),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/),
  type: z.enum(['per_day', 'flat']),
  price: z.number().min(0).max(100000),
  active: z.boolean().default(true),
  name: name4,
  reason,
});

const locationSchema = z.object({
  id: id.optional(),
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(),
  kind: z.enum(['agency', 'airport', 'district', 'city', 'custom']),
  city: z.string().trim().max(80).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  name: name4,
  /* null is a value here, not a missing one: "sur devis". Zero would promise
     a free delivery nobody agreed to (CLAUDE.md rule 11). */
  deliveryFee: z.number().min(0).max(100000).nullable().default(null),
  is24h: z.boolean().nullable().default(null),
  sort: z.number().int().min(0).max(9999).default(100),
  active: z.boolean().default(true),
  reason,
});

const tiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        minDays: z.number().int().min(1).max(365),
        discountPct: z.number().min(0).max(90),
      }),
    )
    .max(10),
  reason,
});

const depositsSchema = z.object({
  /* An array, not a record: a category with no default must be ABSENT from the
     saved object, and `depositFor()` reads a missing key as "no deposit
     configured". An object shape would tempt a caller into sending zeros. */
  deposits: z.array(z.object({ category: z.enum(CATEGORIES), amount: z.number().min(0).max(1000000) })).max(20),
  reason,
});

const feesSchema = z.object({
  airportDeliveryFee: z.number().min(0).max(100000),
  cityDeliveryFee: z.number().min(0).max(100000),
  oneWayFee: z.number().min(0).max(100000),
  monthlyFrom: z.object({
    economy: z.number().min(0).max(1000000),
    suv: z.number().min(0).max(1000000),
    premium: z.number().min(0).max(1000000),
  }),
  freeCancellationHours: z.number().int().min(0).max(720),
  depositReleaseDays: z.number().int().min(0).max(90),
  minAge: z.number().int().min(18).max(40),
  premiumMinAge: z.number().int().min(18).max(60),
  minLicenseYears: z.number().int().min(0).max(20),
  fuelPolicy: z.enum(['full-to-full', 'same-to-same']),
  eurRate: z.number().min(1).max(100),
  reason,
});

/* ------------------------------------------------------------------ seasons */

export async function saveSeason(input) {
  await requireRole(PRICING_ROLES);

  const parsed = seasonSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason: why, ...season } = parsed.data;

  /* Postgres refuses this too (BAD_DATES in save_season). Refusing it here as
     well means the operator is told before the round trip, and the database
     stays the authority rather than the error message. */
  if (season.endDate < season.startDate) return refuse('BAD_DATES');

  return write(() => upsertSeason(season, why));
}

export async function removeSeason({ id: seasonId, reason: why } = {}) {
  await requireRole(PRICING_ROLES);

  const parsed = z.object({ id, reason }).safeParse({ id: seasonId, reason: why });
  if (!parsed.success) return invalid(parsed);

  return remove(() => deleteSeason(parsed.data.id, parsed.data.reason));
}

/* ------------------------------------------------------------------- extras */

export async function saveExtra(input) {
  await requireRole(PRICING_ROLES);

  const parsed = extraSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason: why, ...extra } = parsed.data;

  return write(() => upsertExtra(extra, why));
}

export async function removeExtra({ id: extraId, reason: why } = {}) {
  await requireRole(PRICING_ROLES);

  const parsed = z.object({ id, reason }).safeParse({ id: extraId, reason: why });
  if (!parsed.success) return invalid(parsed);

  return remove(() => deleteExtra(parsed.data.id, parsed.data.reason));
}

/* ---------------------------------------------------------------- locations */

export async function saveLocation(input) {
  await requireRole(PRICING_ROLES);

  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason: why, ...place } = parsed.data;

  const payload = {
    id: place.id,
    key: place.key,
    /* One place, one identifier: save_location() falls back to the key when no
       slug is sent, so passing them apart would be the only way they could
       ever drift. */
    slug: place.slug || place.key,
    kind: place.kind,
    city: place.city || null,
    address: place.address || null,
    name: place.name,
    is24h: place.is24h,
    sort: place.sort,
    active: place.active,
    /* Both spellings on purpose. `save_location()` reads `deliveryFeeMad` (the
       column is delivery_fee_mad); the demo store and the booking module read
       `deliveryFee`. Sending one only makes the fee disappear on one of the
       two backends — see the note in the prompt-12 report. */
    deliveryFee: place.deliveryFee,
    deliveryFeeMad: place.deliveryFee,
  };

  return write(() => upsertLocation(payload, why));
}

export async function removeLocation({ id: locationId, reason: why } = {}) {
  await requireRole(PRICING_ROLES);

  const parsed = z.object({ id, reason }).safeParse({ id: locationId, reason: why });
  if (!parsed.success) return invalid(parsed);

  return remove(() => deleteLocation(parsed.data.id, parsed.data.reason));
}

/* -------------------------------------------------------------------- tiers */

export async function saveTiers(input) {
  await requireRole(PRICING_ROLES);

  const parsed = tiersSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);

  const tiers = [...parsed.data.tiers].sort((a, b) => a.minDays - b.minDays);

  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].minDays === tiers[i - 1].minDays) {
      return refuse('INVALID_VALUE', `Deux paliers démarrent à ${tiers[i].minDays} jours : la remise appliquée serait indéterminée.`);
    }
    /* `tierDiscount()` picks the tier with the HIGHEST minDays the rental
       reaches, not the best discount. A 30-day palier at 5 % behind a 7-day
       palier at 10 % would therefore make a month CHEAPER to book as a week —
       refused here rather than discovered by a customer. */
    if (tiers[i].discountPct < tiers[i - 1].discountPct) {
      return refuse(
        'INVALID_VALUE',
        `Le palier ${tiers[i].minDays} jours remise moins que le palier ${tiers[i - 1].minDays} jours : une location plus longue coûterait plus cher.`,
      );
    }
  }

  return write(() => updateSettings({ pricingTiers: tiers }, parsed.data.reason));
}

/* ----------------------------------------------------------------- deposits */

export async function saveDeposits(input) {
  await requireRole(PRICING_ROLES);

  const parsed = depositsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);

  /* A category left blank is dropped, not zeroed: `depositFor()` reads the
     absence as "no default for this class" and the car's own figure — which
     always wins anyway — stays the only number in play. */
  const depositByCategory = {};
  for (const { category, amount } of parsed.data.deposits) {
    if (amount > 0) depositByCategory[category] = amount;
  }

  return write(() => updateSettings({ depositByCategory }, parsed.data.reason));
}

/* --------------------------------------------------------------------- fees */

export async function saveFees(input) {
  await requireRole(PRICING_ROLES);

  const parsed = feesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason: why, ...patch } = parsed.data;

  if (patch.premiumMinAge < patch.minAge) {
    return refuse('INVALID_VALUE', 'L’âge minimum premium ne peut pas être inférieur à l’âge minimum général.');
  }

  return write(() => updateSettings(patch, why));
}
