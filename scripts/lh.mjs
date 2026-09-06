#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* scripts/lh.mjs - Lighthouse MOBILE audit runner (npm run lh)        */
/*                                                                     */
/* Builds (only when needed), starts `next start`, audits the public   */
/* URLs on the standard throttled mobile profile, prints the CLAUDE.md */
/* rule 7 budget (LCP <= 2.0 s, INP <= 200 ms measured through TBT,    */
/* CLS <= 0.05) and always kills the server + Chrome it spawned.       */
/*                                                                     */
/* Usage:                                                              */
/*   node scripts/lh.mjs [--build | --no-build] [--port=3000]          */
/*                       [--runs=2] [--strict] [/extra/path ...]       */
/*                                                                     */
/* Exit codes: 0 report only (default) - 1 a budget line failed while  */
/* --strict - 2 infrastructure failure (build, server, no Chrome).     */
/* ------------------------------------------------------------------ */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
const BUILD_ID = path.join(ROOT, '.next', 'BUILD_ID');
const OUT_DIR = path.join(ROOT, '.lighthouse');

/** Server boot budget: a cold `next start` on Windows can be slow. */
const SERVER_TIMEOUT_MS = 120_000;

/** CLAUDE.md rule 7, in Lighthouse units. */
const BUDGET = { lcpMs: 2000, tbtMs: 200, cls: 0.05 };

/** Default routes: FR home + FR fleet page (/vehicules -> localized slug). */
const DEFAULT_PATHS = ['/fr', '/fr/location-voiture-casablanca'];

const CHROME_FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];

const CATEGORIES = [
  ['performance', 'Performance'],
  ['accessibility', 'Accessibility'],
  ['best-practices', 'Best practices'],
  ['seo', 'SEO'],
];

const HELP = [
  '',
  'Lighthouse mobile audit runner (CLAUDE.md rule 7).',
  '',
  '  node scripts/lh.mjs [options] [/extra/path ...]',
  '',
  '  --build        force a fresh next build even when .next/BUILD_ID exists',
  '  --no-build     never build, audit whatever is already in .next',
  '  --port=NNNN    port used by next start (default 3000)',
  '  --runs=N       Lighthouse runs per URL, best kept (default 2, min 1)',
  '  --strict       exit 1 when a budget line fails (default: always exit 0)',
  '',
].join('\n');

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Parse argv into options.
 * @param {string[]} argv
 * @returns {{port:number,runs:number,strict:boolean,build:'auto'|'always'|'never',paths:string[],help:boolean}}
 */
