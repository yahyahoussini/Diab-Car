import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Breadcrumbs from '@/components/site/Breadcrumbs';
import JsonLd from '@/components/site/JsonLd';
import Markdown, { readingTime } from '@/components/site/Markdown';
import Button from '@/components/ui/Button';
import { ArrowIcon } from '@/components/site/icons';
import { getPostBySlug, getSettings, listPosts, t as pick } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { absoluteUrl, articleJsonLd, localizedMetadata } from '@/lib/seo';

export const revalidate = 3600;

export async function generateStaticParams() {
  const posts = await listPosts({ published: true });
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post || !post.published) return {};
  return localizedMetadata({ locale, href: { pathname: '/blog/[slug]', params: { slug } }, title: `${pick(post.title, locale)} | Diab Car`, description: pick(post.excerpt, locale), type: 'article' });
}

export default async function PostPage({ params }) {
  const { locale, slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post || !post.published) notFound();
  const [settings, posts] = await Promise.all([getSettings(), listPosts({ published: true })]);
  const t = await getTranslations({ locale, namespace: 'blog' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const url = absoluteUrl(locale, { pathname: '/blog/[slug]', params: { slug } });
  const body = pick(post.body, locale);
  const related = posts.filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <article className="pt-[calc(var(--header-h)+1.5rem)] pb-24">
      <div className="scroll-progress fixed inset-x-0 top-0 z-50 h-0.5 bg-accent" aria-hidden="true" />
      <div className="container-x max-w-3xl">
        <Breadcrumbs items={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('blog'), href: '/blog', url: absoluteUrl(locale, '/blog') }, { name: pick(post.title, locale), url }]} />
        <header className="mt-8">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className="mt-3 text-display-2 text-text">{pick(post.title, locale)}</h1>
          <p className="mt-4 text-lg leading-relaxed text-text-2">{pick(post.excerpt, locale)}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
            <span>{tc('published', { date: formatDate(post.publishedAt, locale) })}</span>
            {post.updatedAt && post.updatedAt !== post.publishedAt ? <span>{tc('updated', { date: formatDate(post.updatedAt, locale) })}</span> : null}
            <span>{t('readingTime', { minutes: readingTime(body) })}</span>
            <span>{settings?.name || 'Diab Car'}</span>
          </div>
        </header>
        <div className="bg-surface-1 relative mt-8 aspect-[16/8] overflow-hidden rounded-[var(--radius-card)] border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/images/cars/${post.cover || 'berline'}.svg`} alt="" width={800} height={380} className="absolute inset-x-10 bottom-4 top-8 h-[calc(100%-3rem)] w-[calc(100%-5rem)] object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.4)]" />
        </div>
        <Markdown source={body} className="mt-10" />

        <aside className="card mt-12 p-6 md:p-8">
          <h2 className="font-display text-2xl text-text">{t('ctaTitle')}</h2>
          <p className="mt-2 text-text-2">{t('ctaText')}</p>
          <Button href="/vehicules" className="mt-5">
            {tn('fleet')}
            <ArrowIcon />
          </Button>
        </aside>

        {related.length ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl text-text">{t('related')}</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.map((p) => (
                <li key={p.id} className="card p-5">
                  <Link href={{ pathname: '/blog/[slug]', params: { slug: p.slug } }} className="font-display text-lg leading-snug text-text hover:text-accent">
                    {pick(p.title, locale)}
                  </Link>
                  <p className="mt-2 line-clamp-2 text-sm text-text-2">{pick(p.excerpt, locale)}</p>
                </li>
              ))}
            </ul>
            <Link href="/blog" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              {t('backToBlog')}
              <ArrowIcon className="h-3.5 w-3.5" />
            </Link>
          </section>
        ) : null}
      </div>
      <JsonLd data={articleJsonLd(post, locale, url, settings)} />
    </article>
  );
}
