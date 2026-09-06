'use client';

/* ------------------------------------------------------------------ */
/* The date-range calendar (plan 4.2).                                 */
/*                                                                     */
/* This module is the LAZY half of the booking module: BookingWidget   */
/* pulls it in with next/dynamic({ ssr: false }) the first time the     */
/* DÉPART / RETOUR field is opened, so react-aria-components and       */
/* @internationalized/date never reach the homepage's initial bundle   */
/* (CLAUDE.md rule 7 — home JS ≤ 160 kB gzipped). Nothing here is      */
/* imported at module scope by anything that renders on first paint.   */
/*                                                                     */
/* Because it never server-renders, this file is free to read the      */
/* viewport and the browser time zone without a hydration hazard.      */
/* ------------------------------------------------------------------ */

import { useEffect, useMemo, useState } from 'react';
import {
  Button as AriaButton,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  I18nProvider,
  RangeCalendar,
} from 'react-aria-components';
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { localeTags } from '@/i18n/routing';
import { cn } from '@/lib/cn';

/**
 * `parseDate` throws on anything that is not exactly `yyyy-mm-dd`; the widget
 * can hand us a value straight out of a URL, so never let that reach React.
 * @param {string} [value]
 * @returns {import('@internationalized/date').CalendarDate | null}
 */
function safeParse(value) {
  if (typeof value !== 'string' || value.length !== 10) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/** Chevron, drawn once and flipped in RTL — never a mirrored text glyph (plan 4.12). */
function Chevron({ back = false }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={back ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

const navButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-2 transition-colors duration-[var(--dur-micro)] hover:bg-surface-2 hover:text-text data-[disabled]:pointer-events-none data-[disabled]:opacity-35';

/**
 * The band that runs under a selected range. It lives on the cell's outer
 * element so consecutive days touch; the disc on the two ends lives on the
 * inner span, which is how "red disc on the pickup day" stays a disc and the
 * range stays a continuous rule.
 */
function cellClass({ isOutsideMonth, isDisabled, isUnavailable, isSelected, isSelectionStart, isSelectionEnd }) {
  return cn(
    'relative flex h-12 w-full items-center justify-center outline-none',
    isOutsideMonth && 'invisible pointer-events-none',
    isDisabled || isUnavailable ? 'cursor-default' : 'cursor-pointer',
    isSelected && 'bg-red-soft',
    isSelectionStart && 'rounded-s-full',
    isSelectionEnd && 'rounded-e-full',
  );
}

function discClass({ isDisabled, isUnavailable, isSelected, isSelectionStart, isSelectionEnd, isFocusVisible, isToday }) {
  const isEnd = isSelectionStart || isSelectionEnd;
  return cn(
    'flex h-11 w-11 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors duration-[var(--dur-micro)]',
    isDisabled || isUnavailable ? 'text-text-muted/45' : 'text-text',
    isEnd && 'bg-red font-semibold text-on-red',
    !isEnd && isSelected && 'text-text',
    !isSelected && !isDisabled && !isUnavailable && 'hover:bg-surface-2',
    isToday && !isEnd && 'font-semibold',
    isFocusVisible && 'outline-2 outline-offset-2 outline-red-signal',
  );
}

/**
 * Accessible, locale-aware, RTL-correct range calendar.
 *
 * @param {object} props
 * @param {'fr'|'en'|'ar'|'es'} [props.locale] active site locale
 * @param {string} [props.from] pickup day, `yyyy-mm-dd`
 * @param {string} [props.to] return day, `yyyy-mm-dd`
 * @param {string} [props.minDate] earliest selectable day, `yyyy-mm-dd`
 * @param {(from: string, to: string) => void} props.onChange fired only with a complete range
 * @param {{ calendar: string, previousMonth: string, nextMonth: string }} props.labels
 * @param {string} [props.className]
 */
export default function RangeCalendarPanel({ locale = 'fr', from, to, minDate, onChange, labels, className }) {
  // Latin digits in every locale, exactly as src/lib/format.js does it
  // (plan 4.12: numbers stay Western Arabic digits, also in Arabic).
  const tag = `${localeTags[locale] || 'fr-MA'}-u-nu-latn`;

  // Two months side by side once there is room; one on a phone. Safe to read
  // the viewport here — this component is never server-rendered.
  const [months, setMonths] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 48rem)');
    const apply = () => setMonths(mq.matches ? 2 : 1);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /** Past dates are never selectable; the widget's floor wins when it is later. */
  const minValue = useMemo(() => {
    const localToday = today(getLocalTimeZone());
    const floor = safeParse(minDate);
    return floor && floor.compare(localToday) > 0 ? floor : localToday;
  }, [minDate]);

  const value = useMemo(() => {
    const start = safeParse(from);
    const end = safeParse(to);
    return start && end ? { start, end } : null;
  }, [from, to]);

  return (
    <I18nProvider locale={tag}>
      <RangeCalendar
        aria-label={labels.calendar}
        value={value}
        onChange={(range) => {
          if (range && range.start && range.end) onChange(range.start.toString(), range.end.toString());
        }}
        minValue={minValue}
        visibleDuration={{ months }}
        data-testid="range-calendar"
        className={cn('w-full select-none', className)}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <AriaButton slot="previous" aria-label={labels.previousMonth} className={navButton}>
            <Chevron back />
          </AriaButton>
          <Heading className="text-meta text-text" />
          <AriaButton slot="next" aria-label={labels.nextMonth} className={navButton}>
            <Chevron />
          </AriaButton>
        </div>

        <div className="flex flex-col gap-5 md:flex-row md:gap-7">
          {Array.from({ length: months }, (_, index) => (
            <CalendarGrid
              key={index}
              offset={index ? { months: index } : undefined}
              weekdayStyle="short"
              className="w-full table-fixed border-collapse"
            >
              <CalendarGridHeader>
                {(day) => <CalendarHeaderCell className="pb-2 text-meta font-normal text-text-muted">{day}</CalendarHeaderCell>}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => (
                  <CalendarCell date={date} className={cellClass}>
                    {(renderProps) => (
                      <>
                        <span className={discClass(renderProps)}>{renderProps.formattedDate}</span>
                        {renderProps.isToday && !renderProps.isSelectionStart && !renderProps.isSelectionEnd ? (
                          <span className="pointer-events-none absolute bottom-1 h-1 w-1 rounded-full bg-red-signal" aria-hidden="true" />
                        ) : null}
                      </>
                    )}
                  </CalendarCell>
                )}
              </CalendarGridBody>
            </CalendarGrid>
          ))}
        </div>
      </RangeCalendar>
    </I18nProvider>
  );
}
