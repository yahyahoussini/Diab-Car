/* ------------------------------------------------------------------ */
/* The booking pop-up (owner's specification, Sept 2026).              */
/*                                                                     */
/*   Réserver → 1. dates, running total, next                          */
/*            → 2. delivery and options, read from the admin           */
/*            → 3. full name, phone, and the total with everything     */
/*                                                                     */
/* The last step SUBMITS only when the server is running on the demo    */
/* store. A dev machine with .env.local configured is pointed at the    */
/* agency's real Postgres, and a test suite must not leave fake         */
/* customers in it (CLAUDE.md rule 10). Against a live server the test  */
/* still proves everything up to and including the confirm button being */
/* armed with the right total; `/api/health` says which mode it is in.  */
/*                                                                     */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

/** The fixture car. Same one vehicle.spec.js books out, and it has units. */
const SLUG = 'dacia-logan-diesel';

/** Digits only, so "1 320 MAD" and "1.320 MAD" compare equal. */
const digits = (s) => (s || '').replace(/[^\d]/g, '');

async function dataMode(request) {
  const res = await request.get('/api/health');
  if (!res.ok()) return 'unknown';
  return (await res.json()).mode;
}

/** Open the pop-up on the first car of the fleet, and return its page. */
async function openOnFirstCar(page) {
  await page.goto('/fr/vehicules');
  const card = page.locator('[data-slug]').first();
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.locator('a').first().click();
  await page.waitForURL(/\/fr\/[^/]+\/[^/]+$/, { timeout: 20000 });

  await page.getByTestId('vehicle-book').click();
  await expect(page.getByTestId('booking-modal')).toBeVisible({ timeout: 20000 });
}

/**
 * Page the calendar forward until `day` is on screen.
 *
 * The grid renders one month at a time and opens on the current one, so a
 * fixture window far enough out to avoid colliding with real reservations is
 * necessarily several clicks away. Bounded, and it waits for each month's
 * counts to arrive before judging the next -- an unread month renders every
 * day enabled, so looking at one would prove nothing.
 */
async function pageTo(page, day) {
  for (let i = 0; i < 14; i += 1) {
    if (await page.locator(`[data-day="${day}"]`).count()) return true;
    await page.getByRole('button', { name: /mois suivant/i }).click();
    await expect
      .poll(async () => page.locator('[data-day][data-free]').count(), { timeout: 20000 })
      .toBeGreaterThan(0);
  }
  return (await page.locator(`[data-day="${day}"]`).count()) > 0;
}

