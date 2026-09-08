'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from '@/components/ui/Sheet';
import { submitBooking } from '@/lib/actions/booking';
import { formatDate, formatMAD } from '@/lib/format';
import { t as pick } from '@/lib/constants';
import { cn } from '@/lib/cn';

/**
 * Booking one car, from that car (plan 4.7, owner's revision Sept 2026).
 *
 * The flow used to start from dates and end at a car. It now starts from the
 * CAR and asks when — which is how somebody who has just fallen for a
 * particular Logan actually thinks, and it lets the first screen answer the
 * only question they have: *can I have THIS one, on THOSE days?*
 *
 * Three steps, one sheet: dates and places, options, coordinates.
 *
 * The rule that shapes everything here: **this component never decides
 * availability** (CLAUDE.md rule 5). The calendar greys days out from
 * /api/vehicle-calendar, which is a per-day HINT — three units where A is free
 * Mon-Wed and B Wed-Fri leave every day "free" while no single unit covers
 * Mon-Fri, and the exclusion constraint is per unit. So the moment a range is
 * picked it goes to /api/quote, which asks free_units() for that exact window,
 * and the continue button stays shut until Postgres has said yes.
 *
 * Rule 4 is the other constraint: once dates are known the footer carries the
 * per-day price AND the total for those dates, the breakdown opens from every
 * step, and nothing appears at the end that was not visible earlier.
 */

/* The calendar is react-aria plus @internationalized/date. It is loaded when
   the sheet opens, never before — the fleet grid and the vehicle page must not
   pay for it on first paint (rule 7). */
const RangeCalendarPanel = dynamic(() => import('@/components/site/RangeCalendarPanel'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-surface-2" />,
});

const STEPS = 3;
const DEFAULT_TIME = '10:00';

/**
 * yyyy-mm-dd in Casablanca terms (the app's fixed +01:00).
 * Takes a Date, a timestamp or an ISO string — `addDays` hands it the result of
 * arithmetic, and a version that only accepted a Date crashed the whole sheet
 * on open with "e.getTime is not a function".
 */
