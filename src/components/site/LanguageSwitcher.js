'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, localeLabels } from '@/i18n/routing';
import { cn } from '@/lib/cn';

const SHORT = { fr: 'FR', en: 'EN', ar: 'AR', es: 'ES' };

export default function LanguageSwitcher({ className, variant = 'menu' }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function switchTo(next) {
    setOpen(false);
    if (next === locale) return;
    // Remember the explicit choice for one year (the proxy honours it on the root URL).
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.replace({ pathname, params }, { locale: next });
    });
  }

  if (variant === 'list') {
    return (
      <div className={cn('grid grid-cols-2 gap-2', className)} role="group" aria-label={t('language')}>
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            className={cn('flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors', l === locale ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface-1 text-text-2 hover:border-border-strong hover:text-text')}
            lang={l}
          >
            <span>{localeLabels[l]}</span>
            <span className="font-latin-sans text-xs text-text-muted">{SHORT[l]}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('language')}
        className="font-latin-sans inline-flex h-10 items-center gap-1.5 rounded-full border border-transparent px-3 text-sm font-semibold text-text-2 transition-colors hover:border-border hover:bg-surface-2 hover:text-text"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {SHORT[locale]}
      </button>
      {open ? (
        <ul role="listbox" className="absolute end-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-surface-1 p-1.5 shadow-float">
          {locales.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                type="button"
                lang={l}
                onClick={() => switchTo(l)}
                className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors', l === locale ? 'bg-accent-soft font-semibold text-accent' : 'text-text-2 hover:bg-surface-2 hover:text-text')}
              >
                <span>{localeLabels[l]}</span>
                <span className="font-latin-sans text-xs text-text-muted">{SHORT[l]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
