'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { holdVehicle, releaseHold } from '@/lib/actions/availability';
import { formatMAD } from '@/lib/format';
import { cn } from '@/lib/cn';
import StepVehicles from './StepVehicles';
import StepExtras from './StepExtras';
import StepCustomer from './StepCustomer';
import FunnelSummary from './FunnelSummary';

/**
 * The 4-step booking funnel (plan 4.7). One route, four steps.
 *
 * WHERE STATE LIVES, AND WHY IT IS SPLIT
 * --------------------------------------
 * URL            step, dates, place, car, chosen extras.
 *                Shareable, restorable, and back/forward works.
 * sessionStorage the hold, and the customer's name, phone and e-mail.
 *
 * The split is not a convenience. Personal data must never enter a URL: URLs
 * end up in browser history, in the Referer header of every third-party
 * request the page makes, in analytics, and in screenshots people send to
 * support. Plan 9.4 and Loi 09-08 both point the same way — collect the
 * minimum and do not spread it around. So the funnel restores completely on
 * reload without a phone number ever appearing in the address bar.
 *
 * The hold is the other half of the honesty here: selecting a car takes a real
 * 10-minute claim in Postgres, the timer counts that claim down, and when it
 * expires the funnel says so instead of letting someone fill in a form for a
 * car they no longer have (plan 4.13).
 */

const STORAGE_KEY = 'dc_funnel';
const STEPS = ['s1', 's2', 's3', 's4'];
/* One frozen empty object, so the memo above has a stable fallback. */
const EMPTY = Object.freeze({});

const BookingWidget = dynamic(() => import('@/components/site/BookingWidget'), {
  ssr: false,
  loading: () => <div className="silhouette h-72 w-full rounded-xl" aria-hidden="true" />,
});

/* useSyncExternalStore needs a subscribe function; sessionStorage never
   changes underneath us, so this one never fires. Its value is that the read
   happens during render with a SERVER snapshot of null — no setState in an
   effect, and no hydration mismatch. */
const noSubscribe = () => () => {};
const readRaw = () => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

function writeSession(patch) {
  try {
    const current = (() => {
      try {
        return JSON.parse(readRaw() || '{}');
      } catch {
        return {};
      }
    })();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* Private mode: the funnel still works, it just will not survive a reload. */
  }
}

