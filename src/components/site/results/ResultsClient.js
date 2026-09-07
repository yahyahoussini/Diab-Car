'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import Sheet from '@/components/ui/Sheet';
import { useVehicleAvailability } from '@/lib/realtime/useVehicleAvailability';
import { cn } from '@/lib/cn';
import { formatMAD } from '@/lib/format';
import ResultCard from './ResultCard';
import ResultsFilters from './ResultsFilters';

/**
 * The results page island (plan 4.4).
 *
 * Two modes, one component:
 *
 *   NO DATES — the server-rendered fleet grid stays in the DOM and this only
 *     toggles `hidden` on the wrappers. The page keeps its crawlable content,
 *     ISR still works, and filtering costs no network. Same approach as the
 *     homepage fleet block.
 *
 *   WITH DATES — the server grid is hidden and live cards are rendered from
 *     /api/availability instead. Prices and availability both depend on the
 *     dates, so there is nothing meaningful to reuse from the static markup.
 *
 * URL changes go through history.replaceState, never a navigation: a
 * navigation would re-run the server render, discard the fetched availability
 * and lose the scroll position, for a URL the user can already see updating.
 *
 * All copy arrives as props. Importing next-intl here would pull the whole
 * `fleet` namespace into the client bundle to read a dozen strings.
 */

/**
 * The booking module is the heaviest client component on the site — the
 * react-aria range calendar, two comboboxes, the time chips — and on this page
 * it is only needed once someone opens "✎ Modifier". Loading it eagerly put
 * roughly two seconds of TBT on a page whose whole job is to show results
 * quickly (measured: Lighthouse performance 57 with it, see the report).
 *
 * ssr:false because the sheet is shut on first paint, so there is nothing to
 * render server-side; the chunk is fetched the first time the sheet opens.
 */
const BookingWidget = dynamic(() => import('@/components/site/BookingWidget'), {
  ssr: false,
  loading: () => <div className="silhouette h-64 w-full rounded-xl" aria-hidden="true" />,
});

const FILTER_KEYS = ['category', 'transmission', 'fuel', 'seats', 'maxPrice', 'ac', 'sort'];
const DATE_KEYS = ['from', 'to', 'pickup', 'dropoff'];
const MAX_VISIBLE = 12;