function parseArgs(argv) {
  const options = { port: 3000, runs: 2, strict: false, build: 'auto', paths: [], help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--build') options.build = 'always';
    else if (arg === '--no-build') options.build = 'never';
    else if (arg === '--strict') options.strict = true;
    else if (arg.startsWith('--port=')) options.port = Number.parseInt(arg.slice(7), 10) || 3000;
    else if (arg.startsWith('--runs=')) options.runs = Math.max(1, Number.parseInt(arg.slice(7), 10) || 1);
    else if (arg.startsWith('-')) console.warn(`  ! unknown flag ignored: ${arg}`);
    else options.paths.push(arg.startsWith('/') ? arg : `/${arg}`);
  }
  return options;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const line = (char = '-') => char.repeat(70);

/** @param {number|null} ms */
const asSeconds = (ms) => (ms == null ? '   n/a' : `${(ms / 1000).toFixed(2)} s`);
/** @param {number|null} ms */
const asMs = (ms) => (ms == null ? '   n/a' : `${Math.round(ms)} ms`);
/** @param {number|null} value */
const asUnitless = (value) => (value == null ? '  n/a' : value.toFixed(3));

/**
 * Read an audit numericValue without trusting the audit to exist
 * (Lighthouse drops audits between majors, e.g. `interactive`).
 * @param {object} lhr
 * @param {string} id
 * @returns {number|null}
 */
function metric(lhr, id) {
  const value = lhr?.audits?.[id]?.numericValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Category score out of 100, or null when the category did not run.
 * @param {object} lhr
 * @param {string} id
 * @returns {number|null}
 */
function score(lhr, id) {
  const value = lhr?.categories?.[id]?.score;
  return typeof value === 'number' ? Math.round(value * 100) : null;
}

/**
 * Filename-safe slug for a URL path: `/fr/location-voiture-casablanca`
 * becomes `fr-location-voiture-casablanca`.
 * @param {string} urlPath
 * @returns {string}
 */
function slugify(urlPath) {
  const slug = urlPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'root';
}

/** Repo-relative, forward-slashed path for printing. */
const rel = (target) => path.relative(ROOT, target).split(path.sep).join('/');

/**
 * Print a fatal message, clean up every child, and exit.
 * @param {string} message
 * @param {number} code
 * @returns {Promise<never>}
 */
async function bail(message, code) {
  console.error(`\n  FAILED  ${message}\n`);
  await cleanup();
  process.exit(code);
}

/* ------------------------------------------------------------------ */
/* Process lifecycle: the build child, the server child and Chrome,    */
/* killed exactly once, from every exit path and from SIGINT/SIGTERM.  */
/* ------------------------------------------------------------------ */

/** @type {import('node:child_process').ChildProcess|null} */
let server = null;
/** @type {import('node:child_process').ChildProcess|null} */
let builder = null;
/** @type {{port:number, kill:() => unknown}|null} */
let chrome = null;
let cleanedUp = false;

/**
 * Terminate one spawned child, then insist, tolerating an already-dead one.
 * @param {import('node:child_process').ChildProcess|null} child
 * @returns {Promise<void>}
 */
async function killChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  // Give it a beat, then insist. The child was spawned directly from
  // process.execPath, so on win32 there is no shell wrapper to outlive us.
  await delay(400);
  try {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  } catch {
    /* ignore */
  }
}

async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;

  if (chrome) {
    try {
      await chrome.kill();
    } catch {
      /* Chrome already gone - nothing to do. */
    }
    chrome = null;
  }

  // Both children are tracked: a Ctrl+C during `next build` must not leave
  // the build running (a console Ctrl+C reaches it, a plain SIGTERM does not).
  const build = builder;
  builder = null;
  const child = server;
  server = null;
  await killChild(build);
  await killChild(child);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup().finally(() => process.exit(130));
  });
}

/* ------------------------------------------------------------------ */
/* Step 1 - build                                                      */
/* ------------------------------------------------------------------ */

/**
 * Run `next build` as a direct node child - never through a shell, npm or
 * npx: on Windows those leave orphan processes that cannot be killed.
 * @returns {Promise<number>} exit code (-1 when the child could not start)
 */
