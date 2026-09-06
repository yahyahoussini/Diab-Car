import { routing } from '@/i18n/routing';
import { listPosts, listVehicles } from '@/lib/data';
import { absoluteUrl } from '@/lib/seo';

const STATIC = [
  { href: '/', priority: 1, changeFrequency: 'weekly' },
  { href: '/vehicules', priority: 0.9, changeFrequency: 'daily' },
  { href: '/aeroport', priority: 0.9, changeFrequency: 'monthly' },
  { href: '/longue-duree', priority: 0.8, changeFrequency: 'monthly' },
  { href: '/avec-chauffeur', priority: 0.8, changeFrequency: 'monthly' },
  { href: '/reservation', priority: 0.6, changeFrequency: 'monthly' },
  { href: '/faq', priority: 0.7, changeFrequency: 'monthly' },
  { href: '/blog', priority: 0.7, changeFrequency: 'weekly' },
  { href: '/a-propos', priority: 0.5, changeFrequency: 'yearly' },
  { href: '/contact', priority: 0.6, changeFrequency: 'yearly' },
  { href: '/conditions', priority: 0.3, changeFrequency: 'yearly' },
  { href: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly' },
  { href: '/confidentialite', priority: 0.2, changeFrequency: 'yearly' },
];

/** One <url> per locale, each listing all alternates + x-default (Google spec). */
function entries(href, extra = {}) {
  const languages = Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(l, href)]));
  languages['x-default'] = absoluteUrl(routing.defaultLocale, href);
  return routing.locales.map((l) => ({ url: languages[l], alternates: { languages }, ...extra }));
}

export default async function sitemap() {
  const [vehicles, posts] = await Promise.all([listVehicles({ published: true }), listPosts({ published: true })]);
  const now = new Date();
  return [
    ...STATIC.flatMap((s) => entries(s.href, { lastModified: now, changeFrequency: s.changeFrequency, priority: s.priority })),
    ...vehicles.flatMap((v) => entries({ pathname: '/vehicules/[slug]', params: { slug: v.slug } }, { lastModified: v.updatedAt ? new Date(v.updatedAt) : now, changeFrequency: 'weekly', priority: 0.8 })),
    ...posts.flatMap((p) => entries({ pathname: '/blog/[slug]', params: { slug: p.slug } }, { lastModified: new Date(p.updatedAt || p.publishedAt), changeFrequency: 'monthly', priority: 0.6 })),
  ];
}
