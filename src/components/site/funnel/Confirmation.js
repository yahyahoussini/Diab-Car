'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { formatMAD } from '@/lib/format';
import { whatsappLink, bookingConfirmedMessage } from '@/lib/whatsapp';
import { cn } from '@/lib/cn';

/**
 * The confirmation screen (plan 4.7): red line → ✓ → car → reference →
 * summary → WhatsApp + calendar + what happens next. About 1.4 s, skippable.
 *
 * The booking is read from sessionStorage, not from the database. That is a
 * privacy decision, not a shortcut: `reservations` is staff-only under RLS
 * (0005), and adding an anonymous read keyed by reference would mean anyone
 * who guessed a DC- code could see a stranger's dates and pick-up point. The
 * funnel already has every figure, so it hands them over and the database
 * stays closed (plan 9.4).
 *
 * Under `prefers-reduced-motion` every phase is revealed at once: the sequence
 * is decoration, and the reference is the one thing that must never be behind
 * an animation.
 */

const PHASES = ['line', 'check', 'car', 'reference', 'summary', 'actions'];

/* sessionStorage and the reduced-motion query are both read during render via
   useSyncExternalStore rather than copied into state by an effect: the server
   snapshot keeps SSR and the first client render identical, and nothing calls
   setState synchronously inside an effect. */
const noSubscribe = () => () => {};

