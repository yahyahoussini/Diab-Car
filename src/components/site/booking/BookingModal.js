'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { Checkbox, Input, Label } from '@/components/ui/Field';
import AvailabilityCalendar, { monthOf, shiftMonth } from './AvailabilityCalendar';
import { submitBooking } from '@/lib/actions/booking';
import { addDays, formatMAD, toISO, todayISO } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * The booking pop-up (owner's specification, Sept 2026).
 *
 *   1. dates — the running total sits at the bottom, next
 *   2. delivery and options — BOTH read from the admin at open time
 *   3. confirmation — full name, phone, and the total with everything
 *
 * Three things hold it together and none of them should be quietly changed.
 *
 * The quote is stored WITH the inputs it answers. `answer.key` is a fingerprint
 * of every field that can move a price, and a stored quote is only ever read
 * back when the fingerprint still matches — so a price physically cannot
 * outlive the dates and options it was computed for (CLAUDE.md rule 4). That is
 * also why `quoting` is derived rather than stored: "we are waiting" is exactly
 * "the answer we hold is not for these inputs".
 *
 * The money is never computed here. Every figure on every step comes from
 * `/api/quote`, which is the same code path `submitBooking()` re-runs on the
 * server before writing the reservation, so the total the customer confirms and
 * the total that is stored are produced by one function (rule 5).
 *
 * Step 2 renders whatever the catalogue hands it. The owner asked to be able to
 * add delivery destinations and "other options later" from the dashboard; that
 * is only true if this component knows nothing about any particular option, so
 * it does not — a new row on /admin/tarifs simply appears here.
 */

const STEPS = 3;
const DEFAULT_TIME = '10:00';
/* The counter's hours, on the half hour (plan 4.2), same grid as the search
   widget. Dates are the owner's step 1; the hour is the practical detail a
   customer arriving on a 22:00 flight has to be able to state. */
const HOURS = Array.from({ length: 29 }, (_, i) => `${String(Math.floor((i + 16) / 2)).padStart(2, '0')}:${(i + 16) % 2 ? '30' : '00'}`);

export default function BookingModal({ open, onClose, vehicle, whatsappNumber = null }) {
  const t = useTranslations('booking');
  const locale = useLocale();

  const [step, setStep] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [ft, setFt] = useState(DEFAULT_TIME);
  const [tt, setTt] = useState(DEFAULT_TIME);
  const [month, setMonth] = useState(() => monthOf(todayISO()));
  /* Collapsed as soon as a complete range exists, and reopened by « Modifier »
     (owner's reference, Sept 2026). Driven from the click rather than from an
     effect watching `to`, so choosing dates is one render and reopening the
     calendar cannot be undone by the state that closed it. */
  const [calendarOpen, setCalendarOpen] = useState(true);

  const [freeByDay, setFreeByDay] = useState(() => new Map());
  const [loadedMonths, setLoadedMonths] = useState(() => new Set());
  const [calendarError, setCalendarError] = useState(false);
  const requestedMonths = useRef(new Set());

  const [catalogue, setCatalogue] = useState(null);
  const [place, setPlace] = useState('');
  const [chosen, setChosen] = useState([]);

  const [answer, setAnswer] = useState(null);
  const quoteSeq = useRef(0);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);

  /* ------------------------------------------------------------- catalogue */
  useEffect(() => {
    if (!open || catalogue) return;
    fetch(`/api/booking-options?locale=${locale}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok) return;
        setCatalogue(json);
        /* Collecting the car at the agency is the default because it is the
           only option that is certainly free; a delivery is a deliberate
           choice the customer makes, never one made for them. */
        const agency = json.places.find((p) => p.kind === 'agency') || json.places[0];
        if (agency) setPlace(agency.key);
      })
      .catch(() => {});
  }, [open, catalogue, locale]);

  /* -------------------------------------------------------------- calendar */
  /* Deliberately WITHOUT an `alive` flag, and the reason matters. The dedupe
     lives in a ref, which survives an effect teardown; an `alive` flag does
     not. Under StrictMode the effect runs, is torn down and runs again, so the
     first pass would mark the month as requested, the second would skip it as
     already requested, and the first pass's answer would then be thrown away by
     its own dead `alive` flag — a calendar that never fills, in development
     only. The merge below is idempotent and keyed by day, so letting a late
     answer land is simply correct; React 18 no longer warns about a setState
     after unmount. */
  useEffect(() => {
    if (!open || requestedMonths.current.has(month)) return;
    const ahead = shiftMonth(month, 1);
    requestedMonths.current.add(month);
    requestedMonths.current.add(ahead);

    const forget = () => {
      /* Dropped from `requested` so « Réessayer » actually retries. */
      requestedMonths.current.delete(month);
      requestedMonths.current.delete(ahead);
      setCalendarError(true);
    };

    const last = new Date(Date.UTC(Number(ahead.slice(0, 4)), Number(ahead.slice(5, 7)), 0)).toISOString().slice(0, 10);
    fetch(`/api/vehicle-calendar?${new URLSearchParams({ vehicle: vehicle.slug, from: `${month}-01`, to: last })}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok) return forget();
        setFreeByDay((prev) => {
          const next = new Map(prev);
          for (const d of json.days || []) next.set(d.day, d.free);
          return next;
        });
        setLoadedMonths((prev) => new Set(prev).add(month).add(ahead));
        return undefined;
      })
      .catch(forget);
  }, [open, month, vehicle.slug]);

  /* ----------------------------------------------------------------- quote */
  /* Everything that can move the price, in one string. Nothing else belongs
     here: adding a field that cannot change a total would refetch for nothing,
     and leaving one out would show a stale price (rule 4). */
  const quoteKey = from && to ? JSON.stringify([from, ft, to, tt, place, [...chosen].sort()]) : null;
  const answered = answer && answer.key === quoteKey ? answer.data : null;
  const quoting = Boolean(quoteKey) && !answered;
  const breakdown = answered?.ok ? answered.quote : null;
  const availability = answered?.ok ? answered.availability : null;

  useEffect(() => {
    if (!open || !quoteKey) return;
    const [f, fromTime, tday, toTime, pickup, extras] = JSON.parse(quoteKey);
    /* Every request carries a sequence number, because a slow answer for dates
       the customer has already changed must not overwrite a fast answer for the
       dates they are looking at now. */
    quoteSeq.current += 1;
    const mine = quoteSeq.current;

    const params = new URLSearchParams({ vehicle: vehicle.slug, startAt: toISO(f, fromTime), endAt: toISO(tday, toTime), locale });
    if (pickup) params.set('pickup', pickup);
    for (const key of extras) params.append('extras', key);

    fetch(`/api/quote?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (mine !== quoteSeq.current) return;
        setAnswer({ key: quoteKey, data: json });
      })
      .catch(() => {
        if (mine !== quoteSeq.current) return;
        setAnswer({ key: quoteKey, data: { ok: false, error: 'server' } });
      });
  }, [open, quoteKey, vehicle.slug, locale]);

  /* ------------------------------------------------------------- selection */
  const pickDay = useCallback(
    (day) => {
      /* No start yet, a finished range, or a day before the start: begin again
         from here. One rule, so the grid never needs a "clear" button. */
      if (!from || to || day <= from) {
        setFrom(day);
        setTo('');
        setCalendarOpen(true);
        return;
      }
      /* A range may not step over a day with no free unit, even though both
         ends are free — that is precisely the case a per-day count cannot
         answer on its own. */
      for (let d = from; d < day; d = addDays(d, 1)) {
        if (freeByDay.get(d) === 0) {
          setFrom(day);
          setTo('');
          setCalendarOpen(true);
          return;
        }
      }
      setTo(day);
      setCalendarOpen(false);
    },
    [from, to, freeByDay],
  );

  const toggleExtra = useCallback((key) => {
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const retryCalendar = useCallback(() => {
    setCalendarError(false);
    setMonth((m) => m);
  }, []);

  /* ---------------------------------------------------------------- submit */
  const nameOk = name.trim().length >= 3;
  const phoneOk = /^\+?[\d\s().-]{8,20}$/.test(phone.trim());

  const onSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!nameOk) return setFailure('name');
      if (!phoneOk) return setFailure('phone');
      if (!consent) return setFailure('consent');
      if (!breakdown) return setFailure('server');

      setSubmitting(true);
      setFailure(null);
      const result = await submitBooking({
        vehicle: vehicle.slug,
        from,
        ft,
        to,
        tt,
        pickup: place,
        dropoff: place,
        extras: chosen,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        consent: true,
        locale,
      });
      setSubmitting(false);

      if (result?.ok) {
        setDone(result);
        return undefined;
      }
      /* Sold out is a normal outcome, not a failure of the form: someone else
         can legitimately take the last car while this one is being filled in. */
      setFailure(result?.error === 'sold_out' ? 'sold_out' : result?.error || 'server');
      return undefined;
    },
    [nameOk, phoneOk, consent, breakdown, vehicle.slug, from, ft, to, tt, place, chosen, name, phone, email, locale],
  );

  /* ------------------------------------------------------------------ view */
  const money = useCallback((amount) => formatMAD(amount, locale), [locale]);
  const optionsByKey = useMemo(() => new Map((catalogue?.options || []).map((o) => [o.key, o])), [catalogue]);
  const placesByKey = useMemo(() => new Map((catalogue?.places || []).map((p) => [p.key, p])), [catalogue]);
  const chosenPlace = placesByKey.get(place) || null;

  const canContinue = step === 1 ? Boolean(from && to && breakdown && availability?.available) : true;
  const subtitle = [t('subtitleDates'), t('subtitleOptions'), t('subtitleDetails')][step - 1];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('title')}
      labelClose={t('close')}
      wide
      subheader={done ? null : <Stepper t={t} step={step} subtitle={subtitle} />}
      /* The total stays pinned below the scrolling body on every step — the
         owner asked to see it "in low" while choosing, not only at the end. */
      footer={
        done ? null : (
          <Footer
            t={t}
            money={money}
            locale={locale}
            step={step}
            quoting={quoting}
            breakdown={breakdown}
            chosenPlace={chosenPlace}
            optionsByKey={optionsByKey}
            chosen={chosen}
            canContinue={canContinue}
            submitting={submitting}
            onCancel={onClose}
            onBack={() => setStep(step - 1)}
            onContinue={() => setStep(Math.min(STEPS, step + 1))}
          />
        )
      }
    >
      {done ? (
        <Success reference={done.reference} t={t} onClose={onClose} />
      ) : (
        <div data-testid="booking-modal" data-step={step}>
          <CarCard vehicle={vehicle} place={chosenPlace} />

          {step === 1 ? (
            <StepDates
              t={t}
              locale={locale}
              month={month}
              onMonthChange={setMonth}
              freeByDay={freeByDay}
              loading={!loadedMonths.has(month) && !calendarError}
              error={calendarError}
              onRetry={retryCalendar}
              from={from}
              to={to}
              onPick={pickDay}
              ft={ft}
              tt={tt}
              onFt={setFt}
              onTt={setTt}
              answered={answered}
              availability={availability}
              calendarOpen={calendarOpen}
              onOpenCalendar={() => setCalendarOpen(true)}
            />
          ) : null}

          {step === 2 ? (
            <StepOptions
              t={t}
              money={money}
              catalogue={catalogue}
              place={place}
              onPlace={setPlace}
              chosen={chosen}
              onToggle={toggleExtra}
            />
          ) : null}

          {step === 3 ? (
            <StepConfirm
              t={t}
              locale={locale}
              money={money}
              from={from}
              to={to}
              ft={ft}
              tt={tt}
              breakdown={breakdown}
              place={chosenPlace}
              chosen={chosen}
              optionsByKey={optionsByKey}
              name={name}
              onName={setName}
              phone={phone}
              onPhone={setPhone}
              email={email}
              onEmail={setEmail}
              consent={consent}
              onConsent={setConsent}
              failure={failure}
              onSubmit={onSubmit}
              whatsappNumber={whatsappNumber}
            />
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------- the header */

/**
 * Where you are, named. A bar alone says "some progress"; the three titles say
 * what is behind and what is still to come, which is what stops a customer
 * abandoning a form because they cannot see the end of it.
 */
function Stepper({ t, step, subtitle }) {
  const names = [t('stepDates'), t('stepOptions'), t('stepDetails')];
  return (
    <div data-testid="booking-stepper">
      <p className="text-[0.88rem] text-text-2">{subtitle}</p>
      <p className="mt-0.5 text-[0.78rem] text-text-muted">
        {t('stepOf', { n: step, total: STEPS })} · {names[step - 1]}
      </p>

      {/* The width is a computed percentage, so it is an inline style rather
          than a class — there is no Tailwind utility for "one third". */}
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent-fill transition-[width] duration-300 ease-out" style={{ width: `${(step / STEPS) * 100}%` }} />
      </div>

      <ol className="mt-2 flex items-center justify-between gap-2 text-[0.75rem]">
        {names.map((n, i) => (
          <li
            key={n}
            aria-current={i + 1 === step ? 'step' : undefined}
            className={cn(
              'truncate',
              i + 1 === step ? 'font-semibold text-accent' : i + 1 < step ? 'text-text-2' : 'text-text-muted',
              i === 1 && 'text-center',
              i === 2 && 'text-end',
            )}
          >
            {n}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The car being booked, and where it is collected. Present on every step. */
function CarCard({ vehicle, place }) {
  return (
    <section className="mb-4 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
      <p className="text-[15px] font-semibold text-text">{vehicle.name}</p>
      {place ? (
        <p className="mt-1 flex items-center gap-1.5 text-[0.82rem] text-text-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {/* <bdi>, because a Latin street address inside an Arabic page is a
              bidi island: "356 boulevard Zerktouni" was being reordered to
              "boulevard Zerktouni 356" and quietly moved the street number to
              the end of the line. */}
          <bdi className="truncate">{place.address || place.name}</bdi>
        </p>
      ) : null}
    </section>
  );
}


/* ------------------------------------------------------------ step 1: dates */

function StepDates({ t, locale, month, onMonthChange, freeByDay, loading, error, onRetry, from, to, onPick, ft, tt, onFt, onTt, answered, availability, calendarOpen, onOpenCalendar }) {
  const nights = from && to ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) : 0;
  const long = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <div>
      {/* Once a range exists the calendar folds away behind it, so the step
          reads as an answer rather than as thirty more cells to scroll past.
          « Modifier » brings it back. */}
      {from && to ? (
        <section className="mb-4 rounded-[var(--radius-card)] border border-border-strong bg-surface-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M3 11h18" />
                </svg>
                {t('period')}
              </p>
              <p className="mt-1.5 text-[0.85rem] text-text-2">
                {long.format(new Date(`${from}T00:00:00Z`))} · {ft} → {long.format(new Date(`${to}T00:00:00Z`))} · {tt}
              </p>
              <p className="mt-0.5 text-[0.85rem] font-semibold tabular-nums text-text">{nights === 1 ? t('oneDay') : t('nDays', { n: nights })}</p>
            </div>
            {!calendarOpen ? (
              <button
                type="button"
                onClick={onOpenCalendar}
                data-testid="booking-change-dates"
                className="shrink-0 rounded-full px-2 py-1 text-[0.8rem] font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
              >
                {t('changeDates')}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!calendarOpen ? null : error ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 p-5 text-center">
          <p className="text-[0.88rem] text-text-2">{t('calendarError')}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <AvailabilityCalendar
          locale={locale}
          month={month}
          onMonthChange={onMonthChange}
          freeByDay={freeByDay}
          from={from}
          to={to}
          onPick={onPick}
          loading={loading}
          labels={{
            pickDates: t('pickDates'),
            previousMonth: t('previousMonth'),
            nextMonth: t('nextMonth'),
            dayTaken: t('dayTaken'),
          }}
        />
      )}

      {calendarOpen ? <p className="mt-3 text-[0.8rem] text-text-muted">{loading ? t('loadingCalendar') : t('pickDatesHint')}</p> : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="dc-ft">{t('timeFrom')}</Label>
          <TimeSelect id="dc-ft" value={ft} onChange={onFt} />
        </div>
        <div>
          <Label htmlFor="dc-tt">{t('timeTo')}</Label>
          <TimeSelect id="dc-tt" value={tt} onChange={onTt} />
        </div>
      </div>

      {/* Availability and the two refusals /api/quote can return. Each is a
          statement about THESE dates, so it lives with the dates. */}
      {availability && !availability.available ? (
        <div className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
          <p className="text-[15px] font-semibold text-text">{t('soldOut')}</p>
          <p className="mt-1 text-[0.85rem] text-text-2">
            {availability.nextAvailableAt
              ? t('nextAvailable', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(availability.nextAvailableAt)) })
              : t('soldOutHint')}
          </p>
        </div>
      ) : null}

      {availability?.lastOne ? <p className="mt-3 text-[0.85rem] font-semibold text-red-signal">{t('lastOne')}</p> : null}

      {answered && !answered.ok && answered.error === 'min_days' ? (
        <p className="mt-4 text-[0.85rem] text-red-signal">{t('minDays', { n: answered.minDays })}</p>
      ) : null}
    </div>
  );
}

function TimeSelect({ id, value, onChange }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 w-full rounded-[var(--radius-input)] border border-border bg-surface-1 px-3 text-[15px] tabular-nums text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------------------------------- step 2: options */

function StepOptions({ t, money, catalogue, place, onPlace, chosen, onToggle }) {
  if (!catalogue) return <p className="text-[0.88rem] text-text-muted">{t('loadingCalendar')}</p>;

  /* « +300,00 MAD », not « 300,00 MAD » (owner's reference): the figure is what
     this destination ADDS to the total already shown at the bottom, and the
     sign is what makes that unambiguous. A place with no price set says « sur
     devis » rather than a number nobody has decided (rule 11). */
  const priceOf = (p) => (p.onRequest ? t('onRequest') : p.fee > 0 ? `+${money(p.fee)}` : t('included'));

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-[15px] font-semibold text-text">{t('deliveryTitle')}</legend>
        <p className="mb-3 mt-1 text-[0.85rem] text-text-2">{t('deliveryHint')}</p>
        <div className="space-y-2">
          {catalogue.places.map((p) => (
            <label
              key={p.key}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-full border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-red-signal',
                place === p.key ? 'border-accent bg-surface-1' : 'border-border bg-surface-1 hover:border-border-strong',
              )}
            >
              {/* The radio itself is the accessible control and stays in the
                  accessibility tree; the tick to the end is what the eye reads.
                  sr-only rather than hidden, so it is still focusable. */}
              <input
                type="radio"
                name="dc-place"
                data-place={p.key}
                value={p.key}
                checked={place === p.key}
                onChange={() => onPlace(p.key)}
                className="peer sr-only"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-text">{p.name}</span>
                {p.city && p.city !== p.name ? <span className="block truncate text-[0.78rem] text-text-muted">{p.city}</span> : null}
              </span>
              {/* The price stays visible on the chosen row too. Replacing it
                  with the tick would hide the one number the customer has just
                  agreed to add to their total (rule 4). */}
              {p.onRequest || p.fee > 0 ? (
                <span className={cn('shrink-0 text-[0.85rem] tabular-nums', p.onRequest ? 'text-text-muted' : 'font-semibold text-text')}>{priceOf(p)}</span>
              ) : null}
              {place === p.key ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </label>
          ))}
        </div>
        {catalogue.places.some((p) => p.onRequest) ? <p className="mt-2 text-[0.78rem] text-text-muted">{t('onRequestHint')}</p> : null}
      </fieldset>

      <fieldset>
        <legend className="text-[15px] font-semibold text-text">
          {t('optionsTitle')} <span className="font-normal text-text-muted">· {t('optional')}</span>
        </legend>
        {catalogue.options.length === 0 ? (
          <p className="mt-2 text-[0.85rem] text-text-muted">{t('optionsNone')}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {catalogue.options.map((o) => (
              <label
                key={o.key}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-[var(--radius-input)] border p-3 transition-colors',
                  chosen.includes(o.key) ? 'border-accent bg-accent-soft' : 'border-border bg-surface-1 hover:border-border-strong',
                )}
              >
                <input
                  type="checkbox"
                  data-option={o.key}
                  checked={chosen.includes(o.key)}
                  onChange={() => onToggle(o.key)}
                  className="h-4 w-4 shrink-0 accent-[var(--accent-fill)]"
                />
                <span className="min-w-0 flex-1 truncate text-[15px] text-text">{o.name}</span>
                <span className="shrink-0 text-[0.85rem] font-semibold tabular-nums text-text">
                  {money(o.price)}
                  <span className="font-normal text-text-muted"> {o.type === 'flat' ? t('perRental') : t('perDay')}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}

/* ----------------------------------------------------- step 3: confirmation */

function StepConfirm({
  t, locale, money, from, to, ft, tt, breakdown, place, chosen, optionsByKey,
  name, onName, phone, onPhone, email, onEmail, consent, onConsent, failure, onSubmit, whatsappNumber,
}) {
  const date = (day, time) => `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))} · ${time}`;

  return (
    <form id="dc-booking-form" onSubmit={onSubmit} noValidate>
      {/* Everything, before the name is even typed. Nothing may appear after
          this that was not shown here (rule 4). */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <h3 className="text-[15px] font-semibold text-text">{t('summaryTitle')}</h3>
        <dl className="mt-3 space-y-1.5 text-[0.85rem]">
          <Line label={t('period')} value={`${date(from, ft)} → ${date(to, tt)}`} />
          {place ? <Line label={t('pickupPlace')} value={place.name} /> : null}
        </dl>
        <div className="mt-2 border-t border-border pt-2">
          <Breakdown t={t} money={money} breakdown={breakdown} chosen={chosen} optionsByKey={optionsByKey} place={place} totalTestid="summary-total" />
        </div>
      </section>

      <div className="mt-5 space-y-4">
        <div>
          <Label htmlFor="dc-name" hint={t('fullNameHint')}>{t('fullName')}</Label>
          <Input id="dc-name" name="name" value={name} onChange={(e) => onName(e.target.value)} autoComplete="name" required aria-invalid={failure === 'name' || undefined} />
          {failure === 'name' ? <p className="mt-1 text-[0.8rem] text-red-signal">{t('errorName')}</p> : null}
        </div>
        <div>
          <Label htmlFor="dc-phone" hint={t('phoneHint')}>{t('phone')}</Label>
          <Input id="dc-phone" name="phone" type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => onPhone(e.target.value)} autoComplete="tel" required aria-invalid={failure === 'phone' || undefined} />
          {failure === 'phone' ? <p className="mt-1 text-[0.8rem] text-red-signal">{t('errorPhone')}</p> : null}
        </div>
        <div>
          <Label htmlFor="dc-email">{t('emailOptional')}</Label>
          <Input id="dc-email" name="email" type="email" dir="ltr" value={email} onChange={(e) => onEmail(e.target.value)} autoComplete="email" />
        </div>

        <Checkbox id="dc-consent" checked={consent} onChange={(e) => onConsent(e.target.checked)} label={t('consent')} />
        {failure === 'consent' ? <p className="text-[0.8rem] text-red-signal">{t('errorConsent')}</p> : null}
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-border bg-surface-1 p-4">
        <p className="text-[15px] font-semibold text-text">{t('paymentTitle')}</p>
        <p className="mt-1 text-[0.82rem] text-text-2">{t('paymentBody')}</p>
      </div>

      {failure === 'sold_out' ? (
        <div className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
          <p className="text-[15px] font-semibold text-text">{t('takenTitle')}</p>
          <p className="mt-1 text-[0.85rem] text-text-2">{t('takenBody')}</p>
        </div>
      ) : null}

      {failure && !['name', 'phone', 'consent', 'sold_out'].includes(failure) ? (
        <p className="mt-4 text-[0.85rem] text-red-signal">
          {t('errorServer')}
          {whatsappNumber ? (
            <>
              {' '}
              <a href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                WhatsApp
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}

function Success({ reference, t, onClose }) {
  return (
    <div className="py-6 text-center" data-testid="booking-success">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h3 className="mt-4 text-h3 text-text">{t('successTitle')}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[0.88rem] text-text-2">{t('successBody')}</p>
      <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{t('successRef')}</p>
      <p className="text-h3 tabular-nums text-text">{reference}</p>
      <Button variant="secondary" size="md" className="mt-6" onClick={onClose}>
        {t('close')}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------- the running total */

/**
 * « 7 jours — 3 150,00 MAD », with the breakdown one tap away on EVERY step.
 *
 * Rule 4 asks for the breakdown before confirmation; putting it here means it
 * is available from the moment there is a price at all, not only on the last
 * screen. The figure itself is whatever /api/quote last answered for the inputs
 * currently on screen — never a total this component worked out.
 */
function Footer({ t, money, locale, step, quoting, breakdown, chosenPlace, optionsByKey, chosen, canContinue, submitting, onCancel, onBack, onContinue }) {
  const [openDetails, setOpenDetails] = useState(false);
  const has = Boolean(breakdown);

  return (
    <div>
      {has && openDetails ? (
        <div className="mb-3 max-h-48 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface-2 p-3">
          <Breakdown t={t} money={money} breakdown={breakdown} chosen={chosen} optionsByKey={optionsByKey} place={chosenPlace} />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-h3 tabular-nums text-text" data-testid="booking-total" aria-live="polite">
            {has ? (
              <>
                <span className="text-text-2">{breakdown.days === 1 ? t('oneDay') : t('nDays', { n: breakdown.days })}</span>
                <span className="text-text-muted"> — </span>
                <span className="font-semibold text-accent" data-testid="booking-total-amount">{money(breakdown.total)}</span>
              </>
            ) : (
              <span className="text-text-muted">{quoting ? '…' : '—'}</span>
            )}
          </p>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{t('total')}</p>
        </div>

        {has ? (
          <button
            type="button"
            onClick={() => setOpenDetails((v) => !v)}
            aria-expanded={openDetails}
            data-testid="booking-details-toggle"
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.82rem] font-semibold text-text-2 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
          >
            {t('details')}
            <svg viewBox="0 0 24 24" className={cn('h-4 w-4 transition-transform duration-200', openDetails && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" size="md" data-testid="booking-back" onClick={step > 1 ? onBack : onCancel} disabled={submitting}>
          {step > 1 ? t('back') : t('cancel')}
        </Button>

        {/* The keys are load-bearing. Without them React sees one <button> in
            one slot and MORPHS it: the click on « Continuer » flushes
            setStep synchronously, the same DOM node becomes
            type="submit" form="dc-booking-form" while the click is still being
            processed, and the browser then runs that click's default action on
            it — submitting the form the instant the customer reaches step 3,
            which greeted them with "indiquez votre nom complet" under an empty
            field they had not been given the chance to fill. Distinct keys make
            React mount a fresh element instead, so the in-flight click has
            nothing left to submit. */}
        {step < STEPS ? (
          <Button key="next" size="md" className="flex-1" data-testid="booking-next" onClick={onContinue} disabled={!canContinue}>
            {step === 2 ? t('continueToDetails') : t('continue')}
          </Button>
        ) : (
          <Button key="submit" type="submit" form="dc-booking-form" size="md" className="flex-1" data-testid="booking-submit" loading={submitting} loadingLabel={t('submitting')}>
            {t('submit')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The price, line by line. One component, rendered both in the footer expander
 * and in the confirmation summary, so the two can never drift apart.
 */
function Breakdown({ t, money, breakdown, chosen, optionsByKey, place, totalTestid }) {
  if (!breakdown) return null;
  return (
    <dl className="space-y-1.5 text-[0.85rem]">
      <Line label={`${t('rental')} · ${breakdown.days === 1 ? t('oneDay') : t('nDays', { n: breakdown.days })}`} value={money(breakdown.subtotal)} />
      {breakdown.discountAmount > 0 ? <Line label={`${t('discount')} −${breakdown.discountPct}%`} value={`−${money(breakdown.discountAmount)}`} /> : null}

      {chosen.map((key) => {
        const line = breakdown.extras?.find((e) => e.key === key);
        return <Line key={key} label={optionsByKey.get(key)?.name || key} value={money(line?.total ?? 0)} />;
      })}

      {breakdown.deliveryOnRequest ? (
        <Line label={`${t('delivery')}${place ? ` · ${place.name}` : ''}`} value={t('onRequest')} muted />
      ) : breakdown.deliveryFee > 0 ? (
        <Line label={`${t('delivery')}${place ? ` · ${place.name}` : ''}`} value={money(breakdown.deliveryFee)} />
      ) : null}

      <div className="mt-2 border-t border-border pt-2">
        <Line label={t('total')} value={money(breakdown.total)} strong testid={totalTestid} />
      </div>

      {breakdown.deposit > 0 ? <p className="pt-1 text-[0.78rem] text-text-muted">{t('depositNote', { amount: money(breakdown.deposit) })}</p> : null}
      {breakdown.deliveryOnRequest ? <p className="pt-1 text-[0.78rem] text-text-muted">{t('onRequestHint')}</p> : null}
    </dl>
  );
}

function Line({ label, value, strong = false, muted = false, testid }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn('min-w-0 truncate', strong ? 'font-semibold text-text' : 'text-text-2')}>{label}</dt>
      <dd data-testid={testid} className={cn('shrink-0 tabular-nums', strong ? 'text-base font-semibold text-text' : muted ? 'text-text-muted' : 'text-text')}>{value}</dd>
    </div>
  );
}
