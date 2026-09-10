/* ------------------------------------------------------------------ */
/* Homepage (plan 4.3): every section renders in all four locales     */
/* with a clean console, and a purpose tile filters the fleet block.   */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

const LOCALES = ['fr', 'en', 'ar', 'es'];

/** Section landmarks in plan 4.3 order. Ids are the contract the sections were built to. */
const SECTIONS = ['flotte', 'aeroport', 'how', 'trust', 'drive', 'faq', 'cta'];

function watch(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`uncaught: ${(e && (e.stack || e.message)) || String(e)}`));
  return errors;
}

test.describe('homepage sections', () => {
  for (const locale of LOCALES) {
    test(`/${locale} renders every section without console errors`, async ({ page }) => {
      const errors = watch(page);
      await page.goto(`/${locale}`, { waitUntil: 'load' });

      for (const id of SECTIONS) {
        const section = page.locator(`#${id}`);

        /* The FAQ block is CONTENT-driven: it renders the published questions,
           and Diab Car has not written any answers yet, so it correctly renders
           nothing at all. Asserting it always exists asserted that the content
           existed, which it never did — the block was only ever there because
           one row held the template's "TODO — réponse complète", and that is
           now withheld from the public site (rule 11).
           The invariant that IS always true, and is the one worth guarding:
           the section is either absent or populated, never present and empty.
           When the answers are written this tightens back up by itself. */
        if (id === 'faq' && (await section.count()) === 0) {
          expect(await page.locator('#faq [data-faq-item], #faq details, #faq li').count(), 'an absent FAQ block must render no orphan questions either').toBe(0);
          continue;
        }

        await expect(section, `section #${id} on /${locale}`).toHaveCount(1);
        await section.scrollIntoViewIfNeeded();
        await expect(section).toBeVisible();

        if (id === 'faq') {
          expect(await section.locator('h3, summary, [data-faq-item]').count(), 'a rendered FAQ block must carry at least one question').toBeGreaterThan(0);
        }
      }

      /* The road divider replaced the marquee: at least one between sections, no marquee track left. */
      expect(await page.locator('.road-dash').count(), 'road dividers').toBeGreaterThan(0);
      expect(await page.locator('.marquee-track').count(), 'the brand marquee must be gone').toBe(0);

      /* Reviews render only in demo mode (samples) — when present they must say so. */
      const reviews = page.locator('#reviews');
      if ((await reviews.count()) > 0) {
        await expect(reviews.getByTestId('reviews-counter')).toContainText(/0[1-9]\s*\/\s*0[1-9]/);
      }

      /* No untranslated dotted keys anywhere on the page. */
      const body = await page.locator('body').innerText();
      const raw = body.match(/\b(?:common|nav|footer|home|widget|locations|card|fleet|vehicle|booking|seo|cookie)\.[a-zA-Z]\w*(?:\.\w+)*/g) || [];
      expect(raw, `untranslated keys on /${locale}: ${raw.join(', ')}`).toEqual([]);

      expect(errors, `console on /${locale}:\n${errors.join('\n')}`).toEqual([]);
    });
  }

  test('a purpose tile filters the fleet block and scrolls to it', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/fr', { waitUntil: 'load' });

    const fleet = page.locator('#flotte');
    const visibleCards = () => fleet.locator('[data-vehicle]:not([hidden])');

    /* Default: six cards, mixed categories. */
    await expect(visibleCards()).toHaveCount(6);

    /* Tap "SUV & routes": only SUVs stay visible, still capped at six, and the fleet block is in view. */
    const suv = page.getByTestId('purpose-suv');
    await suv.click();
    await expect(suv).toHaveAttribute('aria-pressed', 'true');

    const cards = visibleCards();
    const n = await cards.count();
    expect(n, 'SUV filter must show at least one card').toBeGreaterThan(0);
    expect(n, 'never more than six cards').toBeLessThanOrEqual(6);
    for (let i = 0; i < n; i += 1) {
      await expect(cards.nth(i), `card ${i} must be an SUV`).toHaveAttribute('data-category', 'suv');
    }
    await expect(page.getByTestId('fleet-count')).toBeVisible();
    await expect(fleet).toBeInViewport({ ratio: 0.1 });

    /* Tapping the active tile again clears the filter. */
    await suv.click();
    await expect(suv).toHaveAttribute('aria-pressed', 'false');
    await expect(visibleCards()).toHaveCount(6);

    /* Every visible card is one link target with a proper name. */
    const first = cards.first().locator('h3 a');
    await expect(first).toHaveAttribute('href', /car-rental-casablanca|location-voiture-casablanca/);
    expect((await first.innerText()).trim().length).toBeGreaterThan(0);

    expect(errors, `console:\n${errors.join('\n')}`).toEqual([]);
  });
});
