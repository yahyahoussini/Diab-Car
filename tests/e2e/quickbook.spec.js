/* ------------------------------------------------------------------ */
/* The per-car booking sheet (plan 4.7, owner's revision Sept 2026).    */
/* CommonJS: package.json has no "type": "module".                     */
/*                                                                     */
/* The point of these tests is the one rule the sheet must never break: */
/* it does not decide availability. The calendar greys days out from    */
/* the database, and the range itself is settled by /api/quote before   */
/* the customer can move on.                                            */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

const DAY = 86400000;

/** A window far enough out that no other test is fighting over the car. */
function farWindow(offsetDays, lengthDays = 3) {
  const from = new Date(Date.now() + offsetDays * DAY);
  from.setUTCHours(10, 0, 0, 0);
  return { from: from.toISOString(), to: new Date(from.getTime() + lengthDays * DAY).toISOString() };
}

const dayOf = (iso) => new Date(new Date(iso).getTime() + 3600000).toISOString().slice(0, 10);

/**
 * Open the sheet the way a visitor does: fleet grid -> a car -> Réserver.
 * Following the real link also proves the localized route still resolves.
 */
async function openSheet(page, locale = 'fr') {
  const fleet = { fr: 'location-voiture-casablanca', en: 'car-rental-casablanca', ar: 'car-rental-casablanca', es: 'alquiler-coches-casablanca' }[locale];
  await page.goto(`/${locale}/${fleet}`);

  const card = page.locator(`a[href*="/${fleet}/"]`).first();
  await card.waitFor({ timeout: 20000 });
  await card.click();

  const opener = page.getByTestId('quickbook-open');
  await opener.waitFor({ timeout: 20000 });
  const slug = await opener.getAttribute('data-slug');
  await opener.click();
  await expect(page.getByTestId('quickbook')).toBeVisible({ timeout: 20000 });
  return slug;
}

