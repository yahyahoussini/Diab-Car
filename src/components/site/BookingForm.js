'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Button from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { TIMES } from '@/components/site/BookingWidget';
import { Price } from '@/components/site/Price';
import { ArrowIcon } from '@/components/site/icons';
import { submitBooking } from '@/lib/actions/booking';
import { addDays, formatDate, formatMAD, todayISO, toISO } from '@/lib/format';
import { quote } from '@/lib/pricing';
import { cn } from '@/lib/cn';

const COUNTRIES = ['MA', 'FR', 'ES', 'BE', 'NL', 'IT', 'DE', 'GB', 'US', 'CA', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'EG', 'DZ', 'TN', 'SN', 'CI', 'TR', 'CH', 'PT', 'SE'];
const DEFAULT_COUNTRY = { fr: 'FR', en: 'GB', ar: 'SA', es: 'ES' };
const CODE_BY_FIELD = { vehicle: 'vehicle', from: 'past', to: 'dates', name: 'name', phone: 'phone', email: 'email', age: 'age', consent: 'consent' };

export default function BookingForm({ vehicles, locations, extras, seasons, settings, initial = {} }) {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const tw = useTranslations('widget');
  const tv = useTranslations('vehicle');
  const locale = useLocale();
  const router = useRouter();
  const today = todayISO();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');

  const [form, setForm] = useState({
    vehicle: initial.vehicle || '',
    from: initial.from || addDays(today, 1),
    ft: initial.ft || '10:00',
    to: initial.to || addDays(today, 4),
    tt: initial.tt || '10:00',
    pickup: initial.pickup || 'airport',
    dropoff: initial.dropoff || initial.pickup || 'airport',
    pickupAddress: '',
    dropoffAddress: '',
    flightNumber: '',
    extras: initial.extras ? initial.extras.split(',').filter(Boolean) : [],
    name: '',
    phone: '',
    email: '',
    country: DEFAULT_COUNTRY[locale] || 'MA',
    age: '',
    notes: '',
    consent: false,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const vehicle = useMemo(() => vehicles.find((v) => v.slug === form.vehicle), [vehicles, form.vehicle]);
  const q = useMemo(
    () => (vehicle ? quote({ vehicle, startAt: toISO(form.from, form.ft), endAt: toISO(form.to, form.tt), seasons, extras, selectedExtras: form.extras.map((key) => ({ key, qty: 1 })), settings, pickupKey: form.pickup, dropoffKey: form.dropoff }) : null),
    [vehicle, form, seasons, extras, settings],
  );
  const locName = (key) => locations.find((l) => l.key === key)?.name?.[locale] || key;
  const countryName = useMemo(() => {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'region' });
      return (c) => dn.of(c) || c;
    } catch {
      return (c) => c;
    }
  }, [locale]);

  function validateStep(s) {
    const e = {};
    if (s === 1) {
      if (!form.vehicle) e.vehicle = t('errors.vehicle');
      if (new Date(toISO(form.to, form.tt)) <= new Date(toISO(form.from, form.ft))) e.to = t('errors.dates');
      if (form.from < today) e.from = t('errors.past');
    }
    if (s === 3) {
      if (form.name.trim().length < 3) e.name = t('errors.name');
      if (!/^\+?[\d\s().-]{8,20}$/.test(form.phone.trim())) e.phone = t('errors.phone');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = t('errors.email');
      const minAge = vehicle?.minAge || settings?.minAge || 21;
      if (!form.age || Number(form.age) < minAge) e.age = t('errors.age', { age: minAge });
      if (!form.consent) e.consent = t('errors.consent');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (validateStep(step)) {
      setStep((s) => Math.min(4, s + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function submit() {
    if (!validateStep(1) || !validateStep(3)) return;
    setGlobalError('');
    startTransition(async () => {
      const res = await submitBooking({ ...form, age: Number(form.age), locale });
      if (res?.ok) {
        router.push({ pathname: '/reservation/confirmation', query: { ref: res.reference } });
        return;
      }
      if (res?.fieldErrors) {
        const map = {};
        Object.keys(res.fieldErrors).forEach((k) => {
          const code = CODE_BY_FIELD[k] || 'generic';
          map[k] = code === 'age' ? t('errors.age', { age: res.minAge || 21 }) : t(`errors.${code}`);
        });
        setErrors(map);
        setStep(Object.keys(map).some((k) => ['vehicle', 'from', 'to'].includes(k)) ? 1 : 3);
      }
      setGlobalError(t('errors.generic'));
    });
  }

  const steps = ['1', '2', '3', '4'];

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="lg:col-span-8">
        {/* Stepper */}
        <ol className="mb-8 grid grid-cols-4 gap-2" aria-label={t('title')}>
          {steps.map((s, i) => (
            <li key={s} className={cn('border-t-2 pt-2 text-xs font-semibold transition-colors', i + 1 <= step ? 'border-accent text-text' : 'border-border text-text-muted')}>
              <span className="font-latin-sans me-1 text-text-muted">0{s}</span> {t(`steps.${s}`)}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <section className="card space-y-5 p-5 sm:p-6">
            <Field label={t('vehicle')} htmlFor="b-vehicle" error={errors.vehicle}>
              <Select id="b-vehicle" value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)}>
                <option value="">{t('chooseVehicle')}</option>
                {vehicles.map((v) => (
                  <option key={v.slug} value={v.slug}>
                    {v.brand} {v.model} {v.year} — {formatMAD(v.pricePerDay, locale)} {tc('perDay')}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tw('from')} htmlFor="b-from" error={errors.from}>
                <div className="grid grid-cols-[1fr_7.6rem] gap-2">
                  <Input id="b-from" type="date" min={today} value={form.from} onChange={(e) => { set('from', e.target.value); if (form.to <= e.target.value) set('to', addDays(e.target.value, 3)); }} />
                  <Select aria-label={tw('time')} value={form.ft} onChange={(e) => set('ft', e.target.value)}>
                    {TIMES.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </div>
              </Field>
              <Field label={tw('to')} htmlFor="b-to" error={errors.to}>
                <div className="grid grid-cols-[1fr_7.6rem] gap-2">
                  <Input id="b-to" type="date" min={addDays(form.from, 1)} value={form.to} onChange={(e) => set('to', e.target.value)} />
                  <Select aria-label={tw('time')} value={form.tt} onChange={(e) => set('tt', e.target.value)}>
                    {TIMES.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('pickup')} htmlFor="b-pickup">
                <Select id="b-pickup" value={form.pickup} onChange={(e) => set('pickup', e.target.value)}>
                  {locations.map((l) => (
                    <option key={l.key} value={l.key}>
                      {locName(l.key)}
                    </option>
                  ))}
                </Select>
                {form.pickup === 'address' ? <Input className="mt-2" placeholder={t('pickupAddress')} value={form.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} /> : null}
              </Field>
              <Field label={t('dropoff')} htmlFor="b-dropoff">
                <Select id="b-dropoff" value={form.dropoff} onChange={(e) => set('dropoff', e.target.value)}>
                  {locations.map((l) => (
                    <option key={l.key} value={l.key}>
                      {locName(l.key)}
                    </option>
                  ))}
                </Select>
                {form.dropoff === 'address' ? <Input className="mt-2" placeholder={t('pickupAddress')} value={form.dropoffAddress} onChange={(e) => set('dropoffAddress', e.target.value)} /> : null}
              </Field>
            </div>

            {form.pickup === 'airport' || form.dropoff === 'airport' ? (
              <Field label={t('flight')} htmlFor="b-flight" hint={t('flightHint')}>
                <Input id="b-flight" value={form.flightNumber} onChange={(e) => set('flightNumber', e.target.value)} placeholder="AT 785" className="font-latin-sans uppercase" />
              </Field>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="card p-5 sm:p-6">
            <h2 className="font-display text-2xl text-text">{t('extras')}</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {extras.filter((x) => x.active !== false).map((x) => {
                const on = form.extras.includes(x.key);
                return (
                  <label key={x.key} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 text-sm transition-colors', on ? 'border-accent bg-accent-soft/60' : 'border-border hover:border-border-strong')}>
                    <span className="flex items-center gap-3">
                      <input type="checkbox" className="accent-[var(--accent-fill)]" checked={on} onChange={(e) => set('extras', e.target.checked ? [...form.extras, x.key] : form.extras.filter((k) => k !== x.key))} />
                      <span className="font-medium text-text">{x.name?.[locale] || x.name?.fr}</span>
                    </span>
                    <span className="whitespace-nowrap text-xs text-text-muted">
                      <bdi className="tnum">{formatMAD(x.price, locale)}</bdi>
                      {x.type === 'per_day' ? ` ${tc('perDay')}` : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="card space-y-4 p-5 sm:p-6">
            <h2 className="font-display text-2xl text-text">{t('driver')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('name')} htmlFor="b-name" error={errors.name}>
                <Input id="b-name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label={t('phone')} htmlFor="b-phone" error={errors.phone}>
                <Input id="b-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+212 6…" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="font-latin-sans" />
              </Field>
              <Field label={t('email')} htmlFor="b-email" error={errors.email}>
                <Input id="b-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="font-latin-sans" />
              </Field>
              <Field label={t('country')} htmlFor="b-country">
                <Select id="b-country" value={form.country} onChange={(e) => set('country', e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {countryName(c)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('age')} htmlFor="b-age" error={errors.age}>
                <Input id="b-age" type="number" inputMode="numeric" min={18} max={90} value={form.age} onChange={(e) => set('age', e.target.value)} className="font-latin-sans" />
              </Field>
            </div>
            <Field label={t('notes')} htmlFor="b-notes" hint={t('notesHint')}>
              <Textarea id="b-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            <Field error={errors.consent}>
              <Checkbox
                id="b-consent"
                checked={form.consent}
                onChange={(e) => set('consent', e.target.checked)}
                label={
                  <>
                    {t('consent')}{' '}
                    <Link href="/conditions" className="text-accent underline underline-offset-4" target="_blank">
                      {tv('conditions')}
                    </Link>
                  </>
                }
              />
            </Field>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="card p-5 sm:p-6">
            <h2 className="font-display text-2xl text-text">{t('summary')}</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <SummaryRow label={t('vehicle')} value={vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year}` : '—'} />
              <SummaryRow label={t('pickup')} value={`${locName(form.pickup)}${form.pickupAddress ? ` — ${form.pickupAddress}` : ''} · ${formatDate(form.from, locale)} ${form.ft}`} />
              <SummaryRow label={t('dropoff')} value={`${locName(form.dropoff)}${form.dropoffAddress ? ` — ${form.dropoffAddress}` : ''} · ${formatDate(form.to, locale)} ${form.tt}`} />
              {form.flightNumber ? <SummaryRow label={t('flight')} value={form.flightNumber} /> : null}
              <SummaryRow label={t('driver')} value={`${form.name} · ${form.phone} · ${form.email}`} />
              <SummaryRow label={t('country')} value={`${countryName(form.country)} · ${form.age}`} />
              {form.extras.length ? <SummaryRow label={t('extras')} value={form.extras.map((k) => extras.find((x) => x.key === k)?.name?.[locale] || k).join(', ')} /> : null}
              {form.notes ? <SummaryRow label={t('notes')} value={form.notes} /> : null}
            </dl>
            <p className="mt-5 text-sm text-text-muted">{t('subtitle')}</p>
          </section>
        ) : null}

        {globalError ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {globalError}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
              {t('prev')}
            </Button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <Button type="button" onClick={next} size="lg">
              {t('next')}
              <ArrowIcon />
            </Button>
          ) : (
            <Button type="button" onClick={submit} size="lg" disabled={pending}>
              {pending ? t('submitting') : t('submit')}
            </Button>
          )}
        </div>
      </div>

      {/* Live quote */}
      <aside className="lg:col-span-4">
        <div className="card p-5 lg:sticky lg:top-[calc(var(--header-h)+1rem)]">
          <h2 className="font-display text-xl text-text">{t('summary')}</h2>
          {vehicle ? (
            <div className="mt-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={vehicle.imageUrl} alt="" width={120} height={57} className="plate w-24 rounded-lg p-1" />
              <div>
                <div className="font-semibold text-text">
                  {vehicle.brand} {vehicle.model}
                </div>
                <div className="text-xs text-text-muted">{tc(`categories.${vehicle.category}`)}</div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">{t('chooseVehicle')}</p>
          )}
          {q?.days ? (
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <Row label={tv('quote.days', { count: q.days, price: formatMAD(q.basePerDay, locale) })} value={formatMAD(q.basePerDay * q.days, locale)} />
              {q.seasonAdjustment ? <Row label={tv('quote.season')} value={`${q.seasonAdjustment > 0 ? '+' : ''}${formatMAD(q.seasonAdjustment, locale)}`} /> : null}
              {q.discountAmount ? <Row label={tv('quote.discount', { pct: q.discountPct })} value={`−${formatMAD(q.discountAmount, locale)}`} accent /> : null}
              {q.extrasTotal ? <Row label={tv('quote.extras')} value={formatMAD(q.extrasTotal, locale)} /> : null}
              <Row label={tv('quote.delivery')} value={q.deliveryFee + q.oneWayFee ? formatMAD(q.deliveryFee + q.oneWayFee, locale) : t('free')} />
              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <dt className="font-semibold text-text">{tv('quote.total')}</dt>
                <dd className="text-end">
                  <Price amount={q.total} className="font-display text-2xl text-text" eurClassName="block text-xs font-normal text-text-muted" />
                </dd>
              </div>
              <Row label={tv('quote.deposit')} value={formatMAD(q.deposit, locale)} muted />
            </dl>
          ) : null}
          {vehicle ? (
            <Link href={{ pathname: '/vehicules/[slug]', params: { slug: vehicle.slug } }} className="mt-4 block text-xs text-accent underline-offset-4 hover:underline">
              {t('changeVehicle')}
            </Link>
          ) : null}
        </div>
      </aside>
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

function SummaryRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.08em] text-text-muted rtl:tracking-normal">{label}</dt>
      <dd className="mt-0.5 text-text">{value}</dd>
    </div>
  );
}
