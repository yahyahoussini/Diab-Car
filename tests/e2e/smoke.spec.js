/* ------------------------------------------------------------------ */
/* Smoke tests — every public locale plus the admin login must render   */
/* with a clean console. CommonJS (package.json has no "type":          */
/* "module"). Nothing is imported from src/: the spec must not drag the */
/* app's ESM + "@/" alias graph into Playwright's loader.               */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

/**
 * Public locales, duplicated from src/i18n/routing.js on purpose (see the
 * banner above). `dir` mirrors `rtlLocales` — Arabic is the only RTL one.
 */
const LOCALES = [
  { locale: 'fr', dir: 'ltr' },
  { locale: 'en', dir: 'ltr' },
  { locale: 'ar', dir: 'rtl' },
  { locale: 'es', dir: 'ltr' },
];

/**
 * Console messages allowed through. EMPTY BY DESIGN — the whole point of
 * these tests is "no console errors". Every entry added here is a defect we
 * chose to live with, so it needs a comment naming the message, why it is
 * benign and what would let us delete the entry again. Never add a broad
 * catch-all pattern.
 * @type {RegExp[]}
 */
const IGNORED_CONSOLE_PATTERNS = [];

/**
 * Attach console / pageerror / requestfailed listeners BEFORE navigating, so
 * nothing emitted during the very first paint is missed.
 * @param {import('@playwright/test').Page} page
 * @returns {{ errors: string[], failedRequests: string[], describe: (label: string) => string }}
 */
function watchForProblems(page) {
  /** Console messages of type "error". */
  const consoleErrors = [];
  /** Uncaught exceptions and unhandled rejections. */
  const pageErrors = [];
  /** Requests that never completed — reported, but they do NOT fail a test. */
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
    const location = message.location();
    const where = location && location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : '';
    consoleErrors.push(`console.error: ${text}${where}`);
  });

  page.on('pageerror', (error) => {
    pageErrors.push(`uncaught: ${(error && (error.stack || error.message)) || String(error)}`);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    failedRequests.push(`${request.method()} ${request.url()} — ${(failure && failure.errorText) || 'unknown error'}`);
  });

  return {
    /** Page errors first: an uncaught exception usually explains the rest. */
    get errors() {
      return [...pageErrors, ...consoleErrors];
    },
    get failedRequests() {
      return [...failedRequests];
    },
    /**
     * Human-readable assertion message: a bare "expected 0, received 3" is
     * useless, so print every collected line (and the failed requests as
     * context, even though they do not decide the assertion).
     * @param {string} label
     */
    describe(label) {
      const lines = [`${label} — console must be clean.`];
      const errors = [...pageErrors, ...consoleErrors];
      lines.push(
        errors.length ? `Errors (${errors.length}):` : 'Errors (0).',
        ...errors.map((entry, index) => `  ${index + 1}. ${entry}`),
      );
      if (failedRequests.length) {
        lines.push(
          `Failed requests (${failedRequests.length}, context only, not asserted):`,
          ...failedRequests.map((entry, index) => `  ${index + 1}. ${entry}`),
        );
      }
      return lines.join('\n');
    },
  };
}

/* ------------------------------------------------------------------ */
/* Public site                                                          */
/* ------------------------------------------------------------------ */
test.describe('public home pages', () => {
  for (const { locale, dir } of LOCALES) {
    test(`/${locale} renders with a clean console`, async ({ page }) => {
      const problems = watchForProblems(page);

      const response = await page.goto(`/${locale}`, { waitUntil: 'load' });
      expect(response, `GET /${locale} returned no response`).not.toBeNull();
      expect(response.status(), `GET /${locale} → HTTP ${response.status()}`).toBeLessThan(400);

      const html = page.locator('html');
      await expect(html, `<html lang> on /${locale}`).toHaveAttribute('lang', locale);
      await expect(html, `<html dir> on /${locale}`).toHaveAttribute('dir', dir);

      await expect(page.locator('main#main'), `<main id="main"> on /${locale}`).toBeVisible();

      expect(problems.errors, problems.describe(`/${locale}`)).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ */
/* Admin                                                                */
/* src/proxy.js serves /admin/* on localhost (and wherever              */
/* ADMIN_ALLOW_PATH=true); unauthenticated visitors see the login form. */
/* We only check that it renders — no login attempt.                    */
/* ------------------------------------------------------------------ */
test.describe('admin', () => {
  test('/admin/login renders the login form with a clean console', async ({ page }) => {
    const problems = watchForProblems(page);

    const response = await page.goto('/admin/login', { waitUntil: 'load' });
    expect(response, 'GET /admin/login returned no response').not.toBeNull();
    expect(response.status(), `GET /admin/login → HTTP ${response.status()}`).toBeLessThan(400);

    // Labels come from src/components/admin/LoginForm.js via <Field label…>,
    // wired to the input by htmlFor/id — stable, unlike the utility classes.
    const password = page.getByLabel(/mot de passe/i);
    await expect(password, 'password field').toBeVisible();
    await expect(password, 'password field type').toHaveAttribute('type', 'password');

    const submit = page.getByRole('button', { name: /se connecter/i });
    await expect(submit, 'submit button').toBeVisible();
    await expect(submit, 'submit button').toBeEnabled();

    expect(problems.errors, problems.describe('/admin/login')).toEqual([]);
  });
});