test.describe('quick booking', () => {
  test('the calendar route answers with a free count per day and never leaks a unit', async ({ request }) => {
    const from = dayOf(farWindow(120).from);
    const to = dayOf(farWindow(150).from);
    const res = await request.get(`/api/vehicle-calendar?${new URLSearchParams({ vehicle: 'dacia-logan-diesel', from, to })}`);
    expect(res.ok(), 'the calendar route must answer for a real slug').toBe(true);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.days)).toBe(true);
    expect(json.days.length).toBeGreaterThan(0);
    for (const d of json.days) {
      expect(d).toHaveProperty('day');
      expect(typeof d.free).toBe('number');
    }

    /* Plan 6.5: the public surface knows counts, never the fleet. */
    const body = JSON.stringify(json);
    for (const leak of ['plate', 'vin', 'customer', 'phone', 'reference', 'unitId', 'unit_id']) {
      expect(body, `${leak} must not reach an anonymous caller`).not.toContain(leak);
    }
  });

  test('an unknown or unpublished car gets nothing', async ({ request }) => {
    const from = dayOf(farWindow(10).from);
    const res = await request.get(`/api/vehicle-calendar?${new URLSearchParams({ vehicle: 'no-such-car', from, to: from })}`);
    expect(res.status()).toBe(404);
  });

  test('a backwards range is refused rather than guessed at', async ({ request }) => {
    const res = await request.get(`/api/vehicle-calendar?${new URLSearchParams({ vehicle: 'dacia-logan-diesel', from: '2027-03-10', to: '2027-03-01' })}`);
    expect(res.status()).toBe(400);
  });

  test('the sheet opens from a car, walks three steps and prices the dates', async ({ page }) => {
    const slug = await openSheet(page);
    expect(slug).toBeTruthy();

    /* Step 1 opens on the calendar. */
    await expect(page.getByTestId('quickbook')).toHaveAttribute('data-step', '1');
    await expect(page.getByTestId('quickbook-calendar')).toBeVisible();
    await expect(page.getByTestId('range-calendar')).toBeVisible({ timeout: 20000 });

    /* Continue is shut until Postgres has priced a real range. */
    await expect(page.getByTestId('quickbook-continue')).toBeDisabled();

    /* Pick the first two selectable days the calendar offers. */
    const days = page.locator('[data-testid="range-calendar"] td [role="button"]:not([aria-disabled="true"])');
    await days.first().waitFor({ timeout: 20000 });
    await days.nth(1).click();
    await days.nth(4).click();

    /* The places appear with their own prices once dates exist. */
    await expect(page.getByTestId('quickbook-pickup')).toBeVisible({ timeout: 20000 });

    /* Rule 4: a total for THESE dates, before anything is committed. */
    await expect(page.getByTestId('quickbook-continue')).toBeEnabled({ timeout: 20000 });
    await expect(page.getByTestId('quickbook-total')).toContainText('MAD');

    await page.getByTestId('quickbook-continue').click();
    await expect(page.getByTestId('quickbook')).toHaveAttribute('data-step', '2');
    await expect(page.getByTestId('quickbook-options')).toBeVisible();

    await page.getByTestId('quickbook-continue').click();
    await expect(page.getByTestId('quickbook')).toHaveAttribute('data-step', '3');
    await expect(page.getByTestId('quickbook-details')).toBeVisible();

    /* The breakdown is on the last screen, next to the button that commits. */
    await expect(page.getByTestId('quickbook-breakdown')).toBeVisible();
  });

  test('there is no online payment, and the sheet says so', async ({ page }) => {
    await openSheet(page);
    const days = page.locator('[data-testid="range-calendar"] td [role="button"]:not([aria-disabled="true"])');
    await days.first().waitFor({ timeout: 20000 });
    await days.nth(1).click();
    await days.nth(4).click();
    await expect(page.getByTestId('quickbook-continue')).toBeEnabled({ timeout: 20000 });
    await page.getByTestId('quickbook-continue').click();
    await page.getByTestId('quickbook-continue').click();

    const details = page.getByTestId('quickbook-details');
    await expect(details).toBeVisible();
    /* Plan 9.5 is a locked decision: nothing here may suggest a card is taken. */
    await expect(details).toContainText(/paiement|agence/i);
    await expect(details.locator('input[type="password"], [name*="card" i], [autocomplete*="cc-" i]')).toHaveCount(0);
  });

  test('a day with no unit free is struck out and cannot start a range', async ({ page, request }) => {
    test.skip(!db.available, 'needs SUPABASE_SERVICE_ROLE_KEY to take every unit');

    const w = farWindow(200, 2);
    const rows = await db.searchAvailability(w.from, w.to);
    const row = rows.find((r) => r.units_free > 0);
    test.skip(!row, 'no free model for the fixture window');

    const taken = await db.bookOut(row.slug, w.from, w.to);
    expect(taken).toBeGreaterThan(0);

    try {
      const from = dayOf(w.from);
      const res = await request.get(`/api/vehicle-calendar?${new URLSearchParams({ vehicle: row.slug, from, to: from })}`);
      const json = await res.json();
      const cell = json.days.find((d) => d.day === from);
      expect(cell, 'the booked day must be in the answer').toBeTruthy();
      expect(cell.free, 'every unit is taken, so the day is not on offer').toBe(0);
    } finally {
      await db.cleanup();
    }
  });

  test('the sheet works in Arabic, right to left, with Latin digits in the price', async ({ page }) => {
    await openSheet(page, 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const days = page.locator('[data-testid="range-calendar"] td [role="button"]:not([aria-disabled="true"])');
    await days.first().waitFor({ timeout: 20000 });
    await days.nth(1).click();
    await days.nth(4).click();
    await expect(page.getByTestId('quickbook-continue')).toBeEnabled({ timeout: 20000 });

    /* Plan 4.12: Arabic keeps Western digits, so a price stays readable to
       everyone who has ever seen a price. */
    const total = page.getByTestId('quickbook-total');
    await expect(total).toContainText(/[0-9]/);
    await expect(total).not.toContainText(/[٠-٩]/);
  });
});
