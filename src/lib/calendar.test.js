import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarWindow, dayOf, placeRange, shiftIso, slotsFromDx, snapToSlot } from './calendar.js';

/* Casablanca is +01:00, so a local day runs from 23:00 UTC the evening before.
   Every assertion below is written in UTC on purpose: if the helper ever drifts
   to the machine's own zone, these fail on a CI box in UTC. */

describe('the calendar window', () => {
  test('a day is 24 hourly slots starting at local midnight', () => {
    const w = calendarWindow({ zoom: 'day', anchor: '2026-09-10' });
    assert.equal(w.from, '2026-09-09T23:00:00.000Z');
    assert.equal(w.to, '2026-09-10T23:00:00.000Z');
    assert.equal(w.slots.length, 24);
    assert.equal(w.slotMs, 3600 * 1000);
    assert.equal(w.slots[0].label, '00');
    assert.equal(w.slots[23].at, '2026-09-10T22:00:00.000Z');
  });

  test('a week starts on Monday, whichever day is asked for', () => {
    for (const day of ['2026-09-07', '2026-09-10', '2026-09-13']) {
      const w = calendarWindow({ zoom: 'week', anchor: day });
      assert.equal(w.anchor, '2026-09-07', `week of ${day}`);
      assert.equal(w.from, '2026-09-06T23:00:00.000Z');
      assert.equal(w.slots.length, 7);
    }
  });

  test('Sunday belongs to the week that just ended, not the one starting', () => {
    /* 2026-09-13 is a Sunday. Rolling it forward would put a Sunday pick-up in
       next week's grid and out of the operator's current view. */
    assert.equal(calendarWindow({ zoom: 'week', anchor: '2026-09-13' }).anchor, '2026-09-07');
  });

  test('a month covers exactly its own days, February included', () => {
    assert.equal(calendarWindow({ zoom: 'month', anchor: '2026-09-20' }).slots.length, 30);
    assert.equal(calendarWindow({ zoom: 'month', anchor: '2026-02-05' }).slots.length, 28);
    assert.equal(calendarWindow({ zoom: 'month', anchor: '2028-02-05' }).slots.length, 29);
  });

  test('prev and next step by one window, and month steps across a year', () => {
    const week = calendarWindow({ zoom: 'week', anchor: '2026-09-10' });
    assert.equal(week.prev, '2026-08-31');
    assert.equal(week.next, '2026-09-14');

    const dec = calendarWindow({ zoom: 'month', anchor: '2026-12-15' });
    assert.equal(dec.next, '2027-01-01');
    assert.equal(dec.prev, '2026-11-01');
  });

  test('a bad zoom or a bad anchor falls back rather than throwing', () => {
    const w = calendarWindow({ zoom: 'decade', anchor: 'hier' });
    assert.equal(w.zoom, 'week');
    assert.equal(w.slots.length, 7);
  });

  test('dayOf reads the Casablanca date, not the UTC one', () => {
    /* 23:30 UTC is already the next day in Casablanca. */
    assert.equal(dayOf('2026-09-09T23:30:00.000Z'), '2026-09-10');
    assert.equal(dayOf('2026-09-10T22:30:00.000Z'), '2026-09-10');
  });
});

describe('placing a bar', () => {
  const win = calendarWindow({ zoom: 'week', anchor: '2026-09-07' }); // Mon 7 → Mon 14

  test('a one-day rental on the first day fills the first seventh', () => {
    const pos = placeRange(win.from, win.to, '2026-09-06T23:00:00Z', '2026-09-07T23:00:00Z');
    assert.equal(pos.leftPct, 0);
    assert.ok(Math.abs(pos.widthPct - 100 / 7) < 1e-9);
  });

  test('a rental that started before the window is clipped, not dropped', () => {
    const pos = placeRange(win.from, win.to, '2026-09-01T09:00:00Z', '2026-09-08T09:00:00Z');
    assert.equal(pos.leftPct, 0);
    assert.equal(pos.clippedStart, true);
    assert.ok(pos.widthPct > 0);
  });

  test('a rental entirely outside the window is not drawn at all', () => {
    assert.equal(placeRange(win.from, win.to, '2026-10-01T09:00:00Z', '2026-10-03T09:00:00Z'), null);
    assert.equal(placeRange(win.from, win.to, '2026-08-01T09:00:00Z', '2026-08-03T09:00:00Z'), null);
  });

  test('a rental touching the window edge by zero width is not drawn', () => {
    assert.equal(placeRange(win.from, win.to, '2026-09-14T00:00:00Z', '2026-09-16T00:00:00Z'), null);
  });
});

describe('dragging', () => {
  const win = calendarWindow({ zoom: 'week', anchor: '2026-09-07' });

  test('one seventh of the track is one day', () => {
    assert.equal(slotsFromDx(700 / 7, 700, win.from, win.to, win.slotMs), 1);
    assert.equal(slotsFromDx(-2 * (700 / 7), 700, win.from, win.to, win.slotMs), -2);
    /* Anything under half a slot is not a move. */
    assert.equal(slotsFromDx(40, 700, win.from, win.to, win.slotMs), 0);
  });

  test('a move keeps the time of day — a 10:00 pick-up stays at 10:00', () => {
    const moved = shiftIso('2026-09-08T09:00:00.000Z', 2, win.slotMs);
    assert.equal(moved, '2026-09-10T09:00:00.000Z');
  });

  test('a new block snaps to the window grid, not to UTC midnight', () => {
    /* Exactly one seventh across = the start of the second local day. Snapping
       against the epoch would land on 00:00 UTC, an hour early. */
    const at = snapToSlot(win.from, win.to, 1 / 7, win.slotMs);
    assert.equal(at, '2026-09-07T23:00:00.000Z');
    assert.equal(dayOf(at), '2026-09-08');
  });

  test('a pointer outside the track is clamped to the window', () => {
    assert.equal(snapToSlot(win.from, win.to, -5, win.slotMs), win.from);
    assert.equal(snapToSlot(win.from, win.to, 5, win.slotMs), win.to);
  });
});
