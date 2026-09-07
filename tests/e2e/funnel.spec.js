/* ------------------------------------------------------------------ */
/* The 4-step booking funnel (plan 4.7), in an LTR and an RTL locale.  */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

const DAY = 86400000;

/** A window per test-group so concurrent runs never fight over the same car. */
function window_(offsetDays, lengthDays = 3) {
  const from = new Date(Date.now() + offsetDays * DAY);
  from.setUTCHours(10, 0, 0, 0);
  return { from: from.toISOString(), to: new Date(from.getTime() + lengthDays * DAY).toISOString() };
}

const funnelUrl = (locale, extra = {}) => `/${locale}/reservation?${new URLSearchParams({ step: '2', ...extra })}`;

/** Step 2 is ready when the first bookable car is listed. */
async function waitForCars(page) {
  await page.locator('[data-testid="step-vehicles"] button[data-slug]').first().waitFor({ timeout: 20000 });
}

for (const locale of ['fr', 'ar']) {
  test.describe(`funnel (${locale})`, () => {
    test('select a car, see the hold timer, change extras, reach the form', async ({ page }) => {
      const w = window_(locale === 'fr' ? 60 : 64);
      await page.goto(funnelUrl(locale, { from: w.from, to: w.to, pickup: 'agence-zerktouni' }));

      /* ---- step 2: pick a car, which takes a real 10-minute hold ---- */
      await waitForCars(page);
      const first = page.locator('[data-testid="step-vehicles"] button[data-slug]').first();
      const slug = await first.getAttribute('data-slug');
      await first.click();

      /* The hold is visible and counting, in mm:ss (plan 4.7). */
      const timer = page.getByTestId('hold-timer');
      await expect(timer).toBeVisible({ timeout: 20000 });
      await expect(timer).toContainText(/\d{2}:\d{2}/);

      /* And the summary carries the WOW-3 hook for prompt 14. */
      await expect(page.locator(`[data-car-transition="${slug}"]`)).toHaveCount(1);

      /* ---- step 3: an extra must move the total ---- */
      await expect(page.getByTestId('step-extras')).toBeVisible();
      const summary = page.getByTestId('funnel-summary');
      /* Not "MAD": formatMAD renders the unit in the page's language, and the
         Arabic build says درهم. Assert a figure instead — the digits stay
         Latin in every locale (plan 4.12), which is the property that matters. */
      await expect(summary).toContainText(/\d/);
      const before = await summary.innerText();

      const extra = page.locator('[data-extra]').first();
      if (await extra.count()) {
        await extra.check();
        await expect
          .poll(async () => (await summary.innerText()) !== before, { timeout: 15000 })
          .toBe(true);
      }

      await page.getByTestId('extras-next').click();

      /* ---- step 4: the form, the payment line and the consent gate ---- */
      await expect(page.getByTestId('step-customer')).toBeVisible();
      await expect(page.getByTestId('payment-line')).toBeVisible();
      /* Plan 9.5: information, not a choice — there must be no card field. */
      await expect(page.locator('input[autocomplete*="cc-"]')).toHaveCount(0);

      /* Submit stays disabled until consent is given (plan 9.4). */
      await expect(page.getByTestId('funnel-submit')).toBeDisabled();
      await page.getByTestId('consent').check();
      await expect(page.getByTestId('funnel-submit')).toBeEnabled();

      /* Going back to the car list must GIVE THE CAR BACK. Without this the
         visitor silently holds a unit while browsing — and this test used to
         leave nine live holds behind in the database, which is the same bug
         seen from the other side. */
      await page.getByRole('button', { name: /02/ }).click();
      await expect(page.getByTestId('hold-timer')).toHaveCount(0, { timeout: 15000 });
    });

    test('books and lands on a DC- reference', async ({ page }) => {
      const w = window_(locale === 'fr' ? 70 : 74);
      await page.goto(funnelUrl(locale, { from: w.from, to: w.to, pickup: 'agence-zerktouni' }));

      await waitForCars(page);
      await page.locator('[data-testid="step-vehicles"] button[data-slug]').first().click();
      await expect(page.getByTestId('step-extras')).toBeVisible({ timeout: 20000 });
      await page.getByTestId('extras-next').click();

      await page.getByTestId('first-name').fill('E2E');
      await page.getByTestId('last-name').fill('Funnel');
      await page.getByTestId('phone').fill(`+21269900${locale === 'fr' ? '11' : '22'}00`);
      await page.getByTestId('email').fill('e2e-funnel@example.invalid');
      await page.getByTestId('consent').check();

      await page.getByTestId('funnel-submit').click();

      const ref = page.getByTestId('booking-reference');
      await expect(ref).toBeVisible({ timeout: 30000 });
      await expect(ref).toHaveText(/^DC-/);

      /* The confirmation offers the two things plan 4.7 asks for. */
      await expect(page.getByTestId('confirm-whatsapp')).toBeVisible();
      await expect(page.getByTestId('confirm-calendar')).toBeVisible();
    });
  });
}

