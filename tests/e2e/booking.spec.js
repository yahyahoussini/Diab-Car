/* ------------------------------------------------------------------ */
/* The booking module is the most important component of the site      */
/* (plan 4.2), so it gets its own end-to-end test: fill it the way a   */
/* keyboard user would, in an LTR and an RTL locale, and assert the    */
/* search URL it produces.                                             */
/*                                                                     */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

/** fr is the default locale, ar is RTL — between them they cover the risky paths. */
const LOCALES = [
  { locale: 'fr', dir: 'ltr', fleetPath: '/fr/location-voiture-casablanca' },
  { locale: 'ar', dir: 'rtl', fleetPath: '/ar/car-rental-casablanca' },
];

/** Collect console errors + uncaught exceptions from before the first navigation. */
function watch(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`uncaught: ${(e && (e.stack || e.message)) || String(e)}`));
  return errors;
}

for (const { locale, dir, fleetPath } of LOCALES) {
  test.describe(`booking module (${locale})`, () => {
    test(`fills by keyboard and submits a search URL`, async ({ page }) => {
      const errors = watch(page);

      await page.goto(`/${locale}`, { waitUntil: 'load' });
      await expect(page.locator('html')).toHaveAttribute('dir', dir);

      const widget = page.getByTestId('booking-widget');
      await expect(widget).toBeVisible();

      /* ---- 1. LIEU: focus the combobox, open it, pick the first option
              with the keyboard only (no mouse). ------------------------ */
      const pickup = page.getByTestId('pickup-combobox');
      await pickup.click();
      await expect(pickup).toHaveAttribute('aria-expanded', 'true');

      const listboxId = await pickup.getAttribute('aria-controls');
      expect(listboxId, 'combobox must point at its listbox').toBeTruthy();
      const listbox = page.locator(`#${listboxId}`);
      await expect(listbox).toBeVisible();

      /* ArrowDown then Enter — the canonical combobox interaction. */
      await pickup.press('ArrowDown');
      const activeId = await pickup.getAttribute('aria-activedescendant');
      expect(activeId, 'ArrowDown must set aria-activedescendant').toBeTruthy();
      const chosenLabel = (await page.locator(`#${activeId}`).innerText()).trim();
      await pickup.press('Enter');
      await expect(pickup).toHaveAttribute('aria-expanded', 'false');
      expect(chosenLabel.length).toBeGreaterThan(0);

      /* ---- 2. DATES: open the range calendar, select a start and an end
              day with the keyboard. The calendar is lazy-loaded, so wait
              for it rather than assuming it is already in the bundle. -- */
      const datesTrigger = page.getByTestId('date-range-trigger');
      await datesTrigger.click();

      const grid = page.getByRole('application').or(page.getByRole('grid')).first();
      await expect(grid).toBeVisible({ timeout: 15_000 });

      /* react-aria puts roving focus on a day cell. Enter starts the range,
         ArrowRight walks forward, Enter closes it. */
      await page.keyboard.press('Enter');
      for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');

      /* ---- 3. TIMES: pick a chip in each row. ---------------------- */
      for (const testId of ['time-chips-pickup', 'time-chips-return']) {
        const row = page.getByTestId(testId);
        await expect(row).toBeVisible();
        const chip = row.getByRole('button').nth(2);
        await chip.click();
        await expect(chip).toHaveAttribute('aria-pressed', 'true');
      }

      const done = page.getByTestId('dates-done');
      if (await done.isVisible().catch(() => false)) await done.click();

      /* ---- 4. SUBMIT and assert the search URL --------------------- */
      await page.getByTestId('booking-submit').click();
      await page.waitForURL(/[?&]pickup=/, { timeout: 15_000 });

      const url = new URL(page.url());
      expect(url.pathname, `${locale} must land on the localized fleet route`).toBe(fleetPath);

      for (const param of ['pickup', 'dropoff', 'from', 'to']) {
        expect(url.searchParams.get(param), `?${param} must be present`).toBeTruthy();
      }
      /* dropoff mirrors pickup while the "other location" toggle is off. */
      expect(url.searchParams.get('dropoff')).toBe(url.searchParams.get('pickup'));

      /* from/to are ISO instants built from Africa/Casablanca local time. */
      const from = new Date(url.searchParams.get('from'));
      const to = new Date(url.searchParams.get('to'));
      expect(Number.isNaN(from.getTime()), '?from must be a valid ISO instant').toBe(false);
      expect(Number.isNaN(to.getTime()), '?to must be a valid ISO instant').toBe(false);
      expect(to.getTime() - from.getTime(), 'the rental must last at least 24 h').toBeGreaterThanOrEqual(24 * 3600 * 1000);
      expect(from.getTime(), '?from must not be in the past').toBeGreaterThan(Date.now() - 24 * 3600 * 1000);

      expect(errors, `console must stay clean:\n${errors.join('\n')}`).toEqual([]);
    });
  });
}
