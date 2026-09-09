/* ------------------------------------------------------------------ */
/* Motion (plan 5.3, prompt 14).                                       */
/*                                                                     */
/* These assert the things that make motion SAFE rather than pretty:   */
/* that the custom cursor exists for the people it is meant for, and   */
/* — more importantly — that it does not exist for anyone else. A      */
/* cursor layer on a phone, or under prefers-reduced-motion, is not a  */
/* cosmetic slip: it hides the pointer or animates for someone who     */
/* asked the system not to (CLAUDE.md rule 3, rule 6).                 */
/*                                                                     */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

test.describe('the custom cursor', () => {
  test('mounts on a fine pointer and labels a fleet card', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fr/location-voiture-casablanca');

    const layer = page.getByTestId('cursor-layer');
    await expect(layer).toHaveCount(1, { timeout: 20000 });
    /* The stylesheet hides the platform cursor off THIS attribute, so if the
       component ever stops setting it the page keeps its real pointer. */
    await expect(page.locator('html')).toHaveAttribute('data-cursor-on', '');

    const card = page.locator('[data-slug]').first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const px = Math.round(box.x + box.width / 2);
    const py = Math.round(box.y + box.height / 2);
    await page.mouse.move(px, py, { steps: 10 });

    await expect.poll(async () => (await layer.innerText()).trim(), { timeout: 10000 }).toMatch(/voir/i);

    /* Centred on the pointer, not beside it. This is the assertion that caught
       the RTL bug below: an absolutely positioned box with `left: auto` takes
       its static position, which in an RTL container is the RIGHT edge, so the
       label sat a full width away from the pointer in Arabic only. */
    const pill = layer.locator('span span').first();
    /* Polled, not read once: the ring rides a spring and is still travelling
       the instant the label text appears. */
    await expect
      .poll(async () => {
        const b = await pill.boundingBox();
        return b ? Math.round(Math.max(Math.abs(b.x + b.width / 2 - px), Math.abs(b.y + b.height / 2 - py))) : 999;
      }, { timeout: 10000 })
      .toBeLessThan(6);
  });

  test('is centred on the pointer in Arabic too', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ar/car-rental-casablanca');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const card = page.locator('[data-slug]').first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const px = Math.round(box.x + box.width / 2);
    const py = Math.round(box.y + box.height / 2);
    await page.mouse.move(px, py, { steps: 10 });

    const pill = page.getByTestId('cursor-layer').locator('span span').first();
    await expect.poll(async () => {
      const b = await pill.boundingBox();
      return b ? Math.round(Math.abs(b.x + b.width / 2 - px)) : 999;
    }, { timeout: 10000 }).toBeLessThan(6);
  });

  test('never mounts on a touch device', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/fr');
    await expect(page.getByTestId('cursor-layer')).toHaveCount(0);
    /* And therefore the stylesheet never hides the real pointer. */
    await expect(page.locator('html')).not.toHaveAttribute('data-cursor-on', '');
    await ctx.close();
  });

  test('never mounts under prefers-reduced-motion', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/fr');
    await expect(page.getByTestId('cursor-layer')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-cursor-on', '');
  });
});

test.describe('the theme change', () => {
  test('opens as a circle measured from the toggle, and cleans up after itself', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fr');

    const toggle = page.getByRole('button', { name: /sombre|clair/i }).first();
    await expect(toggle).toBeVisible({ timeout: 20000 });
    const tb = await toggle.boundingBox();
    await toggle.click();

    const vars = await page.evaluate(() => {
      const s = document.documentElement.style;
      return {
        x: parseFloat(s.getPropertyValue('--vt-x')),
        y: parseFloat(s.getPropertyValue('--vt-y')),
        r: parseFloat(s.getPropertyValue('--vt-r')),
      };
    });

    /* The origin is the toggle itself — that is the whole point of the effect;
       a circle from the middle of the screen is just a crossfade with extra
       steps. */
    expect(Math.abs(vars.x - (tb.x + tb.width / 2)), 'iris origin x').toBeLessThan(4);
    expect(Math.abs(vars.y - (tb.y + tb.height / 2)), 'iris origin y').toBeLessThan(4);
    /* Big enough to reach the far corner, or the old theme is left showing in
       a corner when the animation ends. */
    expect(vars.r).toBeGreaterThan(600);

    /* The flag must always come off again: left behind, it would iris every
       later root view transition on the page too. */
    await expect.poll(async () => page.locator('html[data-theme-sweep]').count(), { timeout: 10000 }).toBe(0);
  });
});
