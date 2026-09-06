import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { ArrowIcon } from '@/components/site/icons';
import { readingTime } from '@/components/site/Markdown';
import { listPosts, t as pick } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.blog' });
  return localizedMetadata({ locale, href: '/blog', title: t('title'), description: t('description') });
}

export default async function BlogPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const tseo = await getTranslations({ locale, namespace: 'seo.blog' });
  const posts = await listPosts({ published: true });
  const url = absoluteUrl(locale, '/blog');

  return (
    <>
      <PageHero crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('blog'), url }]} eyebrow={t('eyebrow')} title={t('title')} answer={t('intro')} />
      <section className="pb-24">
        <div className="container-x">
          <Stagger className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <StaggerItem key={p.id} className="h-full">
                <article className="card group relative flex h-full flex-col overflow-hidden">
                  <div className="plate aspect-[16/9] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/images/cars/${p.cover || 'berline'}.svg`} alt="" width={800} height={380} loading="lazy" decoding="async" className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <time dateTime={p.publishedAt}>{formatDate(p.publishedAt, locale)}</time>
                      <span>·</span>
                      <span>{t('readingTime', { minutes: readingTime(pick(p.body, locale)) })}</span>
                    </div>
                    <h2 className="mt-2 font-display text-xl leading-snug text-text">
                      <Link href={{ pathname: '/blog/[slug]', params: { slug: p.slug } }} className="after:absolute after:inset-0">
                        {pick(p.title, locale)}
                      </Link>
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-2">{pick(p.excerpt, locale)}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                      {tc('readMore')}
                      <ArrowIcon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>
      <JsonLd data={webPageJsonLd({ url, name: tseo('title'), description: tseo('description'), locale })} />
    </>
  );
}
