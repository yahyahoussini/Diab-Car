'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import Logo from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import LanguageSwitcher from '@/components/site/LanguageSwitcher';
import { CurrencyToggle } from '@/components/site/CurrencyProvider';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/format';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

const NAV = [
  { key: 'fleet', href: '/vehicules' },
  { key: 'airport', href: '/aeroport' },
  { key: 'longTerm', href: '/longue-duree' },
  { key: 'chauffeur', href: '/avec-chauffeur' },
  { key: 'blog', href: '/blog' },
  { key: 'contact', href: '/contact' },
];

export default function Header({ phone, whatsapp, transparent = false }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  const solid = scrolled || open || !transparent;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300',
        solid ? 'border-b border-border/80 bg-bg/85 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/70' : 'border-b border-transparent bg-transparent',
      )}
      style={{ height: 'var(--header-h)' }}
    >
      <div className="container-x flex h-full items-center justify-between gap-4">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn('relative rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors', active ? 'text-text' : 'text-text-2 hover:text-text')}
              >
                {t(item.key)}
                {active ? <span className="absolute inset-x-3.5 -bottom-0.5 h-px bg-accent" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          {phone ? (
            <a href={`tel:${phone}`} className="font-latin-sans hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-text-2 transition-colors hover:text-text xl:inline-flex" aria-label={tc('call')}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <bdi>{formatPhone(phone)}</bdi>
            </a>
          ) : null}
          <div className="hidden items-center gap-1 md:flex">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <Button href="/reservation" size="md" className="hidden sm:inline-flex">
            {t('book')}
          </Button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-text lg:hidden"
            aria-label={open ? t('closeMenu') : t('openMenu')}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="relative block h-4 w-6" aria-hidden="true">
              <span className={cn('absolute inset-x-0 top-0 h-0.5 rounded bg-current transition-transform duration-300', open && 'translate-y-[7px] rotate-45')} />
              <span className={cn('absolute inset-x-0 top-[7px] h-0.5 rounded bg-current transition-opacity duration-200', open && 'opacity-0')} />
              <span className={cn('absolute inset-x-0 bottom-0 h-0.5 rounded bg-current transition-transform duration-300', open && '-translate-y-[7px] -rotate-45')} />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        className={cn('fixed inset-x-0 bottom-0 top-[var(--header-h)] z-30 overflow-y-auto bg-bg transition-[opacity,transform] duration-300 lg:hidden', open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0')}
        aria-hidden={!open}
      >
        <div className="container-x flex min-h-full flex-col gap-6 py-6">
          <nav className="flex flex-col" aria-label="Mobile">
            {NAV.map((item, i) => (
              <Link key={item.key} href={item.href} className="border-b border-border py-4 font-display text-2xl text-text" style={{ transitionDelay: `${i * 30}ms` }}>
                {t(item.key)}
              </Link>
            ))}
            <Link href="/faq" className="border-b border-border py-4 font-display text-2xl text-text">
              {t('faq')}
            </Link>
            <Link href="/a-propos" className="border-b border-border py-4 font-display text-2xl text-text">
              {t('about')}
            </Link>
          </nav>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button href="/reservation" size="lg">
              {t('book')}
            </Button>
            {whatsapp ? (
              <Button href={whatsappLink(whatsapp, genericMessage(locale))} external variant="whatsapp" size="lg">
                {tc('whatsapp')}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-1 p-4">
            <span className="text-sm font-semibold text-text-2">{tc('language')}</span>
            <div className="flex items-center gap-2">
              <CurrencyToggle />
              <ThemeToggle />
            </div>
            <LanguageSwitcher variant="list" className="w-full" />
          </div>
          {phone ? (
            <a href={`tel:${phone}`} className="font-latin-sans text-center text-sm font-semibold text-text-2">
              <bdi>{formatPhone(phone)}</bdi>
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
