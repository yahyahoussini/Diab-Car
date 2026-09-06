import Breadcrumbs from '@/components/site/Breadcrumbs';
import { FadeIn } from '@/components/site/HeroTitle';

/**
 * Landing-page header: breadcrumbs, eyebrow, H1, and an "answer-first" block
 * (40–60 words) that AI engines and featured snippets can lift verbatim.
 */
export default function PageHero({ crumbs, eyebrow, title, answer, children, image }) {
  return (
    <section className="relative overflow-hidden pt-[calc(var(--header-h)+1.5rem)]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_80%_0%,var(--accent-soft),transparent_60%)]" aria-hidden="true" />
      <div className="container-x">
        <Breadcrumbs items={crumbs} />
        <div className="mt-8 grid items-end gap-10 pb-12 lg:grid-cols-12">
          <div className={image ? 'lg:col-span-7' : 'lg:col-span-9'}>
            {eyebrow ? (
              <FadeIn>
                <p className="eyebrow mb-4">{eyebrow}</p>
              </FadeIn>
            ) : null}
            <FadeIn delay={0.1}>
              <h1 className="text-display-1 text-text">{title}</h1>
            </FadeIn>
            {answer ? (
              <FadeIn delay={0.25}>
                <p className="mt-6 max-w-2xl rounded-2xl border border-accent/30 bg-surface-1/80 px-5 py-4 text-[17px] leading-relaxed text-text backdrop-blur">{answer}</p>
              </FadeIn>
            ) : null}
            {children ? <FadeIn delay={0.35}>{children}</FadeIn> : null}
          </div>
          {image ? (
            <FadeIn delay={0.2} className="lg:col-span-5">
              <div className="bg-surface-1 chamfer relative aspect-[4/3] overflow-hidden rounded-b-[var(--radius-card)] border border-border/60">
                <div className="absolute inset-x-8 bottom-6 top-12 parallax-view">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/images/cars/${image}.svg`} alt="" width={800} height={380} fetchPriority="high" decoding="async" className="h-full w-full object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.35)]" />
                </div>
              </div>
            </FadeIn>
          ) : null}
        </div>
      </div>
    </section>
  );
}