export default function ResultsClient({ children, vehicles = [], photos = {}, locations = [], labels, locale, whatsapp = null }) {
  /* The URL is the source of truth until the user touches something.
     useSyncExternalStore rather than reading location during render: the
     server snapshot is an empty string, so the first client render matches the
     server HTML exactly and there is no hydration mismatch — React then
     re-renders with the real query string as a normal update. It also means
     the browser's back button restores a previous search for free. */
  const urlSearch = useSyncExternalStore(subscribeToUrl, () => window.location.search, () => '');
  const fromUrl = useMemo(() => Object.fromEntries(new URLSearchParams(urlSearch)), [urlSearch]);

  /* Null until the first interaction; after that the user's state wins. */
  const [override, setOverride] = useState(null);
  const filters = override ? override.filters : pick(fromUrl, FILTER_KEYS);
  const search = override ? override.search : pick(fromUrl, DATE_KEYS);
  /* Refs so the setters can seed themselves from whatever is on screen right
     now — on the very first interaction that is the URL, not an empty object,
     and losing the dates the moment a chip is tapped would be a bad bug. */
  const currentRef = useRef({ filters, search });
  useEffect(() => {
    currentRef.current = { filters, search };
  });
  const setFilters = useCallback(
    (next) => setOverride(() => {
      const cur = currentRef.current;
      return { search: cur.search, filters: typeof next === 'function' ? next(cur.filters) : next };
    }),
    [],
  );
  const setSearch = useCallback(
    (next) => setOverride(() => {
      const cur = currentRef.current;
      return { filters: cur.filters, search: typeof next === 'function' ? next(cur.search) : next };
    }),
    [],
  );

  const [modifyOpen, setModifyOpen] = useState(false);
  /* Latches on the first open so the module stays mounted afterwards — state,
     not a ref written during render, which the compiler rightly rejects. */
  const [everOpened, setEverOpened] = useState(false);
  const openModify = useCallback(() => {
    setEverOpened(true);
    setModifyOpen(true);
  }, []);
  const [selected, setSelected] = useState(null);
  const [visible, setVisible] = useState(MAX_VISIBLE);
  const [showUnavailable, setShowUnavailable] = useState(false);

  const hasDates = Boolean(search.from && search.to);

  /* The availability query. Only the fields the API validates — filters are
     applied on the client so changing a chip never costs a round trip. */
  const params = useMemo(() => {
    if (!hasDates) return null;
    return { startAt: search.from, endAt: search.to, pickup: search.pickup || 'agency', ...(search.dropoff ? { dropoff: search.dropoff } : {}) };
  }, [hasDates, search.from, search.to, search.pickup, search.dropoff]);

  const { data, loading, error, live } = useVehicleAvailability({ params: params || {}, enabled: hasDates });

  /* Live rows when we have them, the static fleet otherwise. Shaped the same
     either way so everything downstream is written once. */
  const rows = useMemo(() => {
    if (!hasDates) return vehicles.map((v) => ({ ...v, days: 0, available: true, unitsFree: null, lastOne: false }));
    return data?.vehicles || [];
  }, [hasDates, data, vehicles]);

  const matching = useMemo(() => sortRows(applyFilters(rows, filters), filters.sort), [rows, filters]);
  const availableRows = useMemo(() => matching.filter((v) => v.available), [matching]);
  const unavailableRows = useMemo(() => matching.filter((v) => !v.available), [matching]);

  /* Live chip counts, computed against the current result set so a chip that
     would return nothing says 0 before it is tapped (plan 4.4). */
  const counts = useMemo(() => {
    const base = hasDates ? rows.filter((v) => v.available) : rows;
    const n = (fn) => base.filter(fn).length;
    return {
      all: base.length,
      economy: n((v) => v.category === 'economy'),
      compact: n((v) => v.category === 'compact'),
      suv: n((v) => v.category === 'suv'),
      premium: n((v) => v.category === 'premium'),
      automatic: n((v) => v.transmission === 'automatic'),
      seats7: n((v) => v.seats >= 7),
    };
  }, [rows, hasDates]);

  const priceBounds = useMemo(() => {
    const prices = vehicles.map((v) => Number(v.basePerDay ?? v.pricePerDay) || 0).filter(Boolean);
    return { min: Math.floor(Math.min(...prices, 100) / 50) * 50, max: Math.ceil(Math.max(...prices, 1000) / 50) * 50 };
  }, [vehicles]);

  /* ---------------------------------------------------------------- URL
     Only ONCE the user has changed something. Until then the URL is input, not
     output — and writing it too early was a real bug: on the first client
     render useSyncExternalStore still returns the server snapshot (an empty
     string), so this effect would replaceState the query string away before the
     store had a chance to adopt it, and the page silently forgot the search it
     had just been given. */
  useEffect(() => {
    if (!override) return;
    const q = new URLSearchParams();
    for (const k of DATE_KEYS) if (search[k]) q.set(k, search[k]);
    for (const k of FILTER_KEYS) if (filters[k]) q.set(k, filters[k]);
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', next);
    }
  }, [override, search, filters]);

  /* ---------------------------------------------------------------- counters
     Plan 4.4: the count animates total -> free -> matching, in under 800 ms,
     so the number the user ends on is visibly the result of the search rather
     than a figure that simply appeared. */
  const target = hasDates ? availableRows.length : matching.length;

  /* The animated figure is stamped with the target it belongs to, and `shown`
     is DERIVED from that. Two things fall out: the effect never calls setState
     synchronously (every write happens inside a timer), and a stale animation
     left over from a previous search is ignored automatically because its
     stamp no longer matches — no cleanup setState, no flicker. */
  const [anim, setAnim] = useState(null);
  const shown = anim && anim.forTarget === target ? anim.value : target;
  const timers = useRef([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce || loading || !hasDates) return undefined;

    const total = rows.length;
    const free = rows.filter((v) => v.available).length;
    const steps = [total, free, target].filter((n, i, a) => i === 0 || n !== a[i - 1]);
    if (steps.length <= 1) return undefined;

    const step = Math.min(300, 800 / steps.length);
    steps.forEach((n, i) => {
      timers.current.push(setTimeout(() => setAnim({ forTarget: target, value: n }), i * step));
    });
    return () => timers.current.forEach(clearTimeout);
  }, [target, rows, loading, hasDates]);

  /* ---------------------------------------------------------------- static grid
     With dates, the server-rendered cards are replaced. Without, they are
     filtered in place by toggling `hidden` on their wrappers. */
  const staticRef = useRef(null);
  useEffect(() => {
    const root = staticRef.current;
    if (!root) return;
    if (hasDates) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const keep = new Set(matching.slice(0, visible).map((v) => v.slug));
    for (const el of root.querySelectorAll('[data-vehicle]')) {
      el.hidden = !keep.has(el.dataset.slug);
    }
  }, [hasDates, matching, visible]);

  /* ---------------------------------------------------------------- handlers */
  const onFilterChange = useCallback((patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setVisible(MAX_VISIBLE);
    setSelected(null);
  }, [setFilters]);

  const onReset = useCallback(() => {
    setFilters({});
    setVisible(MAX_VISIBLE);
  }, [setFilters]);

  const onSearch = useCallback((query) => {
    setSearch({ from: query.from, to: query.to, pickup: query.pickup, dropoff: query.dropoff });
    setModifyOpen(false);
    setVisible(MAX_VISIBLE);
    setSelected(null);
  }, [setSearch]);

  const clearDates = useCallback(() => {
    setSearch({});
    setSelected(null);
  }, [setSearch]);

  const hrefFor = (v) => {
    const q = new URLSearchParams();
    for (const k of DATE_KEYS) if (search[k]) q.set(k, search[k]);
    return `/${locale}/vehicules/${v.slug}${q.toString() ? `?${q}` : ''}`;
  };

  /* The site's one money formatter (src/lib/format.js, already tested): narrow
     no-break space grouping and Latin digits in every locale, Arabic included.
     A second implementation here would eventually disagree with the funnel's
     figures, which is exactly the drift rule 4 exists to prevent. */
  const money = useCallback((n) => formatMAD(Math.round(Number(n) || 0), locale), [locale]);

  /* Built here, not on the server: the message must carry the dates the user is
     actually looking at, and the server no longer sees the query string. */
  const whatsappHref = useMemo(() => {
    if (!whatsapp?.base) return null;
    const text = String(whatsapp.template || '')
      .replace('{from}', search.from ? formatRange(search.from, search.from, locale).split(' → ')[0] : '—')
      .replace('{to}', search.to ? formatRange(search.to, search.to, locale).split(' → ')[0] : '—')
      .replace('{place}', locationName(locations, search.pickup, locale) || labels.agency);
    return `${whatsapp.base}${whatsapp.base.includes('?') ? '&' : '?'}text=${encodeURIComponent(text)}`;
  }, [whatsapp, search.from, search.to, search.pickup, locations, locale, labels.agency]);
  const selectedRow = selected ? matching.find((v) => v.slug === selected) : null;
  const days = data?.days || countDays(search.from, search.to);

  return (
    <div data-testid="results">
      {/* ------------------------------------------------ header block */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {hasDates ? (
              <>
                {locationName(locations, search.pickup, locale) || labels.agency}
                <span className="mx-2 text-text-muted" aria-hidden="true">·</span>
                <span className="tnum">{formatRange(search.from, search.to, locale)}</span>
                <span className="mx-2 text-text-muted" aria-hidden="true">·</span>
                <span className="tnum">{labels.days.replace('{n}', String(days))}</span>
              </>
            ) : (
              labels.noDatesEyebrow
            )}
          </p>

          <h1 className="text-display-2 mt-3 text-text" aria-live="polite">
            {hasDates ? (
              <>
                <span className="tnum">{shown}</span> {labels.carsReady}
              </>
            ) : (
              <>
                <span className="tnum">{matching.length}</span> {labels.noDatesTitle}
              </>
            )}
          </h1>
        </div>

        <button
          type="button"
          onClick={openModify}
          data-testid="modify-search"
          className="text-meta inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-1 px-4 py-2 font-semibold text-text transition-colors hover:border-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
        >
          <span aria-hidden="true">✎</span>
          {labels.modify}
        </button>
      </div>

      {/* ------------------------------------------------ status line */}
      {hasDates && loading ? (
        <div className="mt-6" data-testid="checking">
          <p className="eyebrow text-text-2">{labels.checking}</p>
          <div className="redline-loading mt-2" role="progressbar" aria-label={labels.checking} />
        </div>
      ) : null}

      {hasDates && error ? (
        <p className="text-meta mt-6 text-text-2" role="alert">
          {labels.errorLine}
        </p>
      ) : null}

      {/* ------------------------------------------------ filters */}
      <div className="mt-8">
        <ResultsFilters
          filters={filters}
          onChange={onFilterChange}
          onReset={onReset}
          counts={counts}
          labels={labels.filters}
          priceBounds={priceBounds}
          busy={loading}
        />
      </div>

      {/* ------------------------------------------------ results */}
      {/* The cards use <h3>, so without a level-2 between them and the page's
          <h1> the document outline skips a level and axe reports
          `heading-order`. Visually hidden because the count above already says
          this out loud. */}
      <h2 className="sr-only">{hasDates ? labels.carsReady : labels.noDatesTitle}</h2>

      <div className="mt-8 pb-32">
        {/* The server-rendered grid. Present in the HTML for crawlers and for a
            visitor with no JavaScript; hidden once dates arrive. */}
        <div ref={staticRef}>{children}</div>

        {hasDates ? (
          loading && !data ? (
            <SkeletonGrid />
          ) : availableRows.length === 0 && unavailableRows.length === 0 ? (
            <EmptyState labels={labels} onModify={openModify} onClearDates={clearDates} whatsappHref={whatsappHref} />
          ) : (
            <>
              <div
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                data-has-selection={Boolean(selected)}
                data-testid="results-grid"
              >
                {availableRows.slice(0, visible).map((v, i) => (
                  <ResultCard
                    key={v.slug}
                    v={v}
                    photo={photos[v.photoFolder] || null}
                    href={hrefFor(v)}
                    selected={selected === v.slug}
                    onSelect={() => setSelected(selected === v.slug ? null : v.slug)}
                    index={i}
                    stagger={i < MAX_VISIBLE}
                    labels={{ ...labels.card, locale }}
                    money={money}
                  />
                ))}
              </div>

              {availableRows.length > visible ? (
                <div className="mt-10 text-center">
                  <button
                    type="button"
                    onClick={() => setVisible((n) => n + MAX_VISIBLE)}
                    className="text-meta rounded-full border border-border-strong bg-surface-1 px-6 py-3 font-semibold text-text transition-colors hover:border-text"
                  >
                    {labels.showMore.replace('{n}', String(availableRows.length - visible))}
                  </button>
                </div>
              ) : null}

              {availableRows.length === 0 ? (
                <EmptyState labels={labels} onModify={openModify} onClearDates={clearDates} whatsappHref={whatsappHref} />
              ) : null}

              {/* Unavailable cars, collapsed (plan 4.4). Kept on the page rather
                  than dropped: seeing that the Duster exists but is taken until
                  the 13th is more useful than not seeing it at all. */}
              {unavailableRows.length ? (
                <div className="mt-12 border-t border-border pt-6">
                  <button
                    type="button"
                    onClick={() => setShowUnavailable((s) => !s)}
                    aria-expanded={showUnavailable}
                    data-testid="unavailable-toggle"
                    className="text-meta flex w-full items-center justify-between gap-4 text-text-2 hover:text-text"
                  >
                    {labels.unavailableGroup.replace('{n}', String(unavailableRows.length))}
                    <span aria-hidden="true" className={cn('transition-transform', showUnavailable && 'rotate-180')}>▾</span>
                  </button>

                  {showUnavailable ? (
                    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {unavailableRows.map((v, i) => (
                        <ResultCard
                          key={v.slug}
                          v={v}
                          photo={photos[v.photoFolder] || null}
                          href={hrefFor(v)}
                          selected={false}
                          onSelect={openModify}
                          index={i}
                          stagger={false}
                          labels={{ ...labels.card, locale }}
                          money={money}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )
        ) : null}
      </div>

      {/* ------------------------------------------------ selection */}
      {selectedRow ? (
        <div
          data-testid="selection-bar"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-1/95 backdrop-blur-md"
        >
          <div className="container-x flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-meta truncate font-semibold text-text">
                {selectedRow.brand} {selectedRow.model}
              </p>
              <p className="text-meta tnum truncate text-text-2">
                {selectedRow.days
                  ? `${money(selectedRow.perDayEffective)} ${labels.card.perDay} · ${money(selectedRow.total)}`
                  : labels.card.fromPrice.replace('{price}', money(selectedRow.basePerDay))}
              </p>
            </div>
            <a
              href={hrefFor(selectedRow)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-red px-5 py-3 text-[13px] font-semibold text-white"
            >
              {labels.continue}
              <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ modify sheet */}
      <Sheet open={modifyOpen} onClose={() => setModifyOpen(false)} title={labels.modifyTitle} labelClose={labels.filters.close}>
        {/* Mounted only once the sheet has actually been opened. A <dialog>
            renders its children even while closed, so without this gate the
            dynamic import would still be requested on first paint and the
            deferral would buy nothing. */}
        {everOpened ? (
          <BookingWidget locations={locations} compact initial={{ pickup: search.pickup, dropoff: search.dropoff }} onSearch={onSearch} />
        ) : null}
      </Sheet>

      {/* Realtime is an optimisation, not the mechanism — announced only to
          assistive tech so nothing on screen claims a connection it may lose. */}
      <p className="sr-only" aria-live="polite">
        {hasDates && live ? labels.liveOn : ''}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** popstate only — replaceState does not fire it, which is exactly right:
    our own URL rewrites must not feed back in as external changes. */
function subscribeToUrl(onChange) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

function pick(source, keys) {
  const out = {};
  for (const k of keys) if (source[k]) out[k] = String(source[k]);
  return out;
}

function applyFilters(rows, f) {
  return rows.filter((v) => {
    if (f.category && v.category !== f.category) return false;
    if (f.transmission && v.transmission !== f.transmission) return false;
    if (f.fuel && v.fuel !== f.fuel) return false;
    if (f.seats && Number(v.seats) < Number(f.seats)) return false;
    if (f.maxPrice && Number(v.basePerDay ?? v.pricePerDay) > Number(f.maxPrice)) return false;
    if (f.ac === '1' && v.ac === false) return false;
    return true;
  });
}

/** Plan 4.4: Recommandé = availability certainty, then price, then popularity. */
function sortRows(rows, sort) {
  const copy = [...rows];
  const price = (v) => Number(v.basePerDay ?? v.pricePerDay) || 0;
  switch (sort) {
    case 'price_asc':
      return copy.sort((a, b) => price(a) - price(b));
    case 'price_desc':
      return copy.sort((a, b) => price(b) - price(a));
    case 'premium':
      return copy.sort((a, b) => RANK[b.category] - RANK[a.category] || price(b) - price(a));
    default:
      return copy.sort(
        (a, b) =>
          Number(b.available) - Number(a.available) ||
          (b.unitsFree ?? 0) - (a.unitsFree ?? 0) ||
          price(a) - price(b) ||
          (b.popularityScore || 0) - (a.popularityScore || 0),
      );
  }
}

const RANK = { economy: 0, compact: 1, sedan: 2, van: 2, suv: 3, premium: 4, luxury: 5 };

function SkeletonGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true" data-testid="skeletons">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="silhouette aspect-[16/10] w-full" />
          <div className="space-y-3 p-5">
            <div className="silhouette h-4 w-2/3 rounded" />
            <div className="silhouette h-3 w-1/2 rounded" />
            <div className="silhouette h-6 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Plan 4.13: "PAS DE VOITURE. POUR L'INSTANT." plus the three actions. */
function EmptyState({ labels, onModify, onClearDates, whatsappHref }) {
  return (
    <div className="border border-border bg-surface-1 p-10 text-center" data-testid="empty-state">
      <p className="text-h2 text-text">{labels.emptyTitle}</p>
      <p className="mt-4 text-text-2">{labels.emptyBody}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onModify} className="text-meta rounded-full bg-red px-5 py-3 font-semibold text-white">
          {labels.emptyModify}
        </button>
        <button type="button" onClick={onClearDates} className="text-meta rounded-full border border-border-strong bg-surface-1 px-5 py-3 font-semibold text-text">
          {labels.emptyPlace}
        </button>
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="text-meta rounded-full border border-border-strong bg-surface-1 px-5 py-3 font-semibold text-text">
            {labels.emptyWhatsapp}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function formatRange(from, to, locale) {
  try {
    const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'fr' : locale, { day: '2-digit', month: 'short' });
    return `${fmt.format(new Date(from)).toUpperCase()} → ${fmt.format(new Date(to)).toUpperCase()}`;
  } catch {
    return '';
  }
}

function countDays(from, to) {
  if (!from || !to) return 0;
  const ms = Date.parse(to) - Date.parse(from);
  return ms > 0 ? Math.max(1, Math.ceil((ms - 3600000) / 86400000)) : 0;
}

function locationName(locations, key, locale) {
  const l = locations.find((x) => x.key === key || x.slug === key);
  return l?.name?.[locale] || l?.name?.fr || null;
}