test.describe('confirmation', () => {
  test('is noindex and does not read the database', async ({ request }) => {
    const res = await request.get('/fr/reservation/confirmation?ref=DC-NOPE12');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/name="robots"[^>]*noindex/i);

    /* The page has no anonymous read path to `reservations` (staff-only under
       RLS), so NOTHING about a booking is server-rendered — the server emits
       only the loading line and the client fills in from its own session.
       Asserting on the absence of these three elements rather than on the
       absence of the word "MAD": that string is in the footer's currency
       toggle on every page, and matching it caught site chrome, not data. */
    expect(html).not.toContain('data-testid="confirmation"');
    expect(html).not.toContain('booking-reference');
    expect(html).not.toContain('data-car-transition');
  });

  test('an unknown reference shows the not-found state, not invented data', async ({ page }) => {
    await page.goto('/fr/reservation/confirmation?ref=DC-NOPE12');
    const box = page.getByTestId('confirmation');
    await expect(box).toContainText(/introuvable/i, { timeout: 15000 });
    /* No summary rows, because there is no booking to summarise. */
    await expect(page.getByTestId('confirm-calendar')).toHaveCount(0);
  });

  test('the funnel route itself is noindex', async ({ request }) => {
    const html = await (await request.get('/fr/reservation')).text();
    expect(html).toMatch(/name="robots"[^>]*noindex/i);
  });
});

test.describe('holds are real', () => {
  test('a second booking for the last unit is refused while a hold stands', async () => {
    test.skip(!db.available, 'needs SUPABASE_SERVICE_ROLE_KEY — asserting a race without a database would prove nothing');

    const w = window_(150);
    const SLUG = 'dacia-logan-diesel';

    /* Take every unit but one, then hold the last one, then try to book it. */
    const rows = await db.searchAvailability(w.from, w.to);
    const row = rows.find((r) => r.slug === SLUG);
    expect(row, 'the target model must exist').toBeTruthy();
    expect(row.units_free, 'the window must start clear').toBeGreaterThan(0);

    try {
      await db.bookOut(SLUG, w.from, w.to, row.units_free - 1);

      const hold = await db.createHold(row.vehicle_id, w.from, w.to, 'e2e-hold-token-123456');
      expect(hold.ok, `the last unit must be holdable: ${JSON.stringify(hold)}`).toBe(true);

      /* Someone else now tries to book the same window. The hold consumes the
         last unit, so Postgres must refuse — this is the whole point of
         holding rather than hoping. */
      const second = await db.tryBook(row.vehicle_id, w.from, w.to, '+212699000999');
      expect(second.ok).toBe(false);
      expect(second.error).toBe('SOLD_OUT');
      expect(Array.isArray(second.alternatives)).toBe(true);
    } finally {
      await db.cleanup();
    }
  });
});
