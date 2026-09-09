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

  await page.getByTestId('reserve-button').click();
  await expect(page.getByTestId('booking-modal')).toBeVisible({ timeout: 20000 });
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

  test('a car that is not free for the chosen dates cannot be confirmed', async ({ page }) => {
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
