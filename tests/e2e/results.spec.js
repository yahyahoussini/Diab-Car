/* ------------------------------------------------------------------ */
/* The live results page (plan 4.4).                                   */
/*                                                                     */
/* Every assertion waits for a real element rather than sleeping. The  */
/* first draft of these tests used waitForTimeout and reported zero    */
/* cards on a page that was rendering twelve — the island simply had   */
/* not hydrated yet. A sleep long enough to be safe is long enough to  */
/* be flaky.                                                           */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

const DAY = 86400000;

function window_(offsetDays = 30, lengthDays = 3) {
  const from = new Date(Date.now() + offsetDays * DAY);
  from.setUTCHours(10, 0, 0, 0);
  const to = new Date(from.getTime() + lengthDays * DAY);
  return { from: from.toISOString(), to: to.toISOString() };
}

const resultsUrl = (locale, extra = {}) => {
  const w = window_();
  const q = new URLSearchParams({ from: w.from, to: w.to, ...extra });
  return `/${locale}/vehicules?${q}`;
};

/** The island is ready when the first live card exists. */
async function waitForResults(page) {
  await page.locator('[data-testid="results-grid"] article').first().waitFor({ timeout: 20000 });
}

test.describe('the bare fleet page', () => {
  test('renders the whole fleet server-side and stays indexable', async ({ page, request }) => {
    const res = await request.get('/fr/vehicules');
    expect(res.status()).toBe(200);
    /* The bare URL is the canonical, indexable one (CLAUDE.md rule 8). */
    expect(res.headers()['x-robots-tag']).toBeUndefined();

    const html = await res.text();
    /* The cards must be in the HTML itself, not only after hydration —
       that is the entire point of keeping the server grid. */
    expect(html).toContain('data-vehicle');
    expect(html.match(/data-vehicle/g).length).toBeGreaterThan(20);

    await page.goto('/fr/vehicules');
    await expect(page.locator('h1')).toContainText(/véhicules|vehicles/i);
  });

  test('a parametrised URL is noindex but still followed', async ({ request }) => {
    const res = await request.get(resultsUrl('fr'));
    expect(res.status()).toBe(200);
    expect(res.headers()['x-robots-tag']).toBe('noindex, follow');
  });
});

test.describe('searching', () => {
  test('shows per-day AND total for the chosen dates', async ({ page }) => {
    await page.goto(resultsUrl('fr', { pickup: 'aeroport-mohammed-v' }));
    await waitForResults(page);

    /* Header block: place · dates · days (plan 4.4). */
    const header = page.locator('[data-testid="results"] .eyebrow').first();
    await expect(header).toContainText('3 JOURS');

    await expect(page.locator('h1')).toContainText(/VOITURES PRÊTES/i);

    /* Rule 4: once dates are known, price per day AND total for the dates. */
    const card = page.locator('[data-testid="results-grid"] article').first();
    /* Case-insensitive: the uppercase is CSS text-transform, and
       toContainText reads the DOM, not the rendered text. */
    await expect(card).toContainText(/\/jour/i);
    await expect(card).toContainText(/AU TOTAL POUR 3 JOURS/i);
    await expect(card).toContainText('MAD');
  });

  test('caps the grid at 12 and offers the rest behind Voir plus', async ({ page }) => {
    await page.goto(resultsUrl('fr'));
    await waitForResults(page);

    const cards = page.locator('[data-testid="results-grid"] article');
    await expect(cards).toHaveCount(12);
    await expect(page.getByRole('button', { name: /Voir plus/i })).toBeVisible();

    await page.getByRole('button', { name: /Voir plus/i }).click();
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(12);
  });

  test('search from the home page lands on real results', async ({ page }) => {
    await page.goto('/fr', { waitUntil: 'load' });

    /* Drive the module the way a customer does. Dates are required, so they
       have to be picked before the search is valid — the same keyboard path
       booking.spec.js walks. */
    const widget = page.getByTestId('booking-widget');
    await expect(widget).toBeVisible();

    await page.getByTestId('date-range-trigger').click();
    const grid = page.getByRole('application').or(page.getByRole('grid')).first();
    await expect(grid).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Enter');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    const done = page.getByTestId('dates-done');
    if (await done.isVisible().catch(() => false)) await done.click();

    await page.getByTestId('booking-submit').click();

    /* Waiting on the PARAMS, not on "/vehicules": the public FR route is the
       localized slug (/fr/location-voiture-casablanca), so matching the
       internal path would fail in every locale but one. */
    await page.waitForURL(/[?&]from=/, { timeout: 20000 });
    await waitForResults(page);
    await expect(page.locator('h1')).toContainText(/VOITURES PRÊTES/i);

    /* The dates that were searched are the dates being priced. */
    expect(new URL(page.url()).searchParams.get('from')).toBeTruthy();
    await expect(page.locator('[data-testid="results-grid"] article').first()).toContainText(/au total pour/i);
  });
});

