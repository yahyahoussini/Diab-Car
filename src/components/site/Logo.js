import { cn } from '@/lib/cn';

/**
 * TEMP MARK — this is not the Diab Car brand badge.
 * docs/inputs/logo/ has no vector yet and its "Redraw approved" line is blank
 * (plan 2.1, section 12 input #1), so the shield below is a placeholder drawn
 * to the plan's description: red shield, white car, black band. Replace the
 * geometry here and in public/brand/badge-temp*.svg the day the vector lands.
 *
 * Drawn inline rather than loaded from public/brand so it stays crisp at any
 * size and so the clip path id can be scoped per render.
 */
export function Badge({ className, id = 'dc-shield' }) {
  return (
    <svg viewBox="0 0 64 80" className={cn('h-8 w-8', className)} aria-hidden="true" focusable="false">
      <clipPath id={id}>
        <path d="M32 2 60 12v30c0 18-12 30-28 36C16 72 4 60 4 42V12z" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <path d="M32 2 60 12v30c0 18-12 30-28 36C16 72 4 60 4 42V12z" fill="var(--red)" />
        <path
          d="M13 41c0-1.2.9-2.2 2.1-2.4l4.6-.8 4.1-5.6c.6-.8 1.5-1.3 2.5-1.3h11.4c1 0 1.9.5 2.5 1.3l4.1 5.6 4.6.8c1.2.2 2.1 1.2 2.1 2.4v3.4c0 .9-.7 1.6-1.6 1.6H14.6c-.9 0-1.6-.7-1.6-1.6z"
          fill="var(--on-red)"
        />
        <circle cx="22" cy="46" r="4.6" fill="var(--on-red)" />
        <circle cx="42" cy="46" r="4.6" fill="var(--on-red)" />
        <circle cx="22" cy="46" r="1.9" fill="var(--red)" />
        <circle cx="42" cy="46" r="1.9" fill="var(--red)" />
        <rect x="0" y="54" width="64" height="13" fill="#0a0a0a" />
      </g>
    </svg>
  );
}

/** Compatibility alias — AdminShell.js and LoginForm.js still import LogoMark. */
export const LogoMark = Badge;

/**
 * The wordmark (plan 2.1): "DIAB CAR" in Archivo, width axis 125, weight 700,
 * uppercase, tracking +0.02em. Neutral by design — red is a signal, never
 * decoration, so no letter is red.
 *
 * `withBadge` shows the mini badge from the lg breakpoint up, which is the
 * plan's ">= 1024 px shows badge + wordmark, mobile shows the wordmark only".
 * It is a CSS breakpoint, not a JS one, so it costs no hydration.
 */
export default function Logo({ className, withBadge = false }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {withBadge ? <Badge className="hidden h-7 w-7 lg:block" /> : null}
      <span
        className="font-latin-display text-[1.35rem] font-bold uppercase leading-none tracking-[0.02em] text-text"
        style={{ fontVariationSettings: '"wdth" 125' }}
      >
        DIAB CAR
      </span>
    </span>
  );
}
