'use server';

/**
 * What is left of the starter's admin actions.
 *
 * Prompt 12 moved every fleet, pricing, FAQ, review and settings write into
 * src/lib/actions/{fleet,units,pricing,content,settings}.js, where each one
 * goes through a reason-carrying RPC (supabase/migrations/0012). The
 * FormData-based versions that lived here sent no reason and were guarded by
 * requireAdmin() only, so against Postgres they would now be refused with
 * REASON_REQUIRED — dead code that could only ever fail. They are gone.
 *
 * Still live: the blog editor's save/delete and the two SEO tools.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, getSettingsAdmin, listPosts, listVehicles } from '@/lib/data';
import { LOCALES } from '@/lib/constants';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { pingIndexNow } from '@/lib/indexnow';
import { slugify } from '@/lib/format';
import { absoluteUrl } from '@/lib/seo';
import { routing } from '@/i18n/routing';

/* ---------- helpers ---------- */
const str = (fd, k) => String(fd.get(k) ?? '').trim();
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

/* ---------- SEO tools ---------- */
export async function revalidateAll() {
  await requireAdmin();
  revalidateSite();
  return { ok: true, at: Date.now() };
}

export async function indexNowAll() {
  await requireAdmin();
  const [settings, vehicles, posts] = await Promise.all([getSettingsAdmin(), listVehicles({ published: true }), listPosts({ published: true })]);
  const urls = [];
  for (const l of routing.locales) {
    ['/', '/vehicules', '/aeroport', '/longue-duree', '/avec-chauffeur', '/faq', '/blog', '/contact', '/a-propos'].forEach((h) => urls.push(absoluteUrl(l, h)));
    vehicles.forEach((v) => urls.push(absoluteUrl(l, { pathname: '/vehicules/[slug]', params: { slug: v.slug } })));
    posts.forEach((p) => urls.push(absoluteUrl(l, { pathname: '/blog/[slug]', params: { slug: p.slug } })));
  }
  const res = await pingIndexNow(urls, settings?.indexNowKey || process.env.INDEXNOW_KEY);
  return { ...res, count: urls.length, at: Date.now() };
}
