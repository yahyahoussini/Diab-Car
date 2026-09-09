'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export default function ThemeToggle({ className }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations('common');
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const label = isDark ? t('themeLight') : t('themeDark');

  function toggle(event) {
    const next = isDark ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#080808' : '#ffffff');

    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTheme(next);
      return;
    }

    /* The new theme opens as a circle FROM THIS BUTTON rather than crossfading
       over the whole page (plan 5.3). The origin and the radius that reaches
       the furthest corner are handed to CSS as custom properties, because a
       clip-path cannot be computed in a stylesheet.
       Duration comes from --dur-panel: the plan says 500 ms but rule 6 says
       durations come from the motion tokens, and there is no 500 ms token. */
    const root = document.documentElement;
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));

    root.style.setProperty('--vt-x', `${cx}px`);
    root.style.setProperty('--vt-y', `${cy}px`);
    root.style.setProperty('--vt-r', `${radius}px`);
    root.setAttribute('data-theme-sweep', '');

    const transition = document.startViewTransition(() => setTheme(next));
    /* Always cleared, including when the transition is skipped or interrupted —
       a stray attribute would iris every later root transition too. */
    transition.finished.finally(() => root.removeAttribute('data-theme-sweep'));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      className={cn('relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-text-2 transition-colors hover:border-border hover:bg-surface-2 hover:text-text', className)}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" style={{ transform: isDark ? 'rotate(40deg)' : 'rotate(0deg)', transition: 'transform 500ms var(--ease-out)' }}>
        <mask id="theme-mask">
          <rect width="24" height="24" fill="#fff" />
          <circle cx="12" cy="12" r="0" fill="#000" style={{ transform: isDark ? 'translate(7px,-7px)' : 'translate(14px,-14px)', r: isDark ? 9 : 0, transition: 'transform 500ms var(--ease-out), r 500ms var(--ease-out)' }} />
        </mask>
        <circle cx="12" cy="12" r={isDark ? 9 : 5} fill="currentColor" mask="url(#theme-mask)" style={{ transition: 'r 500ms var(--ease-out)' }} />
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: 'center', transform: isDark ? 'scale(0)' : 'scale(1)', opacity: isDark ? 0 : 1, transition: 'transform 400ms var(--ease-out), opacity 300ms' }}>
          <line x1="12" y1="1.5" x2="12" y2="3.5" />
          <line x1="12" y1="20.5" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="3.5" y2="12" />
          <line x1="20.5" y1="12" x2="22.5" y2="12" />
          <line x1="4.6" y1="4.6" x2="6" y2="6" />
          <line x1="18" y1="18" x2="19.4" y2="19.4" />
          <line x1="4.6" y1="19.4" x2="6" y2="18" />
          <line x1="18" y1="6" x2="19.4" y2="4.6" />
        </g>
      </svg>
    </button>
  );
}
