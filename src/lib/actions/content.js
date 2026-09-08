'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/server';
import { deleteFaq, deletePost, deleteReview, upsertFaq, upsertReview } from '@/lib/data';
import { LOCALES } from '@/lib/constants';
import { slugify } from '@/lib/format';

/**
 * Content writes: the answer database, the reviews, the blog list (plan 7.1,
 * 8.4, 8.5).
 *
 * Staff-wide on purpose. Content is not money: the agent who hears the same
 * question at the counter three times a day is exactly the person who should
 * be able to write the answer, and plan 7.2 puts prices and settings — not
 * content — behind the pricing roles.
 *
 * Every function RETURNS its outcome. The RPCs behind FAQs and reviews throw
 * on a refusal (`err.code` carries the SQL error string) while the demo store
 * never throws at all, so both shapes are flattened here into the one result
 * object the client renders.
 */

const MESSAGES = {
  VALIDATION: 'Formulaire incomplet : vérifiez les champs signalés.',
  QUESTION_REQUIRED: 'La question en français est obligatoire.',
  ANSWER_REQUIRED: 'La réponse courte en français est obligatoire : c’est le bloc de réponse repris par Google et les moteurs IA.',
  SLUG_TAKEN: 'Ce slug est déjà utilisé par une autre question. Changez-le ou laissez le champ vide.',
  KEY_TAKEN: 'Cette clé est déjà utilisée.',
  AUTHOR_REQUIRED: 'Le nom affiché est obligatoire.',
  TEXT_REQUIRED: 'Le texte de l’avis est obligatoire.',
  VEHICLE_REQUIRED: 'Un véhicule doit être choisi.',
  INVALID_VALUE: 'Une des valeurs envoyées est refusée par la base.',
  BAD_DATES: 'Les dates envoyées sont incohérentes.',
  REASON_REQUIRED: 'Un motif est obligatoire pour cette opération.',
  FORBIDDEN: 'Votre rôle ne permet pas cette modification.',
  NOT_FOUND: 'Cette ligne n’existe plus — rechargez la page.',
  SERVER: 'Enregistrement impossible. Réessayez, puis prévenez Yahya si cela se reproduit.',
};

/** French sentence for an RPC error string; never the bare code. */
function describe(code) {
  return MESSAGES[code] || `Refusé par la base : ${code}.`;
}

function refused(code) {
  return { ok: false, error: code, message: describe(code) };
}

/**
 * FAQs and reviews are public content. Any change to one of them — publishing,
 * unpublishing, or just correcting a price inside an answer — shows on the
 * homepage, the vehicle pages, the airport page and inside the FAQPage
 * JSON-LD, so the whole tree is revalidated instead of a guessed list of
 * routes.
 */
function revalidateSite() {
  revalidatePath('/', 'layout');
}

/**
 * The two adapters answer a delete differently: Postgres returns
 * `{ ok, deleted }` (and throws when the row was already gone), the demo store
 * returns `true`. Both mean the same thing to the operator, so the shape is
 * flattened here — neither adapter belongs to this prompt.
 */
const removed = (result) => result === true || result?.ok === true;

/* ------------------------------------------------------------------ shared */

/** An i18n field is one string per language; a missing language is empty, never absent. */
const i18nText = (max) =>
  z.object(Object.fromEntries(LOCALES.map((l) => [l, z.string().trim().max(max).optional().default('')])));

/* Demo ids are `f-1`, `r-3`; Supabase ids are uuids. Both are accepted, the
   same way the customer actions do it. */
const rowId = z.uuid().or(z.string().min(1).max(64));

const optionalId = z.union([rowId, z.literal('')]).optional().default('');

/* --------------------------------------------------------------------- FAQ */

const faqSchema = z.object({
  id: optionalId,
  slug: z.string().trim().max(120).optional().default(''),
  category: z.string().trim().min(1).max(40).default('general'),
  citySlug: z.string().trim().max(80).optional().default(''),
  vehicleId: optionalId,
  question: i18nText(300),
  shortAnswer: i18nText(600),
  longAnswer: i18nText(6000),
  sort: z.coerce.number().int().min(0).max(9999).default(100),
  published: z.boolean().default(false),
});

/**
 * Save one question of the answer database (plan 8.5).
 *
 * Two French fields are required beyond what the table itself demands: the
 * question and the SHORT answer. The short answer is the point of the row — it
 * is the block Google and the answer engines lift — and a question published
 * without one adds a heading to the FAQ page and nothing else.
 *
 * The other three languages are deliberately NOT required. Sixty verified
 * French answers are worth more than sixty half-translated ones, and the
 * editor shows per-language completeness so the gaps stay visible instead of
 * being filled to satisfy a validator.
 */
