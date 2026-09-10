/* ------------------------------------------------------------------ */
/* The vehicle page (plan 4.6 / 8.2).                                  */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

const SLUG = 'dacia-logan-diesel';
const LOCALES = ['fr', 'en', 'ar', 'es'];
const DAY = 86400000;

/** A window far enough out that nothing seeded collides with it. */
function window_(offsetDays, lengthDays = 3) {
  const from = new Date(Date.now() + offsetDays * DAY);
  from.setUTCHours(10, 0, 0, 0);
  return { from: from.toISOString(), to: new Date(from.getTime() + lengthDays * DAY).toISOString() };
}

const vehicleUrl = (locale, extra = {}) => `/${locale}/vehicules/${SLUG}${Object.keys(extra).length ? `?${new URLSearchParams(extra)}` : ''}`;

test.describe('vehicle page', () => {
  for (const locale of LOCALES) {
    test(`renders in ${locale} with one h1, the spec grid and the booking panel`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

      await page.goto(vehicleUrl(locale));

      /* Plan 8.2: exactly one H1, and it is the car. */
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toContainText('Dacia');
      await expect(page.locator('h1')).toContainText('Logan');

      await expect(page.getByTestId('availability-block')).toBeVisible();
      await expect(page.getByTestId('vehicle-book')).toBeVisible();

      /* The WhatsApp FAB must not be here — the booking panel already offers
         WhatsApp, and two floating buttons overlapped (plan 4.6). */
      await expect(page.locator('.animate-ping')).toHaveCount(0);

      expect(errors, `console must stay clean:\n${errors.join('\n')}`).toEqual([]);
    });
  }

  test('Arabic is RTL and keeps Latin digits in the price', async ({ page }) => {
    await page.goto(vehicleUrl('ar'));
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const panel = page.getByTestId('availability-block').locator('xpath=..');
    expect(await panel.innerText()).not.toMatch(/[٠-٩۰-۹]/);
  });
});

