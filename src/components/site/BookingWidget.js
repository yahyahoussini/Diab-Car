'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Checkbox, Input, Label, Select } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import { addDays, todayISO } from '@/lib/format';
import { cn } from '@/lib/cn';

export const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export default function BookingWidget({ locations = [], compact = false, className, initial = {} }) {
  const t = useTranslations('widget');
  const locale = useLocale();
  const router = useRouter();
  const today = todayISO();
  const [tab, setTab] = useState('short');
  const [pickup, setPickup] = useState(initial.pickup || 'airport');
  const [dropoff, setDropoff] = useState(initial.dropoff || '');
  const [different, setDifferent] = useState(Boolean(initial.dropoff && initial.dropoff !== initial.pickup));
  const [from, setFrom] = useState(initial.from || addDays(today, 1));
  const [ft, setFt] = useState(initial.ft || '10:00');
  const [to, setTo] = useState(initial.to || addDays(today, 4));
  const [tt, setTt] = useState(initial.tt || '10:00');
  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState('');
  const [error, setError] = useState('');

  const locOptions = useMemo(() => locations.map((l) => ({ key: l.key, label: l.name?.[locale] || l.name?.fr || l.key })), [locations, locale]);

  function submit(e) {
    e.preventDefault();
    if (tab === 'long') return router.push('/longue-duree');
    if (tab === 'chauffeur') return router.push('/avec-chauffeur');
    if (new Date(`${to}T${tt}`) <= new Date(`${from}T${ft}`)) {
      setError(t('errors.dates'));
      return;
    }
    setError('');
    const q = new URLSearchParams({ from, ft, to, tt, pickup, dropoff: different && dropoff ? dropoff : pickup });
    if (promo) q.set('promo', promo);
    router.push(`/vehicules?${q.toString()}`);
  }

  return (
    <form onSubmit={submit} className={cn('card relative p-4 sm:p-5 lg:p-6', className)} aria-label={t('title')}>
      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-full bg-surface-2 p-1" role="tablist">
        {['short', 'long', 'chauffeur'].map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors', tab === k ? 'bg-surface-1 text-text shadow-card' : 'text-text-muted hover:text-text')}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      <div className={cn('grid gap-3', compact ? 'lg:grid-cols-[1.3fr_1fr_1fr_auto]' : 'lg:grid-cols-[1.4fr_1fr_1fr_auto]')}>
        <div>
          <Label htmlFor="w-pickup">{t('pickup')}</Label>
          <Select id="w-pickup" value={pickup} onChange={(e) => setPickup(e.target.value)}>
            {locOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
          <label className="mt-2 flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={different} onChange={(e) => setDifferent(e.target.checked)} className="accent-[var(--accent-fill)]" />
            {t('differentDropoff')}
          </label>
          {different ? (
            <div className="mt-2">
              <Label htmlFor="w-dropoff">{t('dropoff')}</Label>
              <Select id="w-dropoff" value={dropoff || pickup} onChange={(e) => setDropoff(e.target.value)}>
                {locOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor="w-from">{t('from')}</Label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input id="w-from" type="date" min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (to <= e.target.value) setTo(addDays(e.target.value, 3)); }} required />
            <Select aria-label={t('time')} value={ft} onChange={(e) => setFt(e.target.value)} className="!w-[7.6rem] !pe-8">
              {TIMES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="w-to">{t('to')}</Label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input id="w-to" type="date" min={addDays(from, 1)} value={to} onChange={(e) => setTo(e.target.value)} required />
            <Select aria-label={t('time')} value={tt} onChange={(e) => setTt(e.target.value)} className="!w-[7.6rem] !pe-8">
              {TIMES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-end">
          <Button type="submit" size="xl" className="w-full lg:w-auto">
            {tab === 'short' ? t('submit') : tab === 'long' ? t('submitLong') : t('submitChauffeur')}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox id="w-age" label={t('driverAge')} defaultChecked />
          {promoOpen ? (
            <Input aria-label={t('promo')} value={promo} onChange={(e) => setPromo(e.target.value)} placeholder={t('promo')} className="h-9 w-40 min-h-9 py-1" />
          ) : (
            <button type="button" onClick={() => setPromoOpen(true)} className="text-xs font-semibold text-accent hover:underline">
              {t('addPromo')}
            </button>
          )}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          {['noFees', 'cancel', 'airport'].map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-success" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {t(`trust.${k}`)}
            </li>
          ))}
        </ul>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
