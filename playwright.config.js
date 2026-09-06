/* ------------------------------------------------------------------ */
/* Playwright — end-to-end smoke tests.                                 */
/* CommonJS on purpose: package.json has no "type": "module", so a      */
/* plain .js file is CJS here. Keep require()/module.exports in this    */
/* file and in every spec under tests/e2e.                              */
/* ------------------------------------------------------------------ */

const { existsSync } = require('node:fs');
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

/* ------------------------------------------------------------------ */
/* Web server                                                           */
/* `npm run start` is `next start`, which refuses to boot without a     */
/* production build. We look for .next/BUILD_ID at config load time:    */
/* missing → build first (slow, ~1 run per CI job or after a clean);    */
/* present → reuse the existing build so a local re-run starts in       */
/* seconds. Delete .next (or its BUILD_ID) to force a rebuild.          */
/* ------------------------------------------------------------------ */
const HAS_PRODUCTION_BUILD = existsSync(path.join(__dirname, '.next', 'BUILD_ID'));
const SERVER_COMMAND = HAS_PRODUCTION_BUILD ? 'npm run start' : 'npm run build && npm run start';

/* ------------------------------------------------------------------ */
/* User agent                                                           */
/* A plain desktop Chrome UA — it must NOT match the BOT regex in       */
/* src/proxy.js (bot|crawl|spider|…|lighthouse|pagespeed). Bots are     */
/* redirected to the default locale, which would break the /en, /ar and */
/* /es assertions. Playwright's own headless UA ("HeadlessChrome") does */
/* not match either, but pinning the string keeps the run deterministic */
/* across Playwright upgrades and headed/headless modes.                */
/* ------------------------------------------------------------------ */
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

module.exports = defineConfig({
  /* Scope the runner to the e2e folder so it can never pick up the     */
  /* node:test unit tests that live at src/**\/*.test.js. testMatch is   */
  /* redundant belt-and-braces on top of testDir.                       */
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  /* One worker, and a retry everywhere. Five short smoke tests do not need   */
  /* parallelism, and launching four Chromium instances at once on Windows    */
  /* intermittently fails with `spawn EPERM` / `Target crashed` (AV and       */
  /* profile-dir contention, not an app fault). A smoke suite that flakes is  */
  /* worse than a slow one.                                                   */
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    userAgent: DESKTOP_CHROME_UA,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], userAgent: DESKTOP_CHROME_UA },
    },
  ],

  webServer: {
    command: SERVER_COMMAND,
    /* /fr is the default locale and is served without any redirect,    */
    /* so it is the cheapest reliable readiness probe.                  */
    url: `${BASE_URL}/fr`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      /* baseURL and the readiness probe above both hard-code the port,  */
      /* so pin it for `next start` too: it reads process.env.PORT, and  */
      /* @next/env never overrides a variable that is already set, so an */
      /* ambient PORT (shell or .env.local) cannot desynchronise the     */
      /* server from the URL Playwright polls (which would hang for the  */
      /* full webServer timeout).                                        */
      PORT: String(PORT),
      /* src/proxy.js serves /admin/* under the public host only when    */
      /* the host is localhost OR ADMIN_ALLOW_PATH === 'true'. localhost */
      /* already qualifies; setting it anyway makes the admin smoke test */
      /* host-independent (127.0.0.1, a tunnel, a container name…).      */
      ADMIN_ALLOW_PATH: 'true',
      /* No Supabase env → the app runs off the demo adapter, which is   */
      /* what the smoke tests expect (see .env.example).                 */
    },
  },
});
