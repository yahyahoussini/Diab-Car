'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/server';
import { getSettingsAdmin, updateSettings } from '@/lib/data';

/**
 * The agency's own record (plan 7.1 « Paramètres », 9.4).
 *
 * Six actions instead of one big save, because `save_settings()` patches
 * COLUMN BY COLUMN (supabase/migrations/0012): a payload that only carries the
 * opening hours leaves the ICE number alone. Splitting the form the same way
 * means two people editing two sections at the same minute cannot overwrite
 * each other, and the journal records "horaires" rather than "paramètres" for
 * a change that only moved a closing time.
 *
 * Every one of them is owner/manager. Settings are money and identity: an
 * agent may run the counter all day and never touch either (plan 7.2). The
 * page already redirects them; this is the half that survives someone calling
 * the action directly.
 *
 * `updateSettings` is a THROWING write — it returns the saved row or raises an
 * Error whose `.code` is the RPC's refusal. Every action funnels through
 * `commit()` so that refusal reaches the operator as a French sentence instead
 * of an error boundary.
 */

/* Not one of ours: the RPC would have to invent a value, so say so plainly. */
const MESSAGES = {
  FORBIDDEN: 'Votre rôle ne permet pas de modifier les paramètres.',
  REASON_REQUIRED: 'Un motif est obligatoire : chaque modification est inscrite au journal.',
  NOT_FOUND: 'La fiche paramètres est introuvable en base.',
  INVALID_VALUE: 'Une valeur a été refusée par la base de données.',
  VALIDATION: 'Certains champs sont invalides — corrigez-les avant d’enregistrer.',
  BAD_HOURS: 'Une plage horaire ferme avant d’ouvrir.',
  EMPTY_CLAIM: 'On ne peut pas marquer « vérifié » un chiffre qui n’existe pas.',
  NO_PAYMENT_METHOD: 'Indiquez au moins un moyen de paiement accepté.',
  SERVER: 'Enregistrement impossible pour le moment.',
};

function refuse(code, extra) {
  return { ok: false, error: code, message: MESSAGES[code] || MESSAGES.SERVER, ...extra };
}

/**
 * Drop the keys the operator did not fill.
 *
 * `save_settings()` coalesces a missing key to the current value, so an absent
 * key is "leave it alone" and an empty string is "clear it" — two different
 * intentions that must stay different. `null`/`undefined` are the ones that
 * would blank a column in the demo adapter (a plain object spread) while doing
 * nothing at all in Postgres, so they never leave here.
 */
function compact(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

async function commit(patch, reason) {
  try {
    await updateSettings(compact(patch), reason);
    /* One revalidation for the whole tree: the footer, the legal pages, the
       LocalBusiness markup and the contact block all read settings, and they
       live under different layouts. */
    revalidatePath('/', 'layout');
    return { ok: true, at: Date.now() };
  } catch (error) {
    const code = error?.code;
    if (code && MESSAGES[code]) return refuse(code);
    console.error('[settings]', error);
    return refuse('SERVER');
  }
}

function invalid(parsed) {
  const fieldErrors = {};
  for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.code;
  return refuse('VALIDATION', { fieldErrors });
}

/* ------------------------------------------------------------------ pieces */

const reasonField = z.string().trim().min(3).max(200);
const text = (max) => z.string().trim().max(max).default('');
/* Loose on purpose: the field holds what the agency prints on its cards, and
   the E.164 normalisation belongs to whoever dials it, not to the form. */
const phone = z.union([z.string().trim().regex(/^\+?[\d\s().-]{8,20}$/), z.literal('')]).default('');
const link = z.union([z.url().max(400), z.literal('')]).default('');
const i18n = (max) =>
  z.object({ fr: text(max), en: text(max), ar: text(max), es: text(max) });

/* ------------------------------------------------------------------ agence */

const agencySchema = z.object({
  name: z.string().trim().min(1).max(80),
  legalName: text(120),
  tagline: i18n(200),
  phonePrimary: phone,
  phoneSecondary: phone,
  phoneLandline: phone,
  whatsapp: phone,
  email: z.union([z.email().max(160), z.literal('')]).default(''),
  addressLine: text(180),
  city: text(80),
  postalCode: text(12),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  googleMapsUrl: link,
  gbpUrl: link,
  facebookUrl: link,
  instagramUrl: link,
  tiktokUrl: link,
  reason: reasonField,
});

/**
 * The NAP block (plan 8): name, address, phone. It is copied verbatim into the
 * footer, the schema.org LocalBusiness node and the Google Business Profile,
 * so a typo here is a typo in four places at once.
 */
export async function saveAgency(input) {
  await requireRole(['owner', 'manager']);
  const parsed = agencySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason, ...fields } = parsed.data;
  return commit(fields, reason);
}

/* ----------------------------------------------------------------- horaires */

