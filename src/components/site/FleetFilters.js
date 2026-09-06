'use client';

import { useCallback, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { CATEGORIES } from '@/lib/constants';

const KEEP = ['from', 'ft', 'to', 'tt', 'pickup', 'dropoff', 'promo'];

export default function FleetFilters({ counts = {}, total = 0 }) {
  const t = useTranslations('fleet');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (patch) => {
      const q = new URLSearchParams(sp.toString());
      Object.entries(patch).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k)));
      startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
    },
    [router, pathname, sp],
  );

  const reset = () => {
    const q = new URLSearchParams();
    KEEP.forEach((k) => sp.get(k) && q.set(k, sp.get(k)));
    startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  };

  const category = sp.get('category') || '';
  const hasFilters = ['category', 'transmission', 'fuel', 'seats', 'maxPrice', 'sort'].some((k) => sp.get(k));

  return (
    <div className={cn('space-y-4', pending && 'opacity-70')} aria-busy={pending}>
      <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        <div className="flex gap-2">
          <Chip active={!category} onClick={() => set({ category: '' })}>
            {t('all')} <span className="text-text-muted">{total}</span>
          </Chip>
          {CATEGORIES.filter((c) => counts[c]).map((c) => (
            <Chip key={c} active={category === c} onClick={() => set({ category: category === c ? '' : c })}>
              {tc(`categories.${c}`)} <span className="text-text-muted">{counts[c]}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select aria-label={t('transmission')} value={sp.get('transmission') || ''} onChange={(e) => set({ transmission: e.target.value })}>
          <option value="">{t('transmission')}</option>
          <option value="automatic">{tc('transmission.automatic')}</option>
          <option value="manual">{tc('transmission.manual')}</option>
        </Select>
        <Select aria-label={t('fuel')} value={sp.get('fuel') || ''} onChange={(e) => set({ fuel: e.target.value })}>
          <option value="">{t('fuel')}</option>
          {['petrol', 'diesel', 'hybrid'].map((f) => (
            <option key={f} value={f}>
              {tc(`fuel.${f}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t('seats')} value={sp.get('seats') || ''} onChange={(e) => set({ seats: e.target.value })}>
          <option value="">{t('seats')}</option>
          {[5, 7, 9].map((n) => (
            <option key={n} value={n}>
              {t('seatsMin', { count: n })}
            </option>
          ))}
        </Select>
        <Select aria-label={t('price')} value={sp.get('maxPrice') || ''} onChange={(e) => set({ maxPrice: e.target.value })}>
          <option value="">{t('price')}</option>
          {[300, 500, 1000, 2000].map((p) => (
            <option key={p} value={p}>
              ≤ {p} MAD
            </option>
          ))}
        </Select>
        <Select aria-label={t('sort')} value={sp.get('sort') || ''} onChange={(e) => set({ sort: e.target.value })}>
          {['recommended', 'price_asc', 'price_desc', 'newest'].map((s) => (
            <option key={s} value={s === 'recommended' ? '' : s}>
              {t(`sortOptions.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      {hasFilters ? (
        <button type="button" onClick={reset} className="text-sm font-semibold text-accent hover:underline">
          {t('reset')}
        </button>
      ) : null}
    </div>
  );
}

function Chip({ active, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors', active ? 'border-text bg-text text-bg' : 'border-border bg-surface-1 text-text-2 hover:border-border-strong hover:text-text')}
      {...props}
    >
      {children}
    </button>
  );
}
