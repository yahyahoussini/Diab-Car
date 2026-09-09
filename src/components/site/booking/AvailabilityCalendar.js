'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { todayISO } from '@/lib/format';

/**
 * The month grid the customer picks a range in (owner's Sept 2026 flow,
 * step 1).
 *
 * What a grey day means, precisely: `free` is how many units of THIS model are
 * free on that calendar day, straight from `vehicle_availability_days()`. It is
 * a HINT, not a verdict. Three units — A free Mon–Wed, B free Wed–Fri — give
 * every single day a free unit while no one unit covers Mon–Fri, and the
 * exclusion constraint that actually decides is per unit. So this grid paints
 * days, and `/api/quote` decides the range: the UI never decides availability
 * (CLAUDE.md rule 5).
 *
 * Weeks start on Monday in all four languages. Arabic flips the whole grid
 * through `dir`, which is why every offset here is logical and the chevrons
 * carry `rtl:-scale-x-100` rather than being swapped by hand.
 */

/** Monday. `Date#getUTCDay()` counts from Sunday, hence the rotation below. */
const WEEK_START = 1;

/** 2024-01-01 was a Monday, so seven days from it name the columns. */
const REFERENCE_MONDAY = Date.UTC(2024, 0, 1);

function pad(n) {
  return String(n).padStart(2, '0');
}

/** `'2026-09'` → the cells of its grid, `null` for the leading/trailing blanks. */
function monthGrid(month) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const year = first.getUTCFullYear();
  const index = first.getUTCMonth();
  const length = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() - WEEK_START + 7) % 7;

  const cells = new Array(lead).fill(null);
  for (let d = 1; d <= length; d += 1) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** `'2026-09'` shifted by n months, staying a valid month string. */
export function shiftMonth(month, n) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthOf(day) {
  return day ? day.slice(0, 7) : todayISO().slice(0, 7);
}

export default function AvailabilityCalendar({
  locale = 'fr',
  month,
  onMonthChange,
  /** day → units free. A day absent from the map has not been read yet. */
  freeByDay,
  from,
  to,
  onPick,
  loading = false,
  labels,
}) {
  const today = todayISO();
  const cells = useMemo(() => monthGrid(month), [month]);

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(REFERENCE_MONDAY + i * 86400000)));
  }, [locale]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)),
    [locale, month],
  );

  const dayLabel = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }), [locale]);

  /* A day can be taken only if the calendar says a unit is free on it. An
     unread day is offered rather than hidden: the month it belongs to is being
     fetched, and /api/quote refuses the range if it turns out to be taken. */
  const takeable = (day) => day >= today && freeByDay.get(day) !== 0;

  /* The first month worth showing is the current one — nobody rents a car in
     the past, and paging back into it only produces a grid of dead cells. */
  const canGoBack = month > today.slice(0, 7);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => canGoBack && onMonthChange(shiftMonth(month, -1))}
          disabled={!canGoBack}
          aria-label={labels.previousMonth}
          className="rounded-full p-2 text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <p aria-live="polite" className="text-[15px] font-semibold capitalize text-text">
          {monthLabel}
        </p>

        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          aria-label={labels.nextMonth}
          className="rounded-full p-2 text-text-2 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* A group of toggle buttons, not `role="grid"`. A real grid owes the
          assistive layer rows, a roving tabindex and arrow-key navigation; a
          seven-column layout that claims the role without them reads worse
          than no role at all. Each day instead names itself in full — "lundi
          21 septembre 2026", and "déjà réservé" when it is taken — so the
          column letters above are decoration and marked as such. */}
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={labels.pickDates} aria-busy={loading || undefined}>
        {weekdays.map((w) => (
          <div key={w} aria-hidden="true" className="pb-1 text-center text-[0.7rem] font-medium text-text-muted">
            {w}
          </div>
        ))}

        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} aria-hidden="true" />;

          const free = freeByDay.get(day);
          const disabled = !takeable(day);
          /* Two different greys: a day already booked, and a day simply in the
             past. Only the first is worth hatching — the second is not a
             refusal, it is just gone. */
          const taken = free === 0 && day >= today;
          const isFrom = day === from;
          const isTo = day === to;
          const inRange = Boolean(from && to && day > from && day < to);
          const selected = isFrom || isTo;

          return (
            <button
              key={day}
              type="button"
              data-day={day}
              data-free={free}
              disabled={disabled}
              onClick={() => onPick(day)}
              aria-pressed={selected || inRange}
              aria-label={`${dayLabel.format(new Date(`${day}T00:00:00Z`))}${free === 0 ? ` — ${labels.dayTaken}` : ''}`}
              /* Taken days are HATCHED rather than struck through (owner's
                 reference, Sept 2026). The stripes are painted from a token so
                 they follow the theme, and the day stays legible underneath —
                 a customer needs to read the number they cannot have. */
              style={taken ? { backgroundImage: 'repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 5px)' } : undefined}
              className={cn(
                'relative h-10 rounded-full text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-signal',
                taken && 'text-text-muted',
                disabled && !taken && 'text-text-muted/45',
                !disabled && !selected && !inRange && 'text-text hover:bg-surface-2',
                inRange && 'bg-accent-soft text-text',
                selected && 'bg-accent-fill font-semibold text-on-accent',
              )}
            >
              {Number(day.slice(8))}
              {/* The last unit for that day. A quiet mark, not a red badge:
                  red is capped at 5% of a screen (rule 2) and this grid can
                  show thirty of them at once. */}
              {!disabled && !selected && free === 1 ? (
                <span className="absolute inset-x-0 bottom-1 mx-auto h-1 w-1 rounded-full bg-red-signal" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