/* Not exported: a 'use server' module may only export async functions, so the
   editor keeps its own copy of the list. */
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const hoursSchema = z.object({
  hours: z
    .array(
      z.object({
        days: z.array(z.enum(WEEK_DAYS)).min(1).max(7),
        opens: z.string().regex(/^\d{2}:\d{2}$/),
        closes: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(14)
    .default([]),
  airportService24h: z.boolean(),
  reason: reasonField,
});

/**
 * Opening hours as a LIST of bands, not one pair of times.
 *
 * An agency that closes between 12h30 and 14h30 has two bands on the same day,
 * and the single-band form that shipped before could not describe it — it just
 * told visitors and Google that the counter was open through lunch. The shape
 * `[{days, opens, closes}]` is the one openingHoursSpecification expects, so
 * the truth and the markup are the same object.
 */
export async function saveHours(input) {
  await requireRole(['owner', 'manager']);
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason, hours, airportService24h } = parsed.data;

  for (const [index, band] of hours.entries()) {
    /* `00:00` is midnight at the END of the day — a counter open 20h–00h is a
       real band, so it is the only closing time allowed to sort before its
       opening. */
    if (band.closes !== '00:00' && band.closes <= band.opens) {
      return refuse('BAD_HOURS', { index });
    }
  }

  /* Days are deduplicated and put back in week order so two bands written in a
     different order still read the same in the footer. */
  const normalised = hours.map((band) => ({
    days: WEEK_DAYS.filter((day) => band.days.includes(day)),
    opens: band.opens,
    closes: band.closes,
  }));

  return commit({ hours: normalised, airportService24h }, reason);
}

/* -------------------------------------------------------------------- légal */

const legalSchema = z.object({
  rc: text(40),
  ice: text(40),
  capitalMad: z.number().min(0).max(1e12).nullable().default(null),
  foundedYear: z.number().int().min(1900).max(2200).nullable().default(null),
  cndpReceipt: text(60),
  reason: reasonField,
});

/**
 * Registry facts and the CNDP receipt (plan 9.4).
 *
 * The receipt number is the proof that Diab Car declared its processing of
 * personal data to the CNDP; loi 09-08 requires it to be DISPLAYED on the
 * forms and the legal pages, which is why it is a settings field and not a
 * hard-coded string. Empty means "not declared yet" and the public pages hide
 * the line rather than print a blank (rule 11).
 */
export async function saveLegal(input) {
  await requireRole(['owner', 'manager']);
  const parsed = legalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason, ...fields } = parsed.data;

  /* A founding year in the future is not a typo worth keeping: it would print
     "depuis 2031" in the footer. */
  const thisYear = new Date().getUTCFullYear();
  if (fields.foundedYear && fields.foundedYear > thisYear) return refuse('VALIDATION', { fieldErrors: { foundedYear: 'too_big' } });

  return commit(fields, reason);
}

/* ----------------------------------------------------------------- confiance */

const trustSchema = z.object({
  googleRating: z.number().min(0).max(5).nullable().default(null),
  googleReviewCount: z.number().int().min(0).max(1000000).nullable().default(null),
  verifiedClaims: z.object({
    googleRating: z.boolean(),
    reviewCount: z.boolean(),
    foundedYear: z.boolean(),
  }),
  reason: reasonField,
});

/**
 * The three numbers a visitor is asked to believe (rule 11).
 *
 * The flags are not a display preference. `public_settings` NULLs any claim
 * whose flag is not exactly `true`, in SQL — so an unverified rating cannot
 * reach a visitor even through a component that forgot to check, and unticking
 * a box removes the number from the live site on the next request.
 *
 * The guard below is the other direction: a tick on a claim with no number
 * would be a promise about nothing, so it is refused here rather than saved
 * and quietly ignored by the view.
 */
export async function saveTrust(input) {
  await requireRole(['owner', 'manager']);
  const parsed = trustSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason, googleRating, googleReviewCount, verifiedClaims } = parsed.data;

  /* Checked against what the row will actually HOLD after this write, not
     against the form: an empty box means "leave it alone", so a tick on a
     rating already in the database is legitimate, and foundedYear belongs to
     the Légal section and never travels in this payload at all. */
  const current = await getSettingsAdmin();
  const rating = googleRating ?? current?.googleRating ?? null;
  const count = googleReviewCount ?? current?.googleReviewCount ?? null;
  const missing = [];
  if (verifiedClaims.googleRating && !(rating > 0)) missing.push('googleRating');
  if (verifiedClaims.reviewCount && !(count > 0)) missing.push('reviewCount');
  if (verifiedClaims.foundedYear && !current?.foundedYear) missing.push('foundedYear');
  if (missing.length) return refuse('EMPTY_CLAIM', { missing });

  return commit({ googleRating, googleReviewCount, verifiedClaims }, reason);
}

/* ---------------------------------------------------------------------- SLA */

const slaSchema = z.object({ sla: i18n(240), reason: reasonField });

/** The response-time promise, in the four languages it is promised in. */
export async function saveSla(input) {
  await requireRole(['owner', 'manager']);
  const parsed = slaSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  return commit({ sla: parsed.data.sla }, parsed.data.reason);
}

/* -------------------------------------------------------------- exploitation */

const PAYMENT_METHODS = ['cash', 'card'];

const operationsSchema = z.object({
  /* 0 disables the sweep; a week is the longest a request may sit unanswered
     before the setting is a bug rather than a policy. */
  autoExpireHours: z.number().int().min(0).max(168),
  cleaningMinutes: z.number().int().min(0).max(1440),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length),
  /* Recorded by hand until a backup job writes it (plan 9.2: weekly pg_dump
     from CI). '' means "leave it", and save_settings() keeps the old value. */
  lastBackupAt: z.string().max(40).optional().default(''),
  reason: reasonField,
});

/**
 * The two clocks the fleet runs on, and what the counter accepts.
 *
 * Both numbers are read by Postgres, not by a component:
 * `expire_unconfirmed_reservations()` and `refresh_cleaning_blocks()` select
 * them from the row each time they run (supabase/migrations/0012). Changing
 * one here changes what the next sweep does, with no deploy.
 */
export async function saveOperations(input) {
  await requireRole(['owner', 'manager']);
  const parsed = operationsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed);
  const { reason, ...fields } = parsed.data;

  /* An agency that accepts nothing cannot rent a car; an empty array here
     would silently empty the payment line on the funnel. */
  if (fields.paymentMethods.length === 0) return refuse('NO_PAYMENT_METHOD');

  return commit(fields, reason);
}