function subscribeMotion(onChange) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export default function Confirmation({ reference, whatsappNumber, locale, labels, responseMinutes }) {
  const [phase, setPhase] = useState(0);

  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const raw = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return window.sessionStorage.getItem('dc_last_booking');
      } catch {
        return null;
      }
    },
    () => null,
  );
  const reduceMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  const booking = useMemo(() => {
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      /* Only trust it if it is the booking this URL is about. */
      return parsed && (!reference || parsed.reference === reference) ? parsed : null;
    } catch {
      return null;
    }
  }, [raw, reference]);

  /* The sequence. Timers only — no library, and nothing depends on it. Under
     reduced motion no timer is scheduled at all and `shown()` returns true
     immediately, so the reference is never hidden behind an animation. */
  useEffect(() => {
    if (!ready || reduceMotion) return undefined;
    const timers = PHASES.map((_, i) => setTimeout(() => setPhase(i + 1), 180 + i * 220));
    return () => timers.forEach(clearTimeout);
  }, [ready, reduceMotion]);

  const skip = () => setPhase(PHASES.length);
  const shown = (name) => reduceMotion || phase >= PHASES.indexOf(name) + 1;

  const money = (n) => formatMAD(Math.round(Number(n) || 0), locale);

  /* Only echo a reference that LOOKS like one of ours. The value arrives from
     the query string, and reflecting arbitrary user input into the page — even
     escaped by React — is a habit worth not having. A stored booking is
     trusted; a URL is not. */
  const fromUrl = typeof reference === 'string' && /^DC-[A-Z0-9-]{4,20}$/.test(reference) ? reference : null;
  const ref = booking?.reference || fromUrl;

  const waHref = whatsappNumber && ref
    ? whatsappLink(
        whatsappNumber,
        bookingConfirmedMessage(locale, {
          reference: ref,
          vehicleName: booking?.vehicleName,
          from: booking ? shortDate(booking.from, locale) : undefined,
          to: booking ? shortDate(booking.to, locale) : undefined,
          pickup: booking?.pickupLabel,
          dropoff: booking?.dropoffLabel,
          total: booking?.total != null ? money(booking.total) : undefined,
        }),
      )
    : null;

  if (!ready) {
    /* One frame, not a spinner — the loader on this site is the red line. */
    return <div className="redline-loading mt-10" aria-hidden="true" />;
  }

  return (
    <div data-testid="confirmation">
      {!reduceMotion && phase < PHASES.length ? (
        <button type="button" onClick={skip} className="text-meta absolute end-4 top-[calc(var(--header-h)+1rem)] text-text-muted underline underline-offset-4">
          {labels.skip}
        </button>
      ) : null}

      {/* 1 — the red line travels */}
      <div className={cn('h-0.5 w-full overflow-hidden bg-border', !shown('line') && 'opacity-0')}>
        <div className={cn('h-full w-full origin-left bg-red-signal transition-transform duration-500 rtl:origin-right', shown('line') ? 'scale-x-100' : 'scale-x-0')} />
      </div>

      {/* 2 — it becomes a check */}
      <div className={cn('mt-8 transition-opacity duration-300', shown('check') ? 'opacity-100' : 'opacity-0')}>
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-signal text-red-signal">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12.5l5.5 5.5L20 7" />
          </svg>
        </span>
      </div>

      {/* 3 + 4 — the car, then the reference */}
      <div className={cn('mt-6 transition-opacity duration-300', shown('reference') ? 'opacity-100' : 'opacity-0')}>
        <p className="eyebrow">{labels.kicker}</p>
        <h1 className="text-display-2 mt-3 text-text">{labels.title}</h1>

        {booking?.slug ? (
          /* The anchor for WOW 3 (plan 5.2) — PROMPT 14 gives this the
             view-transition-name so the car appears to arrive here. */
          <p className="text-meta mt-4 font-semibold text-text" data-car-transition={booking.slug}>
            {booking.vehicleName}
          </p>
        ) : null}

        {ref ? (
          <p className="text-meta mt-4 text-text-2">
            {labels.reference} ·{' '}
            <bdi className="tnum font-latin-sans font-semibold text-text" data-testid="booking-reference">
              {ref}
            </bdi>
          </p>
        ) : null}
      </div>

      {/* 5 — the summary */}
      {booking ? (
        <dl className={cn('mt-8 space-y-2 border-t border-border pt-6 transition-opacity duration-300', shown('summary') ? 'opacity-100' : 'opacity-0')}>
          {booking.from && booking.to ? (
            <Row label={labels.dates} value={`${shortDate(booking.from, locale)} → ${shortDate(booking.to, locale)}`} />
          ) : null}
          {booking.pickupLabel ? <Row label={labels.pickup} value={booking.pickupLabel} /> : null}
          {booking.total != null ? <Row label={labels.total} value={money(booking.total)} strong /> : null}
          {booking.deposit != null ? <Row label={labels.deposit} value={money(booking.deposit)} muted /> : null}
        </dl>
      ) : (
        <div className="mt-8 border border-border bg-surface-1 p-6">
          <p className="text-meta font-semibold text-text">{labels.notFound}</p>
          <p className="mt-2 text-text-2">{labels.notFoundBody}</p>
        </div>
      )}

      {/* 6 — the actions */}
      <div className={cn('mt-8 flex flex-wrap items-center gap-3 transition-opacity duration-300', shown('actions') ? 'opacity-100' : 'opacity-0')}>
        {waHref ? (
          <a href={waHref} target="_blank" rel="noopener noreferrer" data-testid="confirm-whatsapp" className="text-meta rounded-full bg-red px-6 py-3.5 font-semibold text-white">
            {labels.whatsapp}
          </a>
        ) : null}
        {booking?.from && booking?.to ? <CalendarButton booking={booking} label={labels.calendar} /> : null}
      </div>

      <div className={cn('mt-10 border-t border-border pt-6 transition-opacity duration-300', shown('actions') ? 'opacity-100' : 'opacity-0')}>
        <p className="eyebrow">{labels.nextTitle}</p>
        <p className="mt-3 text-text-2">{labels.nextBody.replace('{minutes}', String(responseMinutes))}</p>
        <p className="text-meta mt-4 text-text-muted">{labels.payment}</p>
      </div>
    </div>
  );
}

function Row({ label, value, strong, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-meta', muted ? 'text-text-muted' : 'text-text-2')}>{label}</dt>
      <dd className={cn('tnum', strong ? 'price text-text' : muted ? 'text-meta text-text-muted' : 'text-meta text-text')}>{value}</dd>
    </div>
  );
}

/**
 * .ics generated in the browser from a Blob. No server round trip, no library,
 * and nothing about the booking leaves the device to produce it.
 */
function CalendarButton({ booking, label }) {
  const onClick = () => {
    const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Diab Car//Booking//FR',
      'BEGIN:VEVENT',
      `UID:${booking.reference}@diabcar.ma`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(booking.from)}`,
      `DTEND:${stamp(booking.to)}`,
      `SUMMARY:Diab Car — ${booking.vehicleName || ''} (${booking.reference})`,
      booking.pickupLabel ? `LOCATION:${booking.pickupLabel.replace(/,/g, '\\,')}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `diabcar-${booking.reference}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" onClick={onClick} data-testid="confirm-calendar" className="text-meta rounded-full border border-border-strong px-5 py-3 font-semibold text-text">
      {label}
    </button>
  );
}

function shortDate(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'fr' : locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}