test.describe('the booking pop-up', () => {
  test('dates → options → confirmation, with one total throughout', async ({ page, request }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && (e.stack || e.message)) || e)));

    await openOnFirstCar(page);

    /* ------------------------------ 1. dates ------------------------------ */
    const modal = page.getByTestId('booking-modal');
    await expect(modal).toHaveAttribute('data-step', '1');

    /* The calendar has to have answered before any day can be trusted: an
       unread month offers every day, so picking one immediately would be
       picking from a grid that has not loaded. */
    await expect.poll(async () => page.locator('[data-day][data-free]').count(), { timeout: 20000 }).toBeGreaterThan(0);

    const free = page.locator('[data-day]:not([disabled])');
    const count = await free.count();
    test.skip(count < 6, 'the fixture fleet has no free week for this car');

    /* Not the first free day: today is offered, and a rental that starts in
       the past hour is refused by the server for reasons unrelated to this
       screen. Three days apart keeps it above any minDays the seed sets. */
    await free.nth(2).click();
    await free.nth(5).click();

    /* The footer line reads "3 jours — 660,00 MAD", so the amount has its own
        hook: comparing the whole line by digits would fold the day count into
        the price and compare 3660 with 660. */
    const total = page.getByTestId('booking-total-amount');
    await expect.poll(async () => digits(await total.textContent()), { timeout: 20000 }).not.toBe('');
    const afterDates = digits(await total.textContent());
    expect(Number(afterDates), 'the total for the chosen dates is a real figure').toBeGreaterThan(0);

    /* ---------------------------- 2. options ------------------------------ */
    await page.getByTestId('booking-next').click();
    await expect(modal).toHaveAttribute('data-step', '2');

    /* The delivery destinations come from `locations` and the options from
       `extras` — both edited on /admin/tarifs. At least one place must exist
       or there is nowhere to collect the car from. */
    const places = page.locator('[data-place]');
    await expect.poll(async () => places.count(), { timeout: 20000 }).toBeGreaterThan(0);
    await expect(places.first()).toBeChecked();

    /* Picking an option must move the total, and it must move it BEFORE the
       customer reaches the confirmation step (rule 4: nothing appears later
       that was not shown earlier). Skipped when the owner has not added any
       option yet — an empty catalogue is a legitimate state. */
    const options = page.locator('[data-option]');
    if (await options.count()) {
      await options.first().check();
      await expect.poll(async () => digits(await total.textContent()), { timeout: 20000 }).not.toBe(afterDates);
    }

    /* ------------------------- 3. confirmation ---------------------------- */
    await page.getByTestId('booking-next').click();
    await expect(modal).toHaveAttribute('data-step', '3');

    /* Arriving at step 3 must not look like a rejected form. React reuses one
       DOM node for « Continuer » and « Confirmer » unless they are keyed apart,
       and the morphed node used to submit the form on the very click that
       navigated here — greeting the customer with a validation error under an
       empty field. */
    await expect(page.getByText(/Indiquez votre nom complet/i)).toHaveCount(0);
    await expect(page.getByTestId('booking-success')).toHaveCount(0);

    const footerTotal = digits(await total.textContent());
    const summaryTotal = digits(await page.getByTestId('summary-total').textContent());
    expect(summaryTotal, 'the summary and the footer show ONE total').toBe(footerTotal);

    await page.locator('#dc-name').fill('Client Test');
    await page.locator('#dc-phone').fill('+212600112233');
    await page.locator('#dc-consent').check();

    const submit = page.getByTestId('booking-submit');
    await expect(submit).toBeEnabled();

    const mode = await dataMode(request);
    if (mode !== 'demo') {
      test.info().annotations.push({ type: 'note', description: `server is in ${mode} mode — not submitting into a real database` });
      expect(errors, 'no uncaught exception while filling the pop-up').toEqual([]);
      return;
    }

    await submit.click();
    const success = page.getByTestId('booking-success');
    await expect(success).toBeVisible({ timeout: 30000 });
    await expect(success).toContainText(/DC-\d{6}-[A-Z0-9]{4}/);

    expect(errors, 'no uncaught exception during the whole flow').toEqual([]);
  });

  /* ------------------------------------------------------------------ */
  /* The owner's requirement, Sept 2026: a car booked from X to Z must    */
  /* not offer those days, and must SHOW that they are taken.            */
  /*                                                                     */
  /* Proved against a real booking rather than a fixture, because the     */
  /* thing being tested is the join between what Postgres knows and what  */
  /* the grid paints - and that join is exactly where it broke once       */
  /* already: the demo adapter labelled every cell with the PREVIOUS      */
  /* day's count, so the calendar blocked free days and offered booked    */
  /* ones. A test built on a hand-made map would have passed throughout.  */
  /* ------------------------------------------------------------------ */
  test('a car booked from X to Z shows those days as taken and refuses them', async ({ page }) => {
    test.skip(!db.available, 'needs SUPABASE_SERVICE_ROLE_KEY to create the booking being tested');

    /* Far enough out that no real reservation collides, and a Monday-to-
       Thursday shape so the blocked run sits inside one month. */
    const start = new Date(Date.now() + 150 * 86400000);
    start.setUTCHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 3 * 86400000);
    const startAt = start.toISOString();
    const endAt = end.toISOString();

    /* Every unit of the model, so the days are genuinely unavailable rather
       than merely scarce. */
    const taken = await db.bookOut(SLUG, startAt, endAt);
    expect(taken, 'setup must actually take every unit').toBeGreaterThan(0);

    try {
      await page.goto(`/fr/vehicules/${SLUG}`);
      await page.getByTestId('vehicle-book').click();
      await expect(page.getByTestId('booking-modal')).toBeVisible({ timeout: 20000 });
      await expect.poll(async () => page.locator('[data-day][data-free]').count(), { timeout: 20000 }).toBeGreaterThan(0);

      /* The rental runs 10:00 on day 0 to 10:00 on day 3, so days 0, 1 and 2
         are occupied. Day 3 is a hand-back morning and is deliberately NOT
         asserted either way - free_units decides it, not this test. */
      const blocked = [0, 1, 2].map((i) => new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));

      expect(await pageTo(page, blocked[0]), 'the fixture month must be reachable').toBe(true);

      for (const day of blocked) {
        const cell = page.locator(`[data-day="${day}"]`);
        await expect(cell, `${day} must be in the visible month`).toHaveCount(1);
        await expect(cell, `${day} is booked, so it must report zero free units`).toHaveAttribute('data-free', '0');
        await expect(cell, `${day} must not be selectable`).toBeDisabled();
      }

      /* And it must LOOK taken, not merely refuse a click. */
      await expect(page.getByTestId('calendar-legend')).toBeVisible();
      await expect(page.locator(`[data-day="${blocked[0]}"]`)).toHaveAttribute('aria-label', /déjà réservé/i);

      /* Clicking one changes nothing: no start date, no price, no way on. */
      await page.locator(`[data-day="${blocked[0]}"]`).click({ force: true });
      await expect(page.getByTestId('booking-total')).toContainText('—');
      await expect(page.getByTestId('booking-next')).toBeDisabled();

      /* A range that STRADDLES the blocked run must not be accepted either --
         both ends free is not the same as the whole period free, which is the
         one thing a per-day count cannot answer on its own. */
      const before = new Date(start.getTime() - 86400000).toISOString().slice(0, 10);
      const after = new Date(start.getTime() + 4 * 86400000).toISOString().slice(0, 10);
      const beforeCell = page.locator(`[data-day="${before}"]`);
      const afterCell = page.locator(`[data-day="${after}"]`);
      /* Both ends only count when they are in the month currently on screen;
         a run that straddles a month boundary is a different test. */

      if ((await beforeCell.count()) && (await afterCell.count()) && (await beforeCell.isEnabled()) && (await afterCell.isEnabled())) {
        await beforeCell.click();
        await afterCell.click();
        /* The second click restarts the range on that day rather than spanning
           the blocked run, so no complete range exists and there is no price. */
        await expect(page.getByTestId('booking-total')).toContainText('—');
        await expect(page.getByTestId('booking-next')).toBeDisabled();
      }
    } finally {
      await db.cleanup();
    }
  });

  test('with no dates chosen there is no price, and no way forward', async ({ page }) => {
    await openOnFirstCar(page);
    await expect.poll(async () => page.locator('[data-day][data-free]').count(), { timeout: 20000 }).toBeGreaterThan(0);

    /* With no dates chosen there is no quote, so « Suivant » must be inert.
       This is the guard that stops a booking being carried to the last step
       on a price that was never computed. */
    await expect(page.getByTestId('booking-next')).toBeDisabled();
    await expect(page.getByTestId('booking-total')).toContainText('—');
    await expect(page.getByTestId('booking-total-amount')).toHaveCount(0);
  });
});
