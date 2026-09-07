import { cn } from '@/lib/cn';

/**
 * The real Diab Car mark (delivered Sept 2026, master in docs/inputs/logo/badge-icon.png,
 * trimmed and re-encoded by the brand pipeline). Two files, not one: the mark
 * is a single flat colour, so light mode uses the black cut and dark mode the
 * white one — swapped with the `dark` class, the same mechanism the tokens use.
 *
 * Raster, not SVG: only PNGs were supplied. The plan asked for an SVG badge;
 * a true vector needs the original artwork or a tracer, neither available
 * here. At the sizes the site uses (≤ 160 px wide) an 800 px WebP is
 * indistinguishable and 16 kB. Swap to SVG the day a vector arrives.
 */
const MARK = { light: '/brand/mark.webp', dark: '/brand/mark-white.webp', width: 800, height: 309 };
const LOCKUP = { light: '/brand/logo.webp', dark: '/brand/logo-white.webp', width: 1600, height: 714 };

/**
 * The emblem alone — car silhouette over the band. Sizes by height: give it a
 * height class and the width follows the mark's own 2.59:1 aspect.
 * Decorative by default; pass `alt` when it is the only thing naming the brand.
 * @param {{ className?: string, alt?: string }} props
 */
export function Badge({ className, alt = '' }) {
  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-hidden={alt ? undefined : 'true'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK.light} alt={alt} width={MARK.width} height={MARK.height} decoding="async" className="block max-h-full max-w-full h-auto w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK.dark} alt="" width={MARK.width} height={MARK.height} decoding="async" className="hidden max-h-full max-w-full h-auto w-auto dark:block" />
    </span>
  );
}

/** Compatibility alias — AdminShell.js and LoginForm.js still import LogoMark. */
export const LogoMark = Badge;

/**
 * The full lockup: emblem, "DIAB CAR" band and the Arabic tagline
 * جودة تثق بها . خدمة تميزنا — for the footer and anywhere the brand stands alone.
 * Both theme cuts are in the DOM, and a CSS-hidden <img> still downloads — so
 * this is `loading="lazy"`. The lockup only ever appears in the footer, far
 * below the fold; eager it cost 130 kB of bandwidth against the hero's LCP.
 *
 * @param {{ className?: string, alt?: string }} props
 */
export function LogoLockup({ className, alt = 'Diab Car' }) {
  return (
    <span className={cn('inline-block', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOCKUP.light} alt={alt} width={LOCKUP.width} height={LOCKUP.height} loading="lazy" decoding="async" className="block h-auto w-full dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOCKUP.dark} alt="" width={LOCKUP.width} height={LOCKUP.height} loading="lazy" decoding="async" className="hidden h-auto w-full dark:block" />
    </span>
  );
}

/**
 * Header identity (plan 2.1): the wordmark "DIAB CAR" in Archivo, width axis
 * 125, weight 700, tracking +0.02em — with the real emblem beside it from the
 * lg breakpoint up when `withBadge` is set. Neutral: red is a signal, so no
 * letter is red. A CSS breakpoint, not JS, so it costs no hydration.
 */
export default function Logo({ className, withBadge = false }) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      {withBadge ? <Badge className="hidden h-6 lg:inline-flex" /> : null}
      <span
        className="font-latin-display text-[1.35rem] font-bold uppercase leading-none tracking-[0.02em] text-text"
        style={{ fontVariationSettings: '"wdth" 125' }}
      >
        DIAB CAR
      </span>
    </span>
  );
}
