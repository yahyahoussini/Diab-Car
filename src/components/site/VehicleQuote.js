'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Button from '@/components/ui/Button';
import { Input, Label, Select } from '@/components/ui/Field';
import { TIMES } from '@/components/site/BookingWidget';
import { Price } from '@/components/site/Price';
import { WhatsAppIcon } from '@/components/site/icons';
import { addDays, formatMAD, todayISO, toISO } from '@/lib/format';
import { quote } from '@/lib/pricing';
import { vehicleInquiryMessage, whatsappLink } from '@/lib/whatsapp';

/** Sticky price panel on the vehicle page: dates + pickup → live total. */
export default function VehicleQuote({ vehicle, seasons, extras, settings, locations, initial = {} }) {
  const t = useTranslations('vehicle');
  const tc = useTranslations('common');
  const tw = useTranslations('widget');
  const locale = useLocale();
  const today = todayISO();
  const [from, setFrom] = useState(initial.from || addDays(today, 1));
  const [ft, setFt] = useState(initial.ft || '10:00');
  const [to, setTo] = useState(initial.to || addDays(today, 4));
  const [tt, setTt] = useState(initial.tt || '10:00');
  const [pickup, setPickup] = useState(initial.pickup || 'airport');
  const [selected, setSelected] = useState([]);

  const q = useMemo(
    () => quote({ vehicle, startAt: toISO(from, ft), endAt: toISO(to, tt), seasons, extras, selectedExtras: selected.map((key) => ({ key, qty: 1 })), settings, pickupKey: pickup, dropoffKey: pickup }),
    [vehicle, from, ft, to, tt, seasons, extras, selected, settings, pickup],
  );

  const bookingQuery = { vehicle: vehicle.slug, from, ft, to, tt, pickup, extras: selected.join(',') };
  const pickupLabel = locations.find((l) => l.key === pickup)?.name?.[locale];
  const wa = settings?.whatsapp ? whatsappLink(settings.whatsapp, vehicleInquiryMessage(locale, { vehicleName: `${vehicle.brand} ${vehicle.model}`, from, to, pickup: pickupLabel })) : null;

  return (
    <div className="card p-5 lg:sticky lg:top-[calc(var(--header-h)+1rem)]">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text-muted">{t('priceFrom')}</span>
        <Price amount={vehicle.pricePerDay} className="font-display text-3xl text-text" suffix={tc('perDay')} eurClassName="block text-end text-xs font-normal text-text-muted" />
      </div>

      <div className="mt-5 grid gap-3">
        <div>
          <Label htmlFor="q-pickup">{tw('pickup')}</Label>
          <Select id="q-pickup" value={pickup} onChange={(e) => setPickup(e.target.value)}>
            {locations.map((l) => (
              <option key={l.key} value={l.key}>
                {l.name?.[locale] || l.name?.fr}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="q-from">{tw('from')}</Label>
            <Input id="q-from" type="date" min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (to <= e.target.value) setTo(addDays(e.target.value, 3)); }} />
            <Select aria-label={tw('time')} value={ft} onChange={(e) => setFt(e.target.value)} className="mt-2">
              {TIMES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="q-to">{tw('to')}</Label>
            <Input id="q-to" type="date" min={addDays(from, 1)} value={to} onChange={(e) => setTo(e.target.value)} />
            <Select aria-label={tw('time')} value={tt} onChange={(e) => setTt(e.target.value)} className="mt-2">
              {TIMES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {extras?.length ? (
          <fieldset className="mt-1">
            <legend className="mb-1.5 text-[13px] font-semibold text-text-2">{t('quote.extras')}</legend>
            <div className="space-y-1.5">
              {extras.filter((x) => x.active !== false && x.key !== 'chauffeur').map((x) => (
                <label key={x.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm hover:border-border-strong">
                  <span className="flex items-center gap-2.5">
                    <input type="checkbox" className="accent-[var(--accent-fill)]" checked={selected.includes(x.key)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, x.key] : s.filter((k) => k !== x.key)))} />
                    <span className="text-text-2">{x.name?.[locale] || x.name?.fr}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-text-muted">
                    <bdi className="tnum">{formatMAD(x.price, locale)}</bdi>
                    {x.type === 'per_day' ? ` ${tc('perDay')}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      {q.days ? (
        <dl className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm" aria-live="polite">
          <Row label={t('quote.days', { count: q.days, price: formatMAD(q.basePerDay, locale) })} value={formatMAD(q.basePerDay * q.days, locale)} />
          {q.seasonAdjustment ? <Row label={t('quote.season')} value={`${q.seasonAdjustment > 0 ? '+' : ''}${formatMAD(q.seasonAdjustment, locale)}`} /> : null}
          {q.discountAmount ? <Row label={t('quote.discount', { pct: q.discountPct })} value={`−${formatMAD(q.discountAmount, locale)}`} accent /> : null}
          {q.extrasTotal ? <Row label={t('quote.extras')} value={formatMAD(q.extrasTotal, locale)} /> : null}
          <Row label={t('quote.delivery')} value={q.deliveryFee ? formatMAD(q.deliveryFee, locale) : '0 MAD'} />
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <dt className="font-semibold text-text">{t('quote.total')}</dt>
            <dd className="text-end">
              <Price amount={q.total} className="font-display text-2xl text-text" eurClassName="block text-xs font-normal text-text-muted" />
              <div className="text-xs text-text-muted">{t('quote.perDay', { price: formatMAD(q.perDayEffective, locale) })}</div>
            </dd>
          </div>
          <Row label={t('quote.deposit')} value={formatMAD(q.deposit, locale)} muted />
        </dl>
      ) : (
        <p className="mt-5 text-sm text-text-muted">{t('selectDates')}</p>
      )}

      <div className="mt-5 grid gap-2">
        <Button href={{ pathname: '/reservation', query: bookingQuery }} size="lg" className="w-full">
          {t('book')}
        </Button>
        {wa ? (
          <Button href={wa} external variant="whatsapp" size="lg" className="w-full">
            <WhatsAppIcon className="h-5 w-5" />
            {t('ask')}
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-center text-xs text-text-muted">{t('depositNote', { days: settings?.depositReleaseDays || 7 })}</p>
      <Link href="/conditions" className="mt-1 block text-center text-xs text-accent underline-offset-4 hover:underline">
        {t('conditions')}
      </Link>
    </div>
  );
}

function Row({ label, value, accent, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-text-muted' : 'text-text-2'}>{label}</dt>
      <dd className={`tnum ${accent ? 'text-success' : muted ? 'text-text-muted' : 'text-text'}`}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
