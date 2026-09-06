'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, getSettings, listPosts, listVehicles } from '@/lib/data';
import { CAR_IMAGES, CATEGORIES, FEATURES, FUELS, LOCALES, TRANSMISSIONS } from '@/lib/constants';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { pingIndexNow } from '@/lib/indexnow';
import { slugify } from '@/lib/format';
import { absoluteUrl } from '@/lib/seo';
import { routing } from '@/i18n/routing';

/* ---------- helpers ---------- */
const str = (fd, k) => String(fd.get(k) ?? '').trim();
const num = (fd, k, d = 0) => (fd.get(k) === '' || fd.get(k) == null ? d : Number(fd.get(k)));
const bool = (fd, k) => fd.get(k) === 'on' || fd.get(k) === 'true';
const i18n = (fd, k) => Object.fromEntries(LOCALES.map((l) => [l, str(fd, `${k}_${l}`)]));

function revalidateSite() {
  revalidatePath('/', 'layout');
}

async function done(path) {
  const base = await getAdminBase();
  revalidateSite();
  redirect(`${base}${path}`);
}

/* ---------- vehicles ---------- */
const vehicleSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  category: z.enum(CATEGORIES),
  transmission: z.enum(TRANSMISSIONS),
  fuel: z.enum(FUELS),
  seats: z.number().int().min(2).max(20),
  doors: z.number().int().min(2).max(6),
  luggage: z.number().int().min(0).max(20),
  pricePerDay: z.number().min(1),
  deposit: z.number().min(0),
  minAge: z.number().int().min(18).max(40),
  image: z.enum(CAR_IMAGES),
});

export async function saveVehicle(prevState, formData) {
  await requireAdmin();
  const id = str(formData, 'id') || undefined;
  const data = {
    brand: str(formData, 'brand'),
    model: str(formData, 'model'),
    year: num(formData, 'year'),
    category: str(formData, 'category'),
    transmission: str(formData, 'transmission'),
    fuel: str(formData, 'fuel'),
    seats: num(formData, 'seats'),
    doors: num(formData, 'doors'),
    luggage: num(formData, 'luggage'),
    pricePerDay: num(formData, 'pricePerDay'),
    deposit: num(formData, 'deposit'),
    minAge: num(formData, 'minAge', 21),
    image: str(formData, 'image') || 'berline',
  };
  const parsed = vehicleSchema.safeParse(data);
  if (!parsed.success) return { error: `Champs invalides : ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}` };

  const mileage = num(formData, 'mileageLimit', 0);
  const vehicle = {
    ...parsed.data,
    id,
    slug: str(formData, 'slug') ? slugify(str(formData, 'slug')) : slugify(`${data.brand}-${data.model}`),
    mileageLimit: mileage > 0 ? mileage : null,
    ac: true,
    images: str(formData, 'images').split('\n').map((s) => s.trim()).filter(Boolean),
    features: FEATURES.filter((f) => formData.get(`feature_${f}`) === 'on'),
    description: i18n(formData, 'description'),
    published: bool(formData, 'published'),
    featured: bool(formData, 'featured'),
    sortOrder: num(formData, 'sortOrder', 100),
  };
  const saved = await (await db()).upsertVehicle(vehicle);
  await done(`/vehicules/${saved.id}?saved=1`);
}

export async function deleteVehicle(formData) {
  await requireAdmin();
  await (await db()).deleteVehicle(str(formData, 'id'));
  await done('/vehicules');
}

/* ---------- bookings ---------- */
export async function updateBooking(prevState, formData) {
  await requireAdmin();
  const id = str(formData, 'id');
  await (await db()).updateBooking(id, { status: str(formData, 'status'), notes: str(formData, 'notes') });
  revalidateSite();
  return { ok: true, at: Date.now() };
}

/* ---------- pricing ---------- */
export async function saveSeason(formData) {
  await requireAdmin();
  await (await db()).upsertSeason({ id: str(formData, 'id') || undefined, name: str(formData, 'name'), startDate: str(formData, 'startDate'), endDate: str(formData, 'endDate'), multiplier: num(formData, 'multiplier', 1), active: bool(formData, 'active') });
  await done('/tarifs');
}
export async function deleteSeason(formData) {
  await requireAdmin();
  await (await db()).deleteSeason(str(formData, 'id'));
  await done('/tarifs');
}
export async function saveExtra(formData) {
  await requireAdmin();
  await (await db()).upsertExtra({ id: str(formData, 'id') || undefined, key: slugify(str(formData, 'key')).replace(/-/g, '_'), type: str(formData, 'type') || 'per_day', price: num(formData, 'price'), active: bool(formData, 'active'), name: i18n(formData, 'name') });
  await done('/tarifs');
}
export async function deleteExtra(formData) {
  await requireAdmin();
  await (await db()).deleteExtra(str(formData, 'id'));
  await done('/tarifs');
}
export async function saveTiers(formData) {
  await requireAdmin();
  const tiers = [0, 1, 2]
    .map((i) => ({ minDays: num(formData, `minDays_${i}`), discountPct: num(formData, `discountPct_${i}`) }))
    .filter((t) => t.minDays > 0);
  await (await db()).updateSettings({ pricingTiers: tiers, airportDeliveryFee: num(formData, 'airportDeliveryFee'), cityDeliveryFee: num(formData, 'cityDeliveryFee'), oneWayFee: num(formData, 'oneWayFee'), monthlyFrom: { economy: num(formData, 'monthly_economy'), suv: num(formData, 'monthly_suv'), premium: num(formData, 'monthly_premium') } });
  await done('/tarifs?saved=1');
}