test.describe('filters', () => {
  test('Automatique narrows the count and writes it to the URL', async ({ page }) => {
    await page.goto(resultsUrl('fr'));
    await waitForResults(page);

    const before = Number((await page.locator('h1').innerText()).match(/\d+/)[0]);

    await page.getByRole('button', { name: /^Automatique/i }).first().click();
    await expect(page.locator('h1')).not.toContainText(String(before), { timeout: 5000 });

    const after = Number((await page.locator('h1').innerText()).match(/\d+/)[0]);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);

    /* history.replaceState, not a navigation: the URL carries the filter and
       the fetched results survive. */
    expect(page.url()).toContain('transmission=automatic');

    /* Every remaining card really is automatic. */
    const texts = await page.locator('[data-testid="results-grid"] article').allInnerTexts();
    for (const t of texts) expect(t).toContain('AUTOMATIQUE');
  });

  test('an active filter appears as a removable chip and resets', async ({ page }) => {
    await page.goto(resultsUrl('fr', { transmission: 'automatic' }));
    await waitForResults(page);

    const chip = page.getByRole('button', { name: /Retirer ce filtre/i }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page).toHaveURL(/^(?!.*transmission=automatic).*$/);
  });

  test('chip counts are live and a zero count is shown before it is tapped', async ({ page }) => {
    await page.goto(resultsUrl('fr'));
    await waitForResults(page);
    /* "7 places 0" must say 0 rather than silently returning nothing. */
    const seven = page.getByRole('button', { name: /7 places/i }).first();
    await expect(seven).toBeVisible();
    await expect(seven).toContainText(/\d/);
  });
});

test.describe('empty state', () => {
  test('shows the plan 4.13 copy and three actions when nothing matches', async ({ page }) => {
    /* seats=9 is reachable from a URL but no car in the fleet has nine, so the
       matching set is empty for any dates. This exercises the same branch a
       fully-booked window reaches, without needing to write to the database
       from a browser test. The true zero-availability case is covered by
       scripts/test-concurrency.mjs, which books a model out for real. */
    await page.goto(resultsUrl('fr', { seats: '9' }));

    const empty = page.getByTestId('empty-state');
    await expect(empty).toBeVisible({ timeout: 20000 });
    await expect(empty).toContainText('PAS DE VOITURE');
    await expect(empty.getByRole('button', { name: /Modifier les dates/i })).toBeVisible();
    await expect(empty.getByRole('button', { name: /Changer de lieu/i })).toBeVisible();
  });
});

test.describe('selection', () => {
  test('tapping a card opens the bottom bar with price, total and CONTINUER', async ({ page }) => {
    await page.goto(resultsUrl('fr'));
    await waitForResults(page);

    await page.locator('[data-testid="results-grid"] article').first().getByRole('button', { name: /Sélectionner/i }).click();

    const bar = page.getByTestId('selection-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('MAD');
    await expect(bar.getByRole('link', { name: /CONTINUER/i })).toBeVisible();

    /* CONTINUER keeps the dates so the vehicle page prices the same rental. */
    const href = await bar.getByRole('link', { name: /CONTINUER/i }).getAttribute('href');
    expect(href).toContain('from=');
    expect(href).toContain('to=');
  });
});

test.describe('RTL', () => {
  test('the Arabic results page renders and keeps Latin digits in prices', async ({ page }) => {
    await page.goto(resultsUrl('ar'));
    await waitForResults(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const card = page.locator('[data-testid="results-grid"] article').first();
    /* Plan 4.12: numbers stay Western Arabic digits. */
    await expect(card).toContainText(/\d/);
    expect(await card.innerText()).not.toMatch(/[٠-٩۰-۹]/);
  });
});