export default function Funnel({ locations = [], extras = [], settings = {}, labels, locale, turnstileSiteKey = null, initial = {} }) {
  /* ---------------------------------------------------------------- state */
  const [step, setStep] = useState(() => clampStep(initial.step));
  const [search, setSearch] = useState(() => ({ from: initial.from || '', to: initial.to || '', pickup: initial.pickup || '', dropoff: initial.dropoff || '' }));
  const [vehicleSlug, setVehicleSlug] = useState(initial.vehicle || '');
  const [extraKeys, setExtraKeys] = useState(() => (initial.extras ? String(initial.extras).split(',').filter(Boolean) : []));
  const [notice, setNotice] = useState(null);

  /* The private half, restored from sessionStorage during render rather than
     in an effect. The server snapshot is null, so the first client render
     matches the SSR output and React then re-renders with the real value —
     the same arrangement the results page uses for the URL. */
  const restored = useSyncExternalStore(noSubscribe, () => true, () => false);
  const sessionRaw = useSyncExternalStore(noSubscribe, readRaw, () => null);
  const saved = useMemo(() => {
    try {
      return JSON.parse(sessionRaw || '{}');
    } catch {
      return {};
    }
  }, [sessionRaw]);

  /* `undefined` means "nothing chosen this session yet", so the stored value
     still wins; null is a real, deliberate "no hold". */
  const [holdOverride, setHoldOverride] = useState(undefined);
  const [customerOverride, setCustomerOverride] = useState(undefined);
  const hold = holdOverride !== undefined ? holdOverride : saved.hold || null;
  /* Memoised: the `|| {}` fallback would otherwise mint a new object on every
     render and re-run the persist effect forever. */
  const customer = useMemo(
    () => (customerOverride !== undefined ? customerOverride : saved.customer || EMPTY),
    [customerOverride, saved.customer],
  );
  const setHold = setHoldOverride;
  const setCustomer = setCustomerOverride;

  const hasDates = Boolean(search.from && search.to);

  /* Mirror the shareable half into the URL, without navigating. */
  useEffect(() => {
    if (!restored) return;
    const q = new URLSearchParams();
    q.set('step', String(step));
    for (const k of ['from', 'to', 'pickup', 'dropoff']) if (search[k]) q.set(k, search[k]);
    if (vehicleSlug) q.set('vehicle', vehicleSlug);
    if (extraKeys.length) q.set('extras', extraKeys.join(','));
    const next = `${window.location.pathname}?${q}`;
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, '', next);
  }, [restored, step, search, vehicleSlug, extraKeys]);

  useEffect(() => {
    /* Only persist what this session actually changed — writing the restored
       value straight back would be a no-op that still churns storage. */
    if (holdOverride !== undefined || customerOverride !== undefined) {
      writeSession({ hold, customer });
    }
  }, [holdOverride, customerOverride, hold, customer]);

  /* ---------------------------------------------------------------- hold */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hold?.expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hold?.expiresAt]);

  const msLeft = hold?.expiresAt ? Date.parse(hold.expiresAt) - now : 0;
  const holdExpired = Boolean(hold) && msLeft <= 0;

  const takeHold = useCallback(
    async (slug, vehicleId) => {
      setNotice(null);
      const res = await holdVehicle({ vehicleId, startAt: search.from, endAt: search.to });

      if (!res?.ok) {
        if (res?.error === 'SOLD_OUT') {
          setNotice({ kind: 'soldOut', alternatives: res.alternatives || [] });
          return false;
        }
        setNotice({ kind: 'server' });
        return false;
      }

      setVehicleSlug(slug);
      setHold({ id: res.hold.id, expiresAt: res.hold.expiresAt, slug });
      setNow(Date.now());
      return true;
    },
    [search.from, search.to, setHold],
  );

  const holdId = hold?.id || null;
  const dropHold = useCallback(async () => {
    if (holdId) await releaseHold({ holdId }).catch(() => {});
    setHold(null);
  }, [holdId, setHold]);

  /* Going back to pick another car gives the current one back immediately —
     otherwise a browsing customer silently holds two cars at once. */
  const goToStep = useCallback(
    async (next) => {
      if (next <= 2 && hold) await dropHold();
      setStep(clampStep(next));
      setNotice(null);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [hold, dropHold],
  );

  const onSearch = useCallback((query) => {
    setSearch({ from: query.from, to: query.to, pickup: query.pickup, dropoff: query.dropoff });
    setVehicleSlug('');
    setHold(null);
    setStep(2);
  }, [setHold]);

  const money = useCallback((n) => formatMAD(Math.round(Number(n) || 0), locale), [locale]);

  /* ---------------------------------------------------------------- quote
     Owned here so the summary and step 3 always show the same figure, and so
     step 4 submits the number the customer actually saw (rule 4). */
  const [quote, setQuote] = useState(null);
  const quoteKey = useMemo(
    () => (hasDates && vehicleSlug ? [vehicleSlug, search.from, search.to, search.pickup || '', search.dropoff || '', extraKeys.join(',')].join('|') : ''),
    [hasDates, vehicleSlug, search, extraKeys],
  );

  useEffect(() => {
    if (!quoteKey) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const q = new URLSearchParams({ vehicle: vehicleSlug, startAt: search.from, endAt: search.to, locale });
        if (search.pickup) q.set('pickup', search.pickup);
        if (search.dropoff) q.set('dropoff', search.dropoff);
        for (const k of extraKeys) q.append('extras', k);
        const res = await fetch(`/api/quote?${q}`, { signal: controller.signal, cache: 'no-store' });
        const json = await res.json();
        if (!controller.signal.aborted) setQuote(json.ok ? { key: quoteKey, ...json } : null);
      } catch (e) {
        if (e?.name !== 'AbortError') setQuote(null);
      }
    })();
    return () => controller.abort();
  }, [quoteKey, vehicleSlug, search, extraKeys, locale]);

  const liveQuote = quote && quote.key === quoteKey ? quote : null;

  /* ---------------------------------------------------------------- render */
  return (
    <div data-testid="funnel">
      <Stepper step={step} labels={labels} onGo={goToStep} />

      {holdExpired ? (
        <div className="mt-8 border border-red-signal bg-red-soft/40 p-6" role="alert" data-testid="hold-expired">
          <p className="text-meta font-semibold text-text">{labels.holdExpired}</p>
          <p className="mt-2 text-text-2">{labels.holdExpiredBody}</p>
          <button
            type="button"
            onClick={() => goToStep(2)}
            className="text-meta mt-4 rounded-full bg-red px-5 py-3 font-semibold text-white"
          >
            {labels.recheck}
          </button>
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {step === 1 ? (
            <BookingWidget locations={locations} initial={{ pickup: search.pickup, dropoff: search.dropoff }} onSearch={onSearch} />
          ) : null}

          {step === 2 ? (
            <StepVehicles
              search={search}
              selected={vehicleSlug}
              notice={notice}
              labels={labels}
              locale={locale}
              money={money}
              onSelect={async (row) => {
                const ok = await takeHold(row.slug, row.vehicleId);
                if (ok) setStep(3);
              }}
              onChangeDates={() => goToStep(1)}
            />
          ) : null}

          {step === 3 ? (
            <StepExtras
              extras={extras}
              selected={extraKeys}
              onToggle={(key) => setExtraKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]))}
              quote={liveQuote}
              labels={labels}
              money={money}
              onBack={() => goToStep(2)}
              onNext={() => goToStep(4)}
              disabled={holdExpired}
            />
          ) : null}

          {step === 4 ? (
            <StepCustomer
              search={search}
              vehicleSlug={vehicleSlug}
              extraKeys={extraKeys}
              holdId={hold?.id || null}
              quote={liveQuote}
              customer={customer}
              onCustomerChange={setCustomer}
              settings={settings}
              labels={labels}
              locale={locale}
              money={money}
              turnstileSiteKey={turnstileSiteKey}
              isAirport={isAirport(locations, search.pickup)}
              onBack={() => goToStep(3)}
              disabled={holdExpired}
            />
          ) : null}
        </div>

        <aside className="lg:col-span-5">
          <FunnelSummary
            quote={liveQuote}
            vehicleSlug={vehicleSlug}
            search={search}
            settings={settings}
            labels={labels}
            money={money}
            msLeft={hold && !holdExpired ? msLeft : null}
          />
        </aside>
      </div>
    </div>
  );
}

function clampStep(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.floor(n) : 1;
}

function isAirport(locations, key) {
  const l = locations.find((x) => x.key === key || x.slug === key);
  return l?.kind === 'airport';
}

/** `01 RECHERCHE ── 02 VOITURE ── 03 OPTIONS ── 04 CONFIRMATION` (plan 4.7). */
function Stepper({ step, labels, onGo }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="stepper">
      {STEPS.map((key, i) => {
        const n = i + 1;
        const current = n === step;
        const done = n < step;
        return (
          <li key={key} className="flex items-center gap-3">
            <button
              type="button"
              /* Only backwards: a step you have not reached cannot be jumped
                 to, because the data it needs does not exist yet. */
              disabled={n >= step}
              onClick={() => onGo(n)}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'text-meta font-semibold transition-colors',
                current ? 'text-red-signal' : done ? 'text-text hover:underline' : 'text-text-muted',
              )}
            >
              <span className="tnum">{String(n).padStart(2, '0')}</span> {labels.steps[key]}
            </button>
            {n < 4 ? <span className="hidden h-px w-8 bg-border sm:block" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
