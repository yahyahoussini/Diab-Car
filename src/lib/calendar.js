/**
 * The calendar window (plan 7.3).
 *
 * Pure arithmetic, no DOM, no data: given a zoom and an anchor day it returns
 * the exact window the Gantt draws and the slots along its top. Kept out of
 * the component so the boundaries can be tested, and so the server and the
 * browser compute the SAME window — a Gantt whose columns disagree with the
 * rows it renders is worse than no Gantt.
 *
 * Time zone: Casablanca is treated as a fixed +01:00, the same assumption
 * `toISO()` in src/lib/format.js already makes for every booking. It is not a
 * guess — Morocco has stayed on UTC+1 year-round since 2018 (the Ramadan shift
 * moves the wall clock, not the offset stored in Postgres) — and a calendar
 * that used the SERVER's local zone would silently draw a different grid on a
 * Workers node than on a laptop.
 */

export const ZOOMS = ['day', 'week', 'month'];
const OFFSET = '+01:00';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** yyyy-mm-dd (Casablanca) → the instant that day starts. */
export function dayStart(dateStr) {
  return new Date(`${dateStr}T00:00:00${OFFSET}`);
}

/** An instant → the yyyy-mm-dd it falls on in Casablanca. */
export function dayOf(instant) {
  return new Date(new Date(instant).getTime() + HOUR).toISOString().slice(0, 10);
}

function shiftDays(dateStr, n) {
  return dayOf(dayStart(dateStr).getTime() + n * DAY);
}

/** Monday of the week `dateStr` falls in. */
function mondayOf(dateStr) {
  const d = dayStart(dateStr);
  /* getUTCDay on the +01:00 instant is the Casablanca weekday, because the
     instant is midnight local and UTC is one hour behind — so read the day
     from the shifted value, not the raw one. */
  const wd = new Date(d.getTime() + HOUR).getUTCDay(); // 0 = Sunday
  return shiftDays(dateStr, wd === 0 ? -6 : 1 - wd);
}

function daysInMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * @param {{ zoom?: 'day'|'week'|'month', anchor?: string }} input anchor is yyyy-mm-dd
 * @returns {{ zoom: string, anchor: string, from: string, to: string, slotMs: number,
 *            slots: {at: string, label: string, sub: string|null, dayStart: boolean}[],
 *            prev: string, next: string, title: string }}
 */
export function calendarWindow({ zoom = 'week', anchor } = {}) {
  const z = ZOOMS.includes(zoom) ? zoom : 'week';
  const today = dayOf(Date.now());
  const day = /^\d{4}-\d{2}-\d{2}$/.test(anchor || '') ? anchor : today;

  if (z === 'day') {
    const start = dayStart(day);
    return {
      zoom: z,
      anchor: day,
      from: start.toISOString(),
      to: new Date(start.getTime() + DAY).toISOString(),
      slotMs: HOUR,
      slots: Array.from({ length: 24 }, (_, i) => ({
        at: new Date(start.getTime() + i * HOUR).toISOString(),
        label: String(i).padStart(2, '0'),
        sub: null,
        dayStart: i === 0,
      })),
      prev: shiftDays(day, -1),
      next: shiftDays(day, 1),
      title: frDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    };
  }

  const first = z === 'week' ? mondayOf(day) : `${day.slice(0, 7)}-01`;
  const count = z === 'week' ? 7 : daysInMonth(day);
  const start = dayStart(first);

  return {
    zoom: z,
    anchor: first,
    from: start.toISOString(),
    to: new Date(start.getTime() + count * DAY).toISOString(),
    slotMs: DAY,
    slots: Array.from({ length: count }, (_, i) => {
      const d = shiftDays(first, i);
      return {
        at: dayStart(d).toISOString(),
        label: d.slice(8),
        sub: frDate(d, { weekday: 'short' }),
        dayStart: true,
      };
    }),
    prev: z === 'week' ? shiftDays(first, -7) : monthShift(first, -1),
    next: z === 'week' ? shiftDays(first, 7) : monthShift(first, 1),
    title:
      z === 'week'
        ? `${frDate(first, { day: 'numeric', month: 'short' })} – ${frDate(shiftDays(first, count - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : frDate(first, { month: 'long', year: 'numeric' }),
  };
}

function monthShift(dateStr, n) {
  const [y, m] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function frDate(dateStr, opts) {
  return new Intl.DateTimeFormat('fr-MA-u-nu-latn', { ...opts, timeZone: 'Africa/Casablanca' }).format(dayStart(dateStr));
}

/**
 * Where a range sits inside the window, as percentages, clamped to its edges.
 * Returns null when the range does not touch the window at all.
 */
export function placeRange(from, to, startAt, endAt) {
  const w0 = Date.parse(from);
  const w1 = Date.parse(to);
  const s = Math.max(w0, Date.parse(startAt));
  const e = Math.min(w1, Date.parse(endAt));
  if (!(e > w0 && s < w1) || !(e > s)) return null;
  const span = w1 - w0;
  return {
    leftPct: ((s - w0) / span) * 100,
    widthPct: ((e - s) / span) * 100,
    clippedStart: Date.parse(startAt) < w0,
    clippedEnd: Date.parse(endAt) > w1,
  };
}

/**
 * A pointer position (0..1 across the window) → an instant on the slot grid.
 *
 * Snapped relative to the window's own start, never to the epoch: a day slot
 * measured from the epoch lands on UTC midnight, which is 01:00 in Casablanca
 * — an hour of drift on every block drawn by dragging.
 */
export function snapToSlot(from, to, ratio, slotMs) {
  const w0 = Date.parse(from);
  const w1 = Date.parse(to);
  const raw = Math.min(1, Math.max(0, ratio)) * (w1 - w0);
  return new Date(w0 + Math.round(raw / slotMs) * slotMs).toISOString();
}

/**
 * Pixels dragged → a whole number of slots.
 *
 * Moving and resizing are expressed as a DELTA, not as an absolute snap,
 * because a rental starts at 10:00 and must still start at 10:00 after being
 * dragged one day later. Snapping the edge itself to midnight would quietly
 * rewrite the pick-up time the customer agreed to (rule 4).
 */
export function slotsFromDx(dx, trackWidth, from, to, slotMs) {
  if (!trackWidth) return 0;
  const span = Date.parse(to) - Date.parse(from);
  return Math.round((dx * (span / trackWidth)) / slotMs);
}

/** Shift an instant by a whole number of slots. */
export function shiftIso(iso, slots, slotMs) {
  return new Date(Date.parse(iso) + slots * slotMs).toISOString();
}
