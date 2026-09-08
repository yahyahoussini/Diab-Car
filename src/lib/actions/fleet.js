'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireRole } from '@/lib/auth/server';
import { deleteVehiclePhoto, reorderVehiclePhotos, saveVehiclePhoto, upsertVehicle } from '@/lib/data';
import { CAR_IMAGES, CATEGORIES, FEATURES, FUELS, LOCALES, TRANSMISSIONS } from '@/lib/constants';
import { slugify } from '@/lib/format';

/**
 * The fleet catalogue: models and their photos (plan 7.1).
 *
 * Two write shapes, and the difference is deliberate. `save_vehicle` THROWS on
 * a refusal — a taken slug, a value the check constraints reject — because
 * there is nothing for the operator to decide beyond fixing the form. The
 * photo RPCs return their outcome, because "cette photo n'existe plus" is
 * information the gallery has to render, not a crash.
 *
 * Everything a photo needs to exist is produced in the BROWSER (canvas resize,
 * WebP + JPEG, blur) and uploaded straight to Storage — these actions only
 * write the INDEX row that points at the bytes (plan 2.5, rule 9). That is why
 * `savePhoto` never touches a file: by the time it runs, the bytes are already
 * in the bucket.
 */

/* Not exported: a 'use server' module may only export async functions, so the
   editor keeps its own copy of these lists with its French labels. */
const PURPOSE_TAGS = ['city', 'family', 'suv', 'business', 'premium'];
const ANGLES = ['front', 'side', 'rear', 'interior', 'dash'];

/** Demo mode hands out ids like `v-dacia-logan-diesel`; Postgres hands out uuids. */
const idish = z.uuid().or(z.string().trim().min(1).max(64));

const i18nText = (max) =>
  z.object(Object.fromEntries(LOCALES.map((l) => [l, z.string().max(max).optional().default('')])));

const MESSAGES = {
  SLUG_TAKEN: 'Ce slug est déjà utilisé par un autre modèle.',
  SLUG_REQUIRED: 'Le slug est obligatoire.',
  KEY_TAKEN: 'Cette clé est déjà utilisée.',
  PLATE_TAKEN: 'Cette immatriculation existe déjà.',
  REASON_REQUIRED: 'Un motif est obligatoire.',
  FORBIDDEN: 'Votre rôle ne permet pas de modifier la flotte.',
  INVALID_VALUE: 'Une valeur est refusée par la base de données.',
  NOT_FOUND: 'Cette fiche n’existe plus — rechargez la page.',
  VEHICLE_REQUIRED: 'Le modèle est obligatoire.',
  VALIDATION: 'Formulaire incomplet — corrigez les champs signalés.',
  UNAUTHORIZED: 'Session expirée — reconnectez-vous.',
};

const describe = (code) => MESSAGES[code] || `Enregistrement refusé (${code}).`;

/* ------------------------------------------------------------------ models */

/**
 * The whole model in one payload.
 *
 * Every column `save_vehicle` writes is listed here, including the ones the
 * operator rarely touches (silhouette, équipements, dossier photo, prix haute
 * saison). The RPC is an UPSERT that overwrites every column on conflict, so a
 * field left out of the payload would be silently RESET to its default — a
 * save from the "identity" tab would blank the equipment list. The form sends
 * the complete row or nothing.
 */
const vehicleSchema = z.object({
  id: idish.optional(),
  slug: z.string().trim().max(80).optional().default(''),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1990).max(2100),
  category: z.enum(CATEGORIES),
  transmission: z.enum(TRANSMISSIONS),
  fuel: z.enum(FUELS),
  seats: z.coerce.number().int().min(1).max(20),
  doors: z.coerce.number().int().min(2).max(6),
  luggage: z.coerce.number().int().min(0).max(20),
  ac: z.boolean().optional().default(true),
  pricePerDay: z.coerce.number().min(0).max(100000),
  priceHighSeason: z.coerce.number().min(0).max(100000).optional().default(0),
  priceVerified: z.boolean().optional().default(false),
  deposit: z.coerce.number().min(0).max(1000000),
  mileageLimit: z.coerce.number().int().min(0).max(100000).optional().default(0),
  minAge: z.coerce.number().int().min(18).max(99),
  minDays: z.coerce.number().int().min(1).max(90),
  prepBufferMinutes: z.coerce.number().int().min(0).max(1440),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  image: z.enum(CAR_IMAGES).optional().default('berline'),
  photoFolder: z.string().trim().max(80).optional().default(''),
  features: z.array(z.enum(FEATURES)).max(FEATURES.length).optional().default([]),
  purposeTags: z.array(z.enum(PURPOSE_TAGS)).max(PURPOSE_TAGS.length).optional().default([]),
  description: i18nText(4000).optional().default({}),
  published: z.boolean().optional().default(false),
  featured: z.boolean().optional().default(false),
  /* What the row looked like before this save. A model that LEAVES the site
     needs the public cache dropped just as much as one that joins it. */
  publishedBefore: z.boolean().optional().default(false),
  reason: z.string().trim().max(200).optional().default(''),
});

