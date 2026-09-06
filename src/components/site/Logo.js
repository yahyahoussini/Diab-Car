import { cn } from '@/lib/cn';

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id="dc-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e2c57f" />
          <stop offset="1" stopColor="#b8963f" />
        </linearGradient>
      </defs>
      <path d="M16 2l3.2 7.3 7.8-1.1-4.6 6.5 4.6 6.5-7.8-1.1L16 30l-3.2-7.9-7.8 1.1 4.6-6.5-4.6-6.5 7.8 1.1z" fill="url(#dc-gold)" />
      <circle cx="16" cy="16" r="4.2" fill="var(--bg)" />
      <circle cx="16" cy="16" r="2" fill="url(#dc-gold)" />
    </svg>
  );
}

export default function Logo({ className, compact = false }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-latin-display text-[1.35rem] font-semibold tracking-[0.02em] text-text" style={{ fontVariationSettings: '"opsz" 32' }}>
          DIAB <span className="text-accent">CAR</span>
        </span>
        {!compact ? <span className="font-latin-sans mt-1 text-[9px] font-semibold uppercase tracking-[0.28em] text-text-muted">Casablanca</span> : null}
      </span>
    </span>
  );
}