export async function saveFaq(input) {
  await requireAdmin();

  const parsed = faqSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.code;
    return { ...refused('VALIDATION'), fieldErrors };
  }
  const d = parsed.data;

  if (!d.question.fr) return refused('QUESTION_REQUIRED');
  if (!d.shortAnswer.fr) return refused('ANSWER_REQUIRED');

  const payload = {
    id: d.id || undefined,
    slug: d.slug ? slugify(d.slug) : null,
    category: d.category,
    citySlug: d.citySlug ? slugify(d.citySlug) : null,
    vehicleId: d.vehicleId || null,
    question: d.question,
    shortAnswer: d.shortAnswer,
    longAnswer: d.longAnswer,
    /* `answer` is the starter's single field and it is still what the public
       accordion, the homepage section and the FAQPage JSON-LD read. Postgres
       already mirrors longAnswer into it inside save_faq(); sending it here
       does the same for the demo store, so `npm run dev` with no Supabase
       shows the answer it has just saved (rule 12). */
    answer: d.longAnswer,
    sort: d.sort,
    /* Same mismatch the other way round: the RPC reads `sort`, the demo store
       keeps `sortOrder`. */
    sortOrder: d.sort,
    published: d.published,
  };

  try {
    const saved = await upsertFaq(payload);
    revalidateSite();
    return { ok: true, id: saved?.id || d.id || null };
  } catch (err) {
    return refused(err?.code || 'SERVER');
  }
}

export async function removeFaq(input) {
  await requireAdmin();

  const parsed = z.object({ id: rowId }).safeParse(input);
  if (!parsed.success) return refused('VALIDATION');

  try {
    const result = await deleteFaq(parsed.data.id);
    if (!removed(result)) return refused(result?.error || 'NOT_FOUND');
    revalidateSite();
    return { ok: true };
  } catch (err) {
    return refused(err?.code || 'SERVER');
  }
}

/* -------------------------------------------------------------------- avis */

const reviewSchema = z.object({
  id: optionalId,
  authorName: z.string().trim().min(1).max(80),
  rating: z.coerce.number().int().min(1).max(5),
  lang: z.enum(LOCALES),
  /* `google` = copied from the Google Business Profile, `manual` = written
     down from something a customer said at the counter or on WhatsApp.
     Nothing else exists: the site never authors a review (rule 11). */
  source: z.enum(['google', 'manual']),
  text: z.string().trim().min(1).max(2000),
  vehicleId: optionalId,
  city: z.string().trim().max(80).optional().default(''),
  published: z.boolean().default(false),
  isSample: z.boolean().default(false),
  externalId: z.string().trim().max(120).optional().default(''),
});

/**
 * Save one review (plan 8.4).
 *
 * Stored exactly as the operator typed it, author name included. The editor
 * SHOWS the "prénom + initiale" convention and offers to apply it, but this
 * function rewrites nothing: a review is a quotation, and a review section
 * that quietly edits its quotations has stopped being evidence.
 */
export async function saveReview(input) {
  await requireAdmin();

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.code;
    return { ...refused('VALIDATION'), fieldErrors };
  }
  const d = parsed.data;

  try {
    const saved = await upsertReview({
      id: d.id || undefined,
      authorName: d.authorName,
      rating: d.rating,
      lang: d.lang,
      source: d.source,
      text: d.text,
      vehicleId: d.vehicleId || null,
      city: d.city || null,
      published: d.published,
      isSample: d.isSample,
      externalId: d.externalId || null,
    });
    revalidateSite();
    return { ok: true, id: saved?.id || d.id || null };
  } catch (err) {
    return refused(err?.code || 'SERVER');
  }
}

export async function removeReview(input) {
  await requireAdmin();

  const parsed = z.object({ id: rowId }).safeParse(input);
  if (!parsed.success) return refused('VALIDATION');

  try {
    const result = await deleteReview(parsed.data.id);
    if (!removed(result)) return refused(result?.error || 'NOT_FOUND');
    revalidateSite();
    return { ok: true };
  } catch (err) {
    return refused(err?.code || 'SERVER');
  }
}

/* -------------------------------------------------------------------- blog */

/**
 * Delete an article.
 *
 * Used as a form action, so React passes the bound `{ id }` first and the
 * FormData second; the second argument is ignored on purpose — the id comes
 * from the server render, never from a field the page could carry.
 */
export async function removePost(input) {
  await requireAdmin();

  const parsed = z.object({ id: rowId }).safeParse(input);
  if (!parsed.success) return refused('VALIDATION');

  try {
    const result = await deletePost(parsed.data.id);
    if (!removed(result)) return refused(result?.error || 'NOT_FOUND');
    revalidateSite();
    return { ok: true };
  } catch (err) {
    return refused(err?.code || 'SERVER');
  }
}