const isoDay = (d) => new Date(new Date(d).getTime() + 3600000).toISOString().slice(0, 10);
const addDays = (day, n) => isoDay(new Date(`${day}T00:00:00+01:00`).getTime() + n * 86400000);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00+01:00`) - Date.parse(`${a}T00:00:00+01:00`)) / 86400000);

export default function QuickBooking({ open, onClose, vehicle, locations = [], extras = [], locale = 'fr', labels, settings }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [editingDates, setEditingDates] = useState(true);

  const [range, setRange] = useState({ from: '', to: '' });
  const [pickup, setPickup] = useState(() => locations[0]?.key || 'agence-zerktouni');
  const [dropoff, setDropoff] = useState(null); // null = same as pickup
  const [chosenExtras, setChosenExtras] = useState([]);

  /* day -> free units, merged across every month fetched so far. It only ever
     grows: showing last month's answer while the next one loads beats blanking
     the grid, and a day that has been checked stays checked. */
  const [days, setDays] = useState({});
  const [calendarState, setCalendarState] = useState('loading');
  const [window_, setWindow] = useState(() => {
    const today = isoDay(new Date());
    return { start: today, end: addDays(today, 62) };
  });

  /* The quote is stored WITH the inputs it answers. `quoting` and `quote` are
     then derived from whether that key still matches what is on screen, so a
     price can never outlive the dates it was calculated for (rule 4). */
  const [answered, setAnswered] = useState(null);
  const [customer, setCustomer] = useState({ firstName: '', lastName: '', phone: '', email: '', consent: false });
  const [submitState, setSubmitState] = useState({ status: 'idle' });

  /* Every fetch carries a sequence number. A slow answer for dates the
     customer has already changed must never overwrite a newer one — the whole
     point of the quote is that it matches what is on screen. */
  const seq = useRef(0);

  /* ------------------------------------------------------------ calendar */

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({ vehicle: vehicle.slug, from: window_.start, to: window_.end });
        const res = await fetch(`/api/vehicle-calendar?${params}`, { signal: controller.signal, cache: 'no-store' });
        const json = await res.json();
        if (!json?.ok) {
          setCalendarState('error');
          return;
        }
        setDays((current) => {
          const merged = { ...current };
          for (const d of json.days) merged[d.day] = d.free;
          return merged;
        });
        setCalendarState('ready');
      } catch (error) {
        if (error?.name !== 'AbortError') setCalendarState('error');
      }
    })();
    return () => controller.abort();
  }, [open, vehicle.slug, window_.start, window_.end]);

  /* A day is offered only when the database says a unit is free on it. Days we
     have not loaded stay selectable: refusing what we have not checked would
     be the UI deciding, and /api/quote settles the range anyway. */
  const isDateUnavailable = useCallback(
    (date) => {
      const key = date.toString();
      return Object.hasOwn(days, key) && days[key] <= 0;
    },
    [days],
  );

  /* --------------------------------------------------------------- quote */

  const resolvedDropoff = dropoff || pickup;
  const quoteKey = useMemo(
    () => JSON.stringify([range.from, range.to, pickup, resolvedDropoff, [...chosenExtras].sort()]),
    [range.from, range.to, pickup, resolvedDropoff, chosenExtras],
  );

  useEffect(() => {
    if (!open || !range.from || !range.to) return undefined;
    const mine = ++seq.current;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({
          vehicle: vehicle.slug,
          startAt: `${range.from}T${DEFAULT_TIME}:00+01:00`,
          endAt: `${range.to}T${DEFAULT_TIME}:00+01:00`,
          pickup,
          dropoff: resolvedDropoff,
          locale,
        });
        for (const key of chosenExtras) params.append('extras', key);
        const res = await fetch(`/api/quote?${params}`, { signal: controller.signal, cache: 'no-store' });
        const json = await res.json();
        if (mine !== seq.current) return; // a newer request already answered
        setAnswered({ key: quoteKey, data: json?.ok ? json : { ok: false, error: json?.error || 'server', minDays: json?.minDays, days: json?.days } });
      } catch (error) {
        if (error?.name !== 'AbortError' && mine === seq.current) setAnswered({ key: quoteKey, data: { ok: false, error: 'server' } });
      }
    })();
    return () => controller.abort();
  }, [open, quoteKey, vehicle.slug, range.from, range.to, pickup, resolvedDropoff, chosenExtras, locale]);

  /* --------------------------------------------------------------- state */

  /* Both derived from the key, never stored: if they disagreed with the form
     for even one render, the customer would see a price for other dates. */
  const quote = answered?.key === quoteKey ? answered.data : null;
  const quoting = Boolean(range.from && range.to) && answered?.key !== quoteKey;

  const nights = range.from && range.to ? daysBetween(range.from, range.to) : 0;
  const available = quote?.ok ? quote.availability?.available !== false : false;
  const breakdown = quote?.ok ? quote.quote : null;
  const minDaysError = quote && !quote.ok && quote.error === 'min_days';
  const canLeaveStepOne = Boolean(range.from && range.to && quote?.ok && available && !quoting);

  const place = (key) => locations.find((l) => l.key === key) || null;
  const placeName = (l) => pick(l?.name, locale) || l?.key || '';
  const feeOf = (l) => {
    const raw = l?.deliveryFee ?? l?.deliveryFeeMad;
    return raw === null || raw === undefined ? null : Number(raw);
  };

  const reset = useCallback(() => {
    setStep(1);
    setEditingDates(true);
    setSubmitState({ status: 'idle' });
  }, []);

  const close = useCallback(() => {
    onClose();
    reset();
  }, [onClose, reset]);

  /* -------------------------------------------------------------- submit */

  const submit = async (event) => {
    event.preventDefault();
    if (!customer.consent || !customer.firstName.trim() || !customer.phone.trim()) {
      setSubmitState({ status: 'error', message: labels.errorFields });
      return;
    }
    setSubmitState({ status: 'sending' });

    const result = await submitBooking({
      vehicle: vehicle.slug,
      from: range.from,
      ft: DEFAULT_TIME,
      to: range.to,
      tt: DEFAULT_TIME,
      pickup,
      dropoff: resolvedDropoff,
      extras: chosenExtras,
      name: `${customer.firstName.trim()} ${customer.lastName.trim()}`.trim(),
      phone: customer.phone.trim(),
      email: customer.email.trim(),
      consent: true,
      locale,
    });

    if (result?.ok) {
      /* The confirmation page is the one place that shows a reference, and it
         reads the figures the funnel hands it rather than the database (no
         anonymous read path to reservations). Same route, same contract. */
      /* The confirmation route is localized by next-intl, so it is pushed as
         a plain path with the locale prefix the sheet was opened in. */
      router.push(`/${locale}/reservation/confirmation?ref=${encodeURIComponent(result.reference)}`);
      return;
    }
    setSubmitState({
      status: 'error',
      message:
        result?.error === 'sold_out' ? labels.takenBody
          : result?.error === 'validation' ? labels.errorFields
            : labels.errorServer,
    });
  };

  /* ---------------------------------------------------------------- view */

  const subtitle = step === 1 ? (editingDates ? labels.subtitleDates : labels.subtitleReview) : step === 2 ? labels.subtitleOptions : labels.subtitleDetails;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={labels.title}
      labelClose={labels.close}
      wide
      /* The total and the button live in the sheet's own footer, so they stay
         put while the calendar and the place list scroll (rule 4: the price is
         never something you have to go looking for). */
      footer={
        <PriceFooter
          labels={labels}
          locale={locale}
          nights={nights}
          breakdown={breakdown}
          quoting={quoting}
          place={place(pickup)}
          placeName={placeName}
          step={step}
          canContinue={step === 1 ? canLeaveStepOne : true}
          onBack={() => (step === 1 ? close() : setStep(step - 1))}
          onContinue={() => setStep(Math.min(STEPS, step + 1))}
          showSubmit={step === 3}
          submitFormId="quickbook-details"
          state={submitState}
        />
      }
    >
      <div data-testid="quickbook" data-step={step}>
        <p className="text-meta text-text-muted">{subtitle}</p>

        <Stepper step={step} labels={labels} />

        <div className="mt-5 rounded-xl border border-border bg-surface-2/60 p-4">
          <p className="text-meta font-semibold text-text">
            {vehicle.brand} {vehicle.model}
          </p>
          {vehicle.year ? <p className="text-meta text-text-muted">{vehicle.year}</p> : null}
        </div>

        {step === 1 ? (
          <StepDates
            labels={labels}
            locale={locale}
            range={range}
            nights={nights}
            editing={editingDates}
            onEdit={() => setEditingDates(true)}
            onCollapse={() => setEditingDates(false)}
            onChange={(from, to) => {
              setRange({ from, to });
              setEditingDates(false);
            }}
            onVisibleRangeChange={(r) => setWindow({ start: r.start, end: r.end })}
            isDateUnavailable={isDateUnavailable}
            calendarState={calendarState}
            onRetry={() => setWindow((w) => ({ ...w }))}
            locations={locations}
            pickup={pickup}
            dropoff={dropoff}
            onPickup={setPickup}
            onDropoff={setDropoff}
            placeName={placeName}
            feeOf={feeOf}
            quote={quote}
            quoting={quoting}
            available={available}
            minDaysError={minDaysError}
          />
        ) : null}

        {step === 2 ? (
          <StepOptions
            labels={labels}
            locale={locale}
            extras={extras}
            chosen={chosenExtras}
            onToggle={(key) => setChosenExtras((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))}
            nights={nights}
          />
        ) : null}

        {step === 3 ? (
          <StepDetails
            labels={labels}
            customer={customer}
            onChange={(patch) => setCustomer((c) => ({ ...c, ...patch }))}
            breakdown={breakdown}
            locale={locale}
            settings={settings}
            vehicle={vehicle}
            state={submitState}
            onSubmit={submit}
          />
        ) : null}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ parts */

function Stepper({ step, labels }) {
  const names = [labels.stepDates, labels.stepOptions, labels.stepDetails];
  return (
    <div className="mt-4">
      <p className="text-meta text-text-muted">
        {labels.stepOf.replace('{n}', String(step)).replace('{total}', String(STEPS))} · {names[step - 1]}
      </p>
      {/* The bar mirrors in RTL for free: it is a flex row of equal segments,
          so the reading edge is the start edge in both directions. */}
      <ol className="mt-2 flex gap-1" aria-label={names.join(' · ')}>
        {names.map((name, index) => (
          <li key={name} className="flex-1">
            <span
              aria-current={index + 1 === step ? 'step' : undefined}
              className={cn('block h-1 rounded-full transition-colors', index + 1 <= step ? 'bg-red-signal' : 'bg-surface-3')}
            />
            <span className={cn('mt-1.5 block text-[11px]', index + 1 === step ? 'font-semibold text-text' : 'text-text-muted')}>{name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepDates({
  labels, locale, range, nights, editing, onEdit, onCollapse, onChange, onVisibleRangeChange,
  isDateUnavailable, calendarState, onRetry, locations, pickup, dropoff, onPickup, onDropoff,
  placeName, feeOf, quote, quoting, available, minDaysError,
}) {
  const chosen = Boolean(range.from && range.to);

  return (
    <div className="mt-5 space-y-4">
      {chosen ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 p-4">
          <div>
            <p className="text-meta font-semibold text-text">{labels.period}</p>
            <p className="tnum text-meta text-text-2">
              {formatDate(`${range.from}T10:00:00+01:00`, locale)} → {formatDate(`${range.to}T10:00:00+01:00`, locale)}
            </p>
            <p className="tnum text-meta text-text-muted">{nights === 1 ? labels.oneDay : labels.nDays.replace('{n}', String(nights))}</p>
          </div>
          <button type="button" onClick={editing ? onCollapse : onEdit} className="text-meta font-semibold text-red-signal underline-offset-4 hover:underline">
            {editing ? labels.confirmDates : labels.changeDates}
          </button>
        </div>
      ) : null}

      {editing || !chosen ? (
        <div data-testid="quickbook-calendar">
          <p className="text-meta font-semibold text-text">{labels.pickDates}</p>
          <p className="text-meta mt-0.5 text-text-muted">{labels.pickDatesHint}</p>

          {calendarState === 'error' ? (
            <div className="mt-3 rounded-xl border border-border p-4">
              <p className="text-meta text-text-2">{labels.calendarError}</p>
              <button type="button" onClick={onRetry} className="text-meta mt-2 font-semibold text-red-signal">
                {labels.retry}
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <RangeCalendarPanel
                locale={locale}
                from={range.from}
                to={range.to}
                onChange={onChange}
                isDateUnavailable={isDateUnavailable}
                onVisibleRangeChange={onVisibleRangeChange}
                labels={{ calendar: labels.pickDates, previousMonth: labels.back, nextMonth: labels.continue }}
              />
            </div>
          )}
        </div>
      ) : null}

      {chosen && !quoting && quote && !quote.ok && minDaysError ? (
        <p className="text-meta rounded-xl border border-warning bg-warning-soft/25 p-3 text-text" role="status">
          {labels.minDays.replace('{n}', String(quote.minDays ?? 1))}
        </p>
      ) : null}

      {chosen && !quoting && quote?.ok && !available ? (
        <div className="rounded-xl border border-red-signal bg-red-soft/25 p-3" role="status" data-testid="quickbook-soldout">
          <p className="text-meta font-semibold text-text">{labels.soldOut}</p>
          <p className="text-meta text-text-2">{labels.soldOutHint}</p>
          {quote.availability?.nextAvailableAt ? (
            <p className="tnum text-meta mt-1 text-text-2">{labels.nextAvailable.replace('{date}', formatDate(quote.availability.nextAvailableAt, locale))}</p>
          ) : null}
        </div>
      ) : null}

      {chosen && quote?.ok && available && quote.availability?.lastOne ? (
        <p className="text-meta text-red-signal">{labels.lastOne}</p>
      ) : null}

      {chosen ? (
        <>
          <PlaceList
            title={labels.pickupPlace}
            locations={locations}
            value={pickup}
            onChange={onPickup}
            placeName={placeName}
            feeOf={feeOf}
            labels={labels}
            locale={locale}
            testid="quickbook-pickup"
          />
          <div className="rounded-xl border border-border p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={dropoff === null}
                onChange={(e) => onDropoff(e.target.checked ? null : pickup)}
                className="h-4 w-4 accent-red"
              />
              <span className="text-meta text-text-2">{labels.sameAsPickup}</span>
            </label>
            {dropoff !== null ? (
              <div className="mt-3">
                <PlaceList
                  title={labels.dropoffPlace}
                  locations={locations}
                  value={dropoff}
                  onChange={onDropoff}
                  placeName={placeName}
                  feeOf={feeOf}
                  labels={labels}
                  locale={locale}
                  testid="quickbook-dropoff"
                  bare
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Places as priced cards. A null fee is « sur devis », never 0 — plan 6.2 is
 * explicit that an unset delivery fee is unknown, and showing it as free would
 * invent a fact (rule 11).
 */
function PlaceList({ title, locations, value, onChange, placeName, feeOf, labels, locale, testid, bare = false }) {
  return (
    <fieldset className={bare ? '' : 'rounded-xl border border-border p-4'} data-testid={testid}>
      <legend className="text-meta font-semibold text-text">{title}</legend>
      <div className="mt-3 space-y-2">
        {locations.map((l) => {
          const fee = feeOf(l);
          const selected = value === l.key;
          return (
            <label
              key={l.key}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors',
                selected ? 'border-red-signal bg-red-soft/20' : 'border-border hover:border-border-strong',
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type="radio"
                  name={testid}
                  checked={selected}
                  onChange={() => onChange(l.key)}
                  className="h-4 w-4 shrink-0 accent-red"
                  data-place={l.key}
                />
                <span className="text-meta truncate text-text">{placeName(l)}</span>
              </span>
              <span className={cn('text-meta shrink-0', fee ? 'tnum text-text-2' : 'text-text-muted')}>
                {fee === null ? labels.onRequest : fee > 0 ? `+ ${formatMAD(fee, locale)}` : labels.included}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function StepOptions({ labels, locale, extras, chosen, onToggle, nights }) {
  const active = extras.filter((x) => x.active !== false);
  return (
    <div className="mt-5" data-testid="quickbook-options">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-meta font-semibold text-text">{labels.optionsTitle}</p>
        <span className="text-meta text-text-muted">{labels.optional}</span>
      </div>

      {active.length === 0 ? (
        <p className="text-meta mt-3 rounded-xl border border-border bg-surface-2/60 p-4 text-text-muted">{labels.optionsNone}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {active.map((x) => {
            const unit = Number(x.price) || 0;
            const line = x.type === 'per_day' ? unit * Math.max(1, nights) : unit;
            return (
              <li key={x.key}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 hover:border-border-strong">
                  <input type="checkbox" checked={chosen.includes(x.key)} onChange={() => onToggle(x.key)} className="mt-1 h-4 w-4 shrink-0 accent-red" data-extra={x.key} />
                  <span className="min-w-0 flex-1">
                    <span className="text-meta block font-semibold text-text">{pick(x.name, locale) || x.key}</span>
                    <span className="text-meta block text-text-muted">
                      {formatMAD(unit, locale)} {x.type === 'per_day' ? labels.perDay : labels.perRental}
                    </span>
                  </span>
                  <span className="tnum text-meta shrink-0 font-semibold text-text">{formatMAD(line, locale)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StepDetails({ labels, customer, onChange, breakdown, locale, settings, vehicle, state, onSubmit }) {
  const minAge = vehicle.minAge || settings?.minAge || 21;
  return (
    <form id="quickbook-details" onSubmit={onSubmit} className="mt-5 space-y-4" data-testid="quickbook-details">
      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
        <p className="text-meta font-semibold text-text">{labels.noAccount}</p>
        <p className="text-meta text-text-muted">{labels.noAccountBody}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.firstName} required>
          <input value={customer.firstName} onChange={(e) => onChange({ firstName: e.target.value })} required autoComplete="given-name" data-testid="qb-first-name" className={INPUT} />
        </Field>
        <Field label={labels.lastName}>
          <input value={customer.lastName} onChange={(e) => onChange({ lastName: e.target.value })} autoComplete="family-name" data-testid="qb-last-name" className={INPUT} />
        </Field>
        <Field label={labels.phone} required>
          <input value={customer.phone} onChange={(e) => onChange({ phone: e.target.value })} required inputMode="tel" autoComplete="tel" placeholder="+212 6XX XXX XXX" data-testid="qb-phone" className={cn(INPUT, 'font-latin-sans')} />
        </Field>
        <Field label={labels.emailOptional}>
          <input type="email" value={customer.email} onChange={(e) => onChange({ email: e.target.value })} autoComplete="email" data-testid="qb-email" className={INPUT} />
        </Field>
      </div>

      {/* Rule 4: the whole breakdown, before the button that commits to it. */}
      {breakdown ? <Breakdown breakdown={breakdown} labels={labels} locale={locale} /> : null}

      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
        <p className="text-meta font-semibold text-text">{labels.paymentTitle}</p>
        <p className="text-meta text-text-muted">{labels.paymentBody}</p>
        {breakdown?.deposit ? <p className="tnum text-meta mt-1 text-text-2">{labels.depositNote.replace('{amount}', formatMAD(breakdown.deposit, locale))}</p> : null}
        <p className="tnum text-meta mt-2 text-text-muted">{labels.driverAge.replace('{n}', String(minAge))}</p>
      </div>

      <label className="flex items-start gap-3">
        <input type="checkbox" checked={customer.consent} onChange={(e) => onChange({ consent: e.target.checked })} required className="mt-1 h-4 w-4 shrink-0 accent-red" data-testid="qb-consent" />
        <span className="text-meta text-text-2">{labels.consent}</span>
      </label>

      {state.status === 'error' ? (
        <p className="text-meta rounded-xl border border-red-signal bg-red-soft/25 p-3 text-text" role="alert" data-testid="quickbook-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function Breakdown({ breakdown, labels, locale }) {
  return (
    <dl className="space-y-1.5 rounded-xl border border-border p-4" data-testid="quickbook-breakdown">
      <Line label={`${formatMAD(breakdown.basePerDay, locale)} × ${breakdown.days}`} value={formatMAD(breakdown.subtotal, locale)} />
      {breakdown.discountAmount ? <Line label={`${labels.discount} ${breakdown.discountPct}%`} value={`− ${formatMAD(breakdown.discountAmount, locale)}`} /> : null}
      {(breakdown.extras || []).map((x) => (
        <Line key={x.key} label={pick(x.name, locale) || x.key} value={formatMAD(x.total, locale)} />
      ))}
      {breakdown.deliveryOnRequest ? (
        <Line label={labels.delivery} value={labels.onRequest} muted />
      ) : breakdown.deliveryFee ? (
        <Line label={labels.delivery} value={formatMAD(breakdown.deliveryFee, locale)} />
      ) : null}
      {breakdown.oneWayFee ? <Line label={labels.oneWay} value={formatMAD(breakdown.oneWayFee, locale)} /> : null}
      <div className="border-t border-border pt-1.5">
        <Line label={labels.total} value={formatMAD(breakdown.total, locale)} strong />
      </div>
    </dl>
  );
}

function PriceFooter({ labels, locale, nights, breakdown, quoting, place, placeName, step, canContinue, onBack, onContinue, showSubmit, submitFormId, state }) {
  const [openDetails, setOpenDetails] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div data-testid="quickbook-total">
          {breakdown ? (
            <>
              <p className="tnum text-meta text-text-muted">
                {nights === 1 ? labels.oneDay : labels.nDays.replace('{n}', String(nights))} —{' '}
                <span className="text-base font-semibold text-text">{formatMAD(breakdown.total, locale)}</span>
              </p>
              <p className="tnum text-meta text-text-muted">
                {formatMAD(breakdown.perDayEffective, locale)} {labels.perDay}
              </p>
            </>
          ) : (
            <p className="text-meta text-text-muted">{quoting ? labels.loadingCalendar : labels.errorDates}</p>
          )}
        </div>
        {breakdown ? (
          <button type="button" onClick={() => setOpenDetails((v) => !v)} className="text-meta font-semibold text-text-2 hover:text-text" aria-expanded={openDetails}>
            {labels.details}
          </button>
        ) : null}
      </div>

      {openDetails && breakdown ? (
        <div className="mt-3">
          <Breakdown breakdown={breakdown} labels={labels} locale={locale} />
          {place ? <p className="text-meta mt-2 text-text-muted">{placeName(place)}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-meta rounded-full border border-border-strong px-5 py-3 font-semibold text-text">
          {step === 1 ? labels.cancel : labels.back}
        </button>
        {showSubmit ? (
          <button
            type="submit"
            form={submitFormId}
            disabled={state.status === 'sending'}
            data-testid="quickbook-submit"
            className="text-meta flex-1 rounded-full bg-red px-5 py-3 font-semibold text-on-red disabled:opacity-50"
          >
            {state.status === 'sending' ? labels.submitting : labels.submit}
          </button>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            data-testid="quickbook-continue"
            className="text-meta flex-1 rounded-full bg-red px-5 py-3 font-semibold text-on-red disabled:opacity-40"
          >
            {labels.continue}
          </button>
        )}
      </div>
    </div>
  );
}

const INPUT = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-meta text-text placeholder:text-text-muted';

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-meta mb-1 block text-text-muted">
        {label}
        {required ? <span className="text-red-signal"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Line({ label, value, strong, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'text-meta font-semibold text-text' : 'text-meta text-text-muted'}>{label}</dt>
      <dd className={cn('text-meta text-end', strong ? 'tnum font-semibold text-text' : muted ? 'text-text-muted' : 'tnum text-text-2')}>{value}</dd>
    </div>
  );
}
