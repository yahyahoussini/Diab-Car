# CLAUDE.md — Diab Car (diabcar.ma + admin.diabcar.ma)

Car-rental platform for Diab Car, Casablanca (356 bd Zerktouni). Public site in FR/EN/AR/ES + admin fleet-OS. Built prompt by prompt from `docs/PROMPTS.md`; every decision lives in `docs/MASTER-PLAN.md` (read the sections a prompt names before touching code).

## Stack (do not change without a line in the plan)
Next.js 16 App Router · **JavaScript only** (no TypeScript, JSDoc allowed) · Tailwind v4 (`@theme inline` tokens in `src/styles/globals.css`) · next-intl 4 (`src/i18n/routing.js`, messages in `messages/*.json`) · Motion 13 (`motion/react`, LazyMotion strict) · GSAP + ScrollTrigger (homepage desktop only) · react-aria-components (calendar only) · zod 4 · Supabase (Postgres, Auth, Storage, Realtime; SQL in `supabase/migrations`) · Resend (email) · hosting: **Vercel Pro, region `cdg1` (Paris)** — decided by the owner in PROMPT 17, recorded in `docs/MASTER-PLAN.md` §9.1. Keep the code host-agnostic anyway (no host-specific APIs, cron as plain route handlers, `images.unoptimized` with pre-sized variants) so the Cloudflare Workers path stays a config change away.

## Commands
`npm run dev` (http://localhost:3000, demo mode when Supabase env is empty) · `npm run build` · `npm run lint` · `npm run check:contrast` · `npm run check:messages` (4-language parity) · `npm run test` (node:test) · `npm run test:e2e` (Playwright) · `npm run lh` (Lighthouse mobile).

## Non-negotiable rules
1. JavaScript only. No `.ts/.tsx`. Validate inputs with zod at every boundary (server actions, route handlers, forms).
2. Colours only through tokens (`--bg`, `--surface-*`, `--text*`, `--red`, `--red-signal`, `--silver`); never a raw hex in a component. Red ≤ 5% of any screen; never black text on red; red text uses `--red-signal` in dark mode.
3. Every component ships **light + dark + RTL + reduced-motion** before it is done. Logical properties only (`ms-/me-/ps-/pe-`, `start/end`). Arabic is never uppercased or letter-spaced.
4. Pricing law: once dates are known, show price per day **and** total for the dates; breakdown before confirmation; nothing appears later that was not shown earlier. Prices in MAD, tabular numerals.
5. Availability truth is Postgres (exclusion constraints, RPCs). The UI never decides availability. Every DB write goes through an RPC or server action; sensitive writes carry a `reason`.
6. Motion: transforms/opacity/clip-path only; durations from the motion tokens; `prefers-reduced-motion` → static. The hero image is the LCP element and is visible at first paint (never `opacity:0`).
7. Performance budget (Lighthouse mobile, throttled): LCP ≤ 2.0 s, INP ≤ 200 ms, CLS ≤ 0.05, home JS ≤ 160 kB gzipped. Check before every commit that touches the public site.
8. SEO: one URL = one intent; hreflang ×4 + x-default; visible text = structured data; funnel and parametrised results are `noindex`; images named descriptively with localized `alt`.
9. No new dependency without a line in `docs/MASTER-PLAN.md` §5.4/§9. No Node-only native modules at runtime (sharp only in build-time scripts). No `fs` at runtime.
10. Never commit secrets. `.env.local` only. Never run destructive DB commands against production. Ask before deleting files you did not create in the current prompt.
11. Only verifiable facts render on the site (reviews, counts, "since 2013", rating). Unverified = hidden, not invented.
12. Keep the demo adapter (`src/lib/data/demo-adapter.js`) working so `npm run dev` runs with no Supabase.

## Folder map
`src/app/(site)/[locale]/…` public routes · `src/app/(admin)/admin/…` admin routes (served on `admin.diabcar.ma` by `src/proxy.js`) · `src/components/site` · `src/components/admin` · `src/components/ui` (kit) · `src/lib` (auth, data adapters, pricing, seo, format, whatsapp, email) · `src/styles` (globals.css tokens, fonts.js) · `src/assets/fonts` · `messages/{fr,en,ar,es}.json` · `supabase/` (migrations, seed) · `scripts/` (checks, image variants, backups) · `docs/` (plan, prompts, inputs, status).

## Definition of done for every prompt
Build passes · lint passes · `check:contrast` and `check:messages` pass · relevant tests pass · the prompt's own acceptance criteria are demonstrated (paste numbers/outputs in the report) · `docs/STATUS.md` updated · one commit on branch `build/v1` with a conventional message (`feat:`, `fix:`, `chore:`) · a short report: done / not done / decisions / questions for Yahya.