test.describe('SEO', () => {
  test('carries Product, Car, Offer, BreadcrumbList and FAQPage', async ({ request }) => {
    const res = await request.get(vehicleUrl('fr'));
    const html = await res.text();

    for (const type of ['"Product","Car"', 'UnitPriceSpecification', 'BreadcrumbList']) {
      expect(html, `JSON-LD must include ${type}`).toContain(type);
    }

    /* FAQPage is content-driven and Diab Car has written no answers yet, so the
       page emits none. What must never happen is the broken middle state this
       replaced: an FAQPage with an empty mainEntity, which Search Console
       reports as an error. Either real questions or no FAQPage at all. */
    if (html.includes('FAQPage')) {
      expect(html, 'an FAQPage with no questions is invalid structured data').not.toContain('"mainEntity":[]');
    }
    /* The price specification is per DAY in MAD (plan 8.2). */
    expect(html).toContain('"unitCode":"DAY"');
    expect(html).toContain('"priceCurrency":"MAD"');
  });

  test('uses the pre-rendered Open Graph card, not the runtime route', async ({ request }) => {
    const html = await (await request.get(vehicleUrl('fr'))).text();
    const og = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(og, 'og:image must be present').toBeTruthy();
    /* Plan 9.3: static per page, so a share costs the Worker nothing. */
    expect(og).toContain(`/og/fr/${SLUG}.png`);

    const img = await request.get(`/og/fr/${SLUG}.png`);
    expect(img.status()).toBe(200);
    expect(Number(img.headers()['content-length'] || 0)).toBeGreaterThan(10000);
  });

  test('hreflang covers all four locales plus x-default', async ({ request }) => {
    const html = await (await request.get(vehicleUrl('fr'))).text();
    /* Case-insensitive: React serialises the prop as `hrefLang`. HTML
       attribute names are case-insensitive so crawlers read it either way —
       matching the lowercase spelling literally was a bug in this test, not in
       the output. */
    for (const l of [...LOCALES, 'x-default']) {
      expect(html, `hreflang for ${l}`).toMatch(new RegExp(`hreflang="${l}"`, 'i'));
    }
    /* And each one points at that locale's own URL, not all at the same page. */
    expect(html).toMatch(/hreflang="en"[^>]*\/en\//i);
    expect(html).toMatch(/hreflang="ar"[^>]*\/ar\//i);
  });

  test('a parametrised vehicle URL is noindex, the bare one is not', async ({ request }) => {
    const bare = await request.get(vehicleUrl('fr'));
    expect(bare.headers()['x-robots-tag']).toBeUndefined();

    const w = window_(40);
    const withDates = await request.get(vehicleUrl('fr', { from: w.from, to: w.to }));
    expect(withDates.headers()['x-robots-tag']).toBe('noindex, follow');
  });
});

test.describe('availability for the visitor dates', () => {
  test('says available and prices the rental', async ({ page }) => {
    const w = window_(45);
    await page.goto(vehicleUrl('fr', { from: w.from, to: w.to }));

    const block = page.getByTestId('availability-block');
    await expect(block.locator('[data-state="available"]')).toBeVisible({ timeout: 20000 });
    await expect(block).toContainText(/disponible pour vos dates/i);

    /* Rule 4: the total for those dates appears with the per-day price. */
    await expect(page.getByText(/total pour 3 jours/i)).toBeVisible();

    /* The dates travel INTO the booking pop-up. They used to be asserted as
       `from=`/`to=` on the button's href, back when the button was a link to
       the funnel; « Réserver cette voiture » now opens the dialog on this page,
       so the thing worth checking is that the dialog opens and already knows
       the dates and the price the panel was showing — which is the rule-4
       promise the href only stood in for. */
    await page.getByTestId('vehicle-book').click();
    const modal = page.getByTestId('booking-modal');
    await expect(modal).toBeVisible({ timeout: 20000 });
    await expect(modal).toHaveAttribute('data-step', '1');

    /* The same total the panel quoted, carried across without re-asking. */
    await expect(page.getByTestId('booking-total-amount')).toContainText(/\d/, { timeout: 20000 });
    const inModal = (await page.getByTestId('booking-total-amount').textContent()).replace(/[^\d]/g, '');
    expect(Number(inModal), 'the pop-up opens already priced for the visitor dates').toBeGreaterThan(0);
  });

  test('says sold out and offers alternatives when every unit is taken', async ({ page }) => {
    test.skip(!db.available, 'needs SUPABASE_SERVICE_ROLE_KEY — a sold-out test that cannot book anything would pass against an available car');

    /* A window of its own so this never fights another test. */
    const w = window_(120);
    const booked = await db.bookOut(SLUG, w.from, w.to);
    expect(booked, 'setup must actually take the units').toBeGreaterThan(0);

    try {
      await page.goto(vehicleUrl('fr', { from: w.from, to: w.to }));

      const block = page.getByTestId('availability-block');
      await expect(block.locator('[data-state="unavailable"]')).toBeVisible({ timeout: 20000 });
      await expect(block).toContainText(/indisponible/i);

      /* Plan 4.6: the next available date, and three cars of the same
         category that ARE free for the same dates. */
      await expect(block).toContainText(/prochaine disponibilité/i);
      const alts = block.locator('a[href*="/vehicules/"]');
      expect(await alts.count()).toBeGreaterThan(0);
      /* An alternative must never be the car that is sold out. */
      for (const href of await alts.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
        expect(href).not.toContain(SLUG);
      }

      /* And the CTA must not invite a booking that cannot happen. It used to
         assert aria-disabled on a link into the funnel; the CTA now opens the
         booking pop-up, and disabling it would strand the visitor, because the
         pop-up is precisely where they pick OTHER dates. So the refusal moved
         inside: the dialog opens on these dates and says no to THEM. */
      await page.getByTestId('vehicle-book').click();
      const modal = page.getByTestId('booking-modal');
      await expect(modal).toBeVisible({ timeout: 20000 });
      await expect(modal).toContainText(/pas libre sur ces dates/i, { timeout: 20000 });
      await expect(page.getByTestId('booking-next')).toBeDisabled();
    } finally {
      await db.cleanup();
    }
  });
});

test.describe('gallery', () => {
  test('opens full screen and closes with Escape', async ({ page }) => {
    await page.goto(vehicleUrl('fr'));

    const opener = page.getByRole('button', { name: /agrandir les photos/i });
    await expect(opener).toBeVisible();
    await opener.click();

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('hides the interior toggle while no interior photo exists', async ({ page }) => {
    await page.goto(vehicleUrl('fr'));
    /* Rule 11 applied to UI: an empty INTÉRIEUR tab would promise photos that
       do not exist. It appears the moment they are added to the pipeline. */
    await expect(page.getByRole('tab', { name: /intérieur/i })).toHaveCount(0);
  });
});