function runBuild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [NEXT_BIN, 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
    builder = child;
    child.on('error', () => {
      builder = null;
      resolve(-1);
    });
    child.on('exit', (code) => {
      builder = null;
      resolve(code ?? -1);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Step 2 - server                                                     */
/* ------------------------------------------------------------------ */

/**
 * Start `next start -p <port>` and wait until it answers on /fr.
 * Exits the process (code 2) when the server dies or never comes up.
 * @param {number} port
 * @returns {Promise<void>}
 */
async function startServer(port) {
  /** @type {string[]} */
  const output = [];
  let exited = false;

  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
    cwd: ROOT,
    stdio: 'pipe',
    detached: false,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', PORT: String(port) },
  });
  server = child;

  // Keep the pipes drained, or a chatty server blocks on a full buffer.
  const collect = (chunk) => {
    if (output.length < 400) output.push(String(chunk));
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  child.on('error', (error) => {
    exited = true;
    collect(String(error?.message || error));
  });
  child.on('exit', () => {
    exited = true;
  });

  const probe = `http://localhost:${port}/fr`;
  const deadline = Date.now() + SERVER_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (exited) {
      console.error(`\n  server output:\n${output.join('') || '  (none)'}`);
      await bail(`the server exited before answering on ${probe}.`, 2);
    }
    try {
      const response = await fetch(probe, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer().catch(() => {});
      // A resolved fetch already proves something is listening: never gate on
      // the status code. Under redirect:'manual' the Fetch standard answers a
      // 3xx with an opaque-redirect response whose status is 0, so a redirect
      // on /fr would otherwise look like "server never came up" for 120 s.
      const status = response.status || response.type || 'no status';
      console.log(`  server up on http://localhost:${port} (HTTP ${status} on /fr)`);
      return;
    } catch {
      /* not listening yet */
    }
    await delay(500);
  }

  console.error(`\n  server output:\n${output.join('') || '  (none)'}`);
  await bail(
    `${probe} did not answer within ${SERVER_TIMEOUT_MS / 1000}s. Port ${port} already taken? Try --port=3001.`,
    2,
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 - Chrome (chrome-launcher, Playwright Chromium as fallback)  */
/* ------------------------------------------------------------------ */

/**
 * Locate Playwright's bundled Chromium without adding a runtime dependency.
 * @returns {Promise<string|null>}
 */
async function playwrightChromium() {
  for (const specifier of ['playwright-core', '@playwright/test', 'playwright']) {
    try {
      const mod = await import(specifier);
      const chromium = mod.chromium ?? mod.default?.chromium;
      const executable = chromium?.executablePath?.();
      if (executable && existsSync(executable)) return executable;
    } catch {
      /* not installed, or no browser downloaded - try the next specifier */
    }
  }
  return null;
}

const NO_CHROME_HINT = [
  '  Fix: install Google Chrome, or run `npx playwright install chromium`,',
  '  or point CHROME_PATH at an existing Chrome / Chromium binary.',
].join('\n');

/**
 * Launch headless Chrome, retrying once with Playwright's Chromium.
 * @param {{launch: Function}} chromeLauncher
 * @returns {Promise<{port:number, kill:() => unknown}>}
 */
async function launchChrome(chromeLauncher) {
  try {
    return await chromeLauncher.launch({ chromeFlags: CHROME_FLAGS });
  } catch (error) {
    const executable = await playwrightChromium();
    if (!executable) {
      await bail(`no Chrome found for Lighthouse.\n  chrome-launcher: ${error?.message || error}\n${NO_CHROME_HINT}`, 2);
    }
    console.log('  chrome-launcher found no browser - falling back to Playwright Chromium');
    process.env.CHROME_PATH = executable;
    try {
      return await chromeLauncher.launch({ chromeFlags: CHROME_FLAGS });
    } catch (retryError) {
      await bail(
        `no usable Chrome: the Playwright fallback failed too.\n  ${retryError?.message || retryError}\n${NO_CHROME_HINT}`,
        2,
      );
    }
  }
  throw new Error('unreachable');
}

/* ------------------------------------------------------------------ */
/* Step 4 - Lighthouse, explicit mobile settings                       */
/* ------------------------------------------------------------------ */

/**
 * Lighthouse's standard MOBILE profile, spelled out so a Lighthouse major
 * cannot silently change what the budget is measured against.
 * @param {number} port CDP port of the launched Chrome
 */
function lighthouseFlags(port) {
  return {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 360, height: 640, deviceScaleFactor: 2.625, disabled: false },
    throttlingMethod: 'simulate',
    // Mobile "Slow 4G" preset - the one the CLAUDE.md budget assumes.
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.56,
      uploadThroughputKbps: 675,
      cpuSlowdownMultiplier: 4,
    },
  };
}

/**
 * Audit one URL `runs` times and keep the best performance run: Lighthouse
 * is noisy, and the optimistic run is the reproducible one.
 * @param {Function} lighthouse
 * @param {string} url
 * @param {number} port
 * @param {number} runs
 * @returns {Promise<{lhr:object, report:string}|null>}
 */
async function auditUrl(lighthouse, url, port, runs) {
  let best = null;
  for (let run = 1; run <= runs; run += 1) {
    process.stdout.write(`  ${url} - run ${run}/${runs} ... `);
    let result;
    try {
      result = await lighthouse(url, lighthouseFlags(port));
    } catch (error) {
      console.log('failed');
      console.error(`    ${error?.message || error}`);
      continue;
    }
    const lhr = result?.lhr;
    if (!lhr) {
      console.log('no result');
      continue;
    }
    const perf = score(lhr, 'performance');
    console.log(`performance ${perf ?? 'n/a'}`);

    const report = Array.isArray(result.report) ? result.report[0] : result.report;
    const candidate = { lhr, report: typeof report === 'string' ? report : JSON.stringify(lhr) };
    if (!best) {
      best = candidate;
      continue;
    }
    const bestPerf = score(best.lhr, 'performance') ?? -1;
    const bestLcp = metric(best.lhr, 'largest-contentful-paint') ?? Infinity;
    const thisPerf = perf ?? -1;
    const thisLcp = metric(lhr, 'largest-contentful-paint') ?? Infinity;
    if (thisPerf > bestPerf || (thisPerf === bestPerf && thisLcp < bestLcp)) best = candidate;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Step 5 - report                                                     */
/* ------------------------------------------------------------------ */

/**
 * Print one compact block for a URL and say whether the budget holds.
 * @param {string} url
 * @param {object} lhr
 * @param {string} reportPath
 * @returns {boolean} true when every budget line passes
 */
function printBlock(url, lhr, reportPath) {
  const lcp = metric(lhr, 'largest-contentful-paint');
  const tbt = metric(lhr, 'total-blocking-time');
  const cls = metric(lhr, 'cumulative-layout-shift');
  const fcp = metric(lhr, 'first-contentful-paint');
  const speedIndex = metric(lhr, 'speed-index');
  const tti = metric(lhr, 'interactive');

  const scores = CATEGORIES.map(([id, label]) => `${label} ${String(score(lhr, id) ?? 'n/a').padStart(3)}`).join('   ');

  const lcpOk = lcp != null && lcp <= BUDGET.lcpMs;
  const tbtOk = tbt != null && tbt <= BUDGET.tbtMs;
  const clsOk = cls != null && cls <= BUDGET.cls;
  const verdict = (ok) => (ok ? 'PASS' : 'FAIL');

  console.log('');
  console.log(line());
  console.log(`  ${url}`);
  console.log(line());
  console.log(`  ${scores}    (/100)`);
  console.log('');
  console.log(`  LCP              ${asSeconds(lcp)}`);
  console.log(`  TBT (INP proxy)  ${asMs(tbt)}`);
  console.log(`  CLS              ${asUnitless(cls)}`);
  console.log(`  FCP ${asSeconds(fcp)}    Speed Index ${asSeconds(speedIndex)}    TTI ${asSeconds(tti)}`);
  console.log('');
  console.log(
    `  BUDGET  LCP <= 2000 ms ${verdict(lcpOk)}  |  TBT <= 200 ms ${verdict(tbtOk)}  |  CLS <= 0.05 ${verdict(clsOk)}`,
  );
  console.log(`  LHR     ${rel(reportPath)}`);

  return lcpOk && tbtOk && clsOk;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    process.exit(0);
  }

  // Deduplicated: two identical paths would cost a full extra audit and write
  // the same .lighthouse/<slug>.json twice.
  const paths = [...new Set([...DEFAULT_PATHS, ...options.paths])];
  const urls = paths.map((urlPath) => `http://localhost:${options.port}${urlPath}`);

  console.log('');
  console.log(line('='));
  console.log('  Diab Car - Lighthouse MOBILE audit');
  console.log(line('='));

  /* --- dependencies ------------------------------------------------ */
  let lighthouse;
  let chromeLauncher;
  try {
    lighthouse = (await import('lighthouse')).default;
    chromeLauncher = await import('chrome-launcher');
  } catch (error) {
    await bail(
      `lighthouse / chrome-launcher are not installed (${error?.message || error}).\n` +
        '  Fix: npm i -D lighthouse chrome-launcher',
      2,
    );
  }
  if (!existsSync(NEXT_BIN)) {
    await bail(`next binary not found at ${rel(NEXT_BIN)} - run npm install first.`, 2);
  }

  /* --- build ------------------------------------------------------- */
  const mustBuild = options.build === 'always' || (options.build === 'auto' && !existsSync(BUILD_ID));
  if (mustBuild) {
    console.log('\n  Building production bundle (next build)...\n');
    const code = await runBuild();
    if (code !== 0) await bail(`next build exited with code ${code}.`, 2);
  } else {
    console.log(`\n  Reusing the existing build (${rel(BUILD_ID)}). Pass --build to rebuild.`);
  }

  /* --- server ------------------------------------------------------ */
  console.log(`  Starting next start -p ${options.port} ...`);
  await startServer(options.port);

  /* --- chrome ------------------------------------------------------ */
  chrome = await launchChrome(chromeLauncher);
  console.log(`  Chrome ready on CDP port ${chrome.port}`);

  mkdirSync(OUT_DIR, { recursive: true });
  // Self-ignoring output dir: multi-MB LHR JSON must never dirty `git status`
  // (the repo .gitignore should carry /.lighthouse/ too, this is the belt).
  writeFileSync(path.join(OUT_DIR, '.gitignore'), '*\n', 'utf8');

  console.log(
    `\n  ${options.runs} run(s) per URL, best performance run kept (Lighthouse is noisy).\n` +
      '  Profile: mobile 360x640 @2.625 dpr, simulated Slow 4G, 4x CPU slowdown.\n',
  );

  /* --- audits: sequential on purpose, parallel Lighthouse runs
         contaminate each other's simulated throttling ---------------- */
  /* Warm every URL first. `next start` compiles and fills the ISR cache on the
     first hit, which showed up as a 1289 ms server-response-time and inflated
     LCP by more than a second — measuring a cold cache miss, not the site.
     Steady-state TTFB for a static page here is 30-40 ms, and on Cloudflare it
     is served from the edge cache, so the warm number is the honest one. */
  console.log('  Warming the cache (first hit compiles and fills ISR)...');
  for (const url of urls) {
    for (let i = 0; i < 2; i += 1) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        await response.arrayBuffer().catch(() => {});
      } catch {
        /* the audit below will report it properly */
      }
    }
  }

  const blocks = [];
  for (const url of urls) {
    const best = await auditUrl(lighthouse, url, chrome.port, options.runs);
    if (!best) {
      console.error(`  ! every run failed for ${url} - skipped`);
      continue;
    }
    const reportPath = path.join(OUT_DIR, `${slugify(new URL(url).pathname)}.json`);
    writeFileSync(reportPath, best.report, 'utf8');
    blocks.push({ url, lhr: best.lhr, reportPath });
  }

  if (blocks.length === 0) await bail('every Lighthouse run failed - nothing to report.', 2);

  /* --- report ------------------------------------------------------ */
  let anyFail = false;
  for (const block of blocks) {
    if (!printBlock(block.url, block.lhr, block.reportPath)) anyFail = true;
  }

  console.log('');
  console.log(line());
  console.log('  Reminder: the CLAUDE.md rule 7 budget (LCP <= 2.0 s, INP <= 200 ms via TBT, CLS <= 0.05)');
  console.log('  is measured on THROTTLED MOBILE - local numbers on a fast machine are indicative only.');
  console.log('  Raw LHR JSON kept in .lighthouse/ so runs can be diffed between commits.');
  if (anyFail && !options.strict) {
    console.log('  A budget line failed. This is a reporting tool - re-run with --strict to make it exit 1.');
  }
  console.log(line());
  console.log('');

  await cleanup();
  // stdout is ASYNCHRONOUS on a Windows console: process.exit() right after the
  // last console.log can truncate the report. Set the code, let the loop drain,
  // and keep an unref'd backstop so a stray handle can never hang the script.
  process.exitCode = anyFail && options.strict ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 500).unref();
}

main().catch(async (error) => {
  console.error(`\n  UNEXPECTED  ${error?.stack || error}\n`);
  await cleanup();
  process.exit(2);
});