/* ---------- FAQ ---------- */
export async function saveFaq(formData) {
  await requireAdmin();
  await (await db()).upsertFaq({ id: str(formData, 'id') || undefined, category: str(formData, 'category') || 'general', sortOrder: num(formData, 'sortOrder', 100), published: bool(formData, 'published'), question: i18n(formData, 'question'), answer: i18n(formData, 'answer') });
  await done('/contenu/faq');
}
export async function deleteFaq(formData) {
  await requireAdmin();
  await (await db()).deleteFaq(str(formData, 'id'));
  await done('/contenu/faq');
}

/* ---------- posts ---------- */
export async function savePost(prevState, formData) {
  await requireAdmin();
  const title = i18n(formData, 'title');
  const post = {
    id: str(formData, 'id') || undefined,
    slug: slugify(str(formData, 'slug') || title.fr || title.en),
    cover: str(formData, 'cover') || 'berline',
    tags: str(formData, 'tags').split(',').map((s) => s.trim()).filter(Boolean),
    published: bool(formData, 'published'),
    publishedAt: str(formData, 'publishedAt') ? new Date(str(formData, 'publishedAt')).toISOString() : undefined,
    title,
    excerpt: i18n(formData, 'excerpt'),
    body: i18n(formData, 'body'),
  };
  if (!post.slug) return { error: 'Titre ou slug requis.' };
  const saved = await (await db()).upsertPost(post);
  await done(`/contenu/blog/${saved.id}?saved=1`);
}
export async function deletePost(formData) {
  await requireAdmin();
  await (await db()).deletePost(str(formData, 'id'));
  await done('/contenu/blog');
}

/* ---------- reviews ---------- */
export async function saveReview(formData) {
  await requireAdmin();
  await (await db()).upsertReview({ id: str(formData, 'id') || undefined, authorName: str(formData, 'authorName'), rating: num(formData, 'rating', 5), lang: str(formData, 'lang') || 'fr', source: str(formData, 'source') || 'google', text: str(formData, 'text'), vehicleId: str(formData, 'vehicleId') || null, published: bool(formData, 'published'), isSample: false });
  await done('/avis');
}
export async function deleteReview(formData) {
  await requireAdmin();
  await (await db()).deleteReview(str(formData, 'id'));
  await done('/avis');
}

/* ---------- settings ---------- */
export async function saveSettings(prevState, formData) {
  await requireAdmin();
  const hours = [];
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const weekdays = days.filter((d) => formData.get(`open_${d}`) === 'on');
  if (weekdays.length) hours.push({ days: weekdays, opens: str(formData, 'opens') || '08:00', closes: str(formData, 'closes') || '20:00' });
  const patch = {
    name: str(formData, 'name'),
    legalName: str(formData, 'legalName'),
    tagline: i18n(formData, 'tagline'),
    phonePrimary: str(formData, 'phonePrimary'),
    phoneSecondary: str(formData, 'phoneSecondary'),
    phoneLandline: str(formData, 'phoneLandline'),
    whatsapp: str(formData, 'whatsapp'),
    email: str(formData, 'email'),
    addressLine: str(formData, 'addressLine'),
    city: str(formData, 'city') || 'Casablanca',
    postalCode: str(formData, 'postalCode'),
    lat: num(formData, 'lat'),
    lng: num(formData, 'lng'),
    googleMapsUrl: str(formData, 'googleMapsUrl'),
    gbpUrl: str(formData, 'gbpUrl'),
    facebookUrl: str(formData, 'facebookUrl'),
    instagramUrl: str(formData, 'instagramUrl'),
    tiktokUrl: str(formData, 'tiktokUrl'),
    hours,
    airportService24h: bool(formData, 'airportService24h'),
    rc: str(formData, 'rc'),
    ice: str(formData, 'ice'),
    capitalMad: num(formData, 'capitalMad'),
    foundedYear: num(formData, 'foundedYear', 2013),
    eurRate: num(formData, 'eurRate', 10.8),
    minAge: num(formData, 'minAge', 21),
    depositReleaseDays: num(formData, 'depositReleaseDays', 7),
    gaId: str(formData, 'gaId'),
    indexNowKey: str(formData, 'indexNowKey'),
  };
  await (await db()).updateSettings(patch);
  revalidateSite();
  return { ok: true, at: Date.now() };
}

/* ---------- SEO tools ---------- */
export async function revalidateAll() {
  await requireAdmin();
  revalidateSite();
  return { ok: true, at: Date.now() };
}

export async function indexNowAll() {
  await requireAdmin();
  const [settings, vehicles, posts] = await Promise.all([getSettings(), listVehicles({ published: true }), listPosts({ published: true })]);
  const urls = [];
  for (const l of routing.locales) {
    ['/', '/vehicules', '/aeroport', '/longue-duree', '/avec-chauffeur', '/faq', '/blog', '/contact', '/a-propos'].forEach((h) => urls.push(absoluteUrl(l, h)));
    vehicles.forEach((v) => urls.push(absoluteUrl(l, { pathname: '/vehicules/[slug]', params: { slug: v.slug } })));
    posts.forEach((p) => urls.push(absoluteUrl(l, { pathname: '/blog/[slug]', params: { slug: p.slug } })));
  }
  const res = await pingIndexNow(urls, settings?.indexNowKey || process.env.INDEXNOW_KEY);
  return { ...res, count: urls.length, at: Date.now() };
}
