'use client';

import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark } from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import { cn } from '@/lib/cn';

const AdminBaseContext = createContext('/admin');
export const useAdminBase = () => useContext(AdminBaseContext);

const NAV = [
  { href: '/', label: 'Tableau de bord', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { href: '/reservations', label: 'Réservations', icon: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
  { href: '/vehicules', label: 'Flotte', icon: 'M5 17h14M6 17l1-6h10l1 6M4 11l2-5h12l2 5' },
  { href: '/tarifs', label: 'Tarifs & saisons', icon: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { href: '/contenu/faq', label: 'FAQ', icon: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z' },
  { href: '/contenu/blog', label: 'Guide / Blog', icon: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5' },
  { href: '/avis', label: 'Avis clients', icon: 'M12 2l3 7 7 .8-5.2 4.8L18 22l-6-3.5L6 22l1.2-7.4L2 9.8 9 9z' },
  { href: '/seo', label: 'SEO & IA', icon: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z' },
  { href: '/parametres', label: 'Paramètres', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
];

export default function AdminShell({ base, session, mode, siteUrl, children, logoutAction }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = pathname.replace(/^\/admin/, '') || '/';

  return (
    <AdminBaseContext.Provider value={base}>
      <div className="flex min-h-dvh bg-bg text-text">
        <aside className={cn('fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e border-border bg-surface-1 transition-transform lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full')}>
          <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
            <LogoMark className="h-7 w-7" />
            <div className="leading-tight">
              <div className="font-latin-display text-lg font-semibold">DIAB CAR</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Administration</div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {NAV.map((item) => {
              const active = item.href === '/' ? current === '/' : current.startsWith(item.href);
              return (
                <Link key={item.href} href={`${base}${item.href}`} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', active ? 'bg-accent-soft text-accent' : 'text-text-2 hover:bg-surface-2 hover:text-text')}>
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border p-4 text-xs text-text-muted">
            <div className="truncate font-medium text-text-2">{session?.email}</div>
            <div className="mt-1 flex items-center justify-between">
              <span>{mode === 'supabase' ? 'Supabase connecté' : 'Mode démo (mémoire)'}</span>
              <form action={logoutAction}>
                <button type="submit" className="font-semibold text-accent hover:underline">
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </aside>

        {open ? <button type="button" aria-label="Fermer" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} /> : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur lg:px-8">
            <div className="flex items-center gap-3">
              <button type="button" className="rounded-lg border border-border p-2 lg:hidden" aria-label="Menu" onClick={() => setOpen(true)}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-text-2 hover:text-accent">
                Voir le site ↗
              </a>
            </div>
            <div className="flex items-center gap-2">
              {mode !== 'supabase' ? <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">Démo : les modifications ne sont pas persistées</span> : null}
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </AdminBaseContext.Provider>
  );
}