export async function saveVehicleModel(input) {
  await requireRole(['owner', 'manager']);

  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.code;
    return { ok: false, error: 'VALIDATION', message: MESSAGES.VALIDATION, fieldErrors };
  }

  const { reason, publishedBefore, ...d } = parsed.data;
  const slug = slugify(d.slug || `${d.brand}-${d.model}-${d.year}`);
  if (!slug) return { ok: false, error: 'SLUG_REQUIRED', message: MESSAGES.SLUG_REQUIRED };

  const payload = {
    ...d,
    slug,
    /* 0 is how the form says "unlimited"; the column says it with NULL, and
       the pricing code reads NULL. Same for a high-season price nobody set. */
    mileageLimit: d.mileageLimit > 0 ? d.mileageLimit : null,
    priceHighSeason: d.priceHighSeason > 0 ? d.priceHighSeason : null,
    photoFolder: d.photoFolder || null,
  };

  try {
    const vehicle = await upsertVehicle(payload, reason || 'modification du modèle');
    revalidatePath('/admin/flotte');
    if (vehicle?.id) revalidatePath(`/admin/flotte/${vehicle.id}`);
    /* A published model is on the public site — its price, its photos and its
       very existence. Anything that changes while it is (or was) published
       invalidates the whole localized site, not one route. */
    if (vehicle?.published || publishedBefore) revalidatePath('/', 'layout');
    return { ok: true, vehicle, message: 'Modèle enregistré.' };
  } catch (error) {
    const code = error?.code || 'SERVER';
    return { ok: false, error: code, message: describe(code) };
  }
}

/* ------------------------------------------------------------------ photos */

const photoSchema = z.object({
  id: idish.optional(),
  vehicleId: idish,
  angle: z.enum(ANGLES),
  /* `<slug>/<angle>-<token>` and nothing else. No dots, so no `..`: this
     string names a folder inside a public bucket and arrives from a browser. */
  basePath: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9/_-]*$/i, 'base path'),
  widths: z.array(z.coerce.number().int().min(16).max(8000)).min(1).max(12),
  formats: z.array(z.enum(['webp', 'jpg'])).min(1).max(2),
  width: z.coerce.number().int().min(1).max(20000),
  height: z.coerce.number().int().min(1).max(20000),
  blur: z.string().max(30000).optional().default(''),
  alt: i18nText(300).optional().default({}),
  sort: z.coerce.number().int().min(0).max(100000).optional().default(100),
});

/**
 * Index one photo whose variants are already in the bucket.
 *
 * `requireAdmin` and not `requireRole`: an agent who photographs a car at the
 * counter is doing their job. Prices are the thing agents may not touch
 * (plan 7.2) — a photo is not a price.
 */
export async function savePhoto(input) {
  await requireAdmin();

  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION', message: MESSAGES.VALIDATION };

  const d = parsed.data;
  try {
    const photo = await saveVehiclePhoto({
      ...d,
      /* The blur is a 24 px data: URI painted before the bytes land. Anything
         that is not one — a URL, an empty default — is not ours to store. */
      blur: d.blur.startsWith('data:image/') ? d.blur : null,
    });
    revalidatePath('/admin/flotte');
    revalidatePath(`/admin/flotte/${d.vehicleId}`);
    revalidatePath('/', 'layout');
    return { ok: true, photo, message: 'Photo ajoutée.' };
  } catch (error) {
    const code = error?.code || 'SERVER';
    return { ok: false, error: code, message: describe(code) };
  }
}

/**
 * Drop the index row and hand the caller the paths it points at.
 *
 * The bucket is cleared by the BROWSER afterwards, with the row's own
 * basePath/widths/formats — the same client that put the bytes there. If that
 * second step fails the page is still correct and a few orphaned objects sit
 * in Storage, which is the cheaper failure (migration 0012 says so too).
 */
export async function removePhoto(id) {
  await requireAdmin();

  const parsed = idish.safeParse(id);
  if (!parsed.success) return { ok: false, error: 'VALIDATION', message: MESSAGES.VALIDATION };

  const result = await deleteVehiclePhoto(parsed.data);
  if (!result?.ok) {
    return { ok: false, error: result?.error || 'SERVER', message: describe(result?.error || 'SERVER') };
  }

  revalidatePath('/admin/flotte');
  revalidatePath('/', 'layout');
  return { ...result, message: 'Photo supprimée.' };
}

const reorderSchema = z.object({
  vehicleId: idish,
  ids: z.array(idish).min(1).max(60),
});

export async function reorderPhotos(input) {
  await requireAdmin();

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION', message: MESSAGES.VALIDATION };

  const result = await reorderVehiclePhotos(parsed.data);
  if (!result?.ok) {
    return { ok: false, error: result?.error || 'SERVER', message: describe(result?.error || 'SERVER') };
  }

  revalidatePath('/admin/flotte');
  revalidatePath(`/admin/flotte/${parsed.data.vehicleId}`);
  /* Order is not decoration: the first photo is the card image on the site. */
  revalidatePath('/', 'layout');
  return { ...result, message: 'Ordre enregistré.' };
}
