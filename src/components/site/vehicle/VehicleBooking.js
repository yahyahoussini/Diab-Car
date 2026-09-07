'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import Sheet from '@/components/ui/Sheet';
import { formatMAD } from '@/lib/format';
import { whatsappLink, vehicleInquiryMessage } from '@/lib/whatsapp';
import { cn } from '@/lib/cn';

/**
 * The right column of the vehicle page (plan 4.6): price object, availability
 * for the visitor's dates, the total, and the two ways to book.
 *
 * One component rather than two because the plan puts the price object and the
 * availability block side by side, and both answer the same question — "can I
 * have this car, on these dates, for how much". Splitting them would mean two
 * components fetching the same quote.
 *
 * The dates come from the URL, read on the client. The page itself never
 * touches searchParams, so it stays statically rendered and indexable; the
 * proxy marks parametrised URLs noindex. Same arrangement as the results page.
 *
 * Sold out is a first-class state, not an error: the block then shows the next
 * available date and three real alternatives for the same dates, fetched from
 * the availability API rather than guessed.
 */

const BookingWidget = dynamic(() => import('@/components/site/BookingWidget'), {
  ssr: false,
  loading: () => <div className="silhouette h-64 w-full rounded-xl" aria-hidden="true" />,
});

function subscribeToUrl(onChange) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

export default function VehicleBooking({ vehicle, locations = [], labels, locale, whatsappNumber, bookHref }) {
  const urlSearch = useSyncExternalStore(subscribeToUrl, () => window.location.search, () => '');
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(urlSearch)), [urlSearch]);

  const [override, setOverride] = useState(null);
  const search = override || { from: params.from, to: params.to, pickup: params.pickup, dropoff: params.dropoff };
  const hasDates = Boolean(search.from && search.to);

  /* One state, stamped with the request it answers. `loading` and the current
     quote are DERIVED from it, so the effect never calls setState
     synchronously and a stale answer from a previous set of dates can never be
     shown against the new ones — its stamp simply stops matching. */
  const key = hasDates ? [search.from, search.to, search.pickup || '', search.dropoff || ''].join('|') : '';
  const [result, setResult] = useState(null);
  const fresh = result && result.key === key ? result : null;
  const quote = fresh?.quote ?? null;
  const alternatives = fresh?.alternatives ?? [];
  const loading = Boolean(hasDates) && !fresh;

  const [datesOpen, setDatesOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const openDates = useCallback(() => {
    setEverOpened(true);
    setDatesOpen(true);
  }, []);

  /* ---------------------------------------------------------------- quote */
  useEffect(() => {
    if (!hasDates) return undefined;
    const controller = new AbortController();

    (async () => {
      let nextQuote = null;
      let nextAlternatives = [];

      try {
        const q = new URLSearchParams({ vehicle: vehicle.slug, startAt: search.from, endAt: search.to, locale });
        if (search.pickup) q.set('pickup', search.pickup);
        if (search.dropoff) q.set('dropoff', search.dropoff);

        const res = await fetch(`/api/quote?${q}`, { signal: controller.signal, cache: 'no-store' });
        const json = await res.json();
        if (controller.signal.aborted) return;
        nextQuote = json.ok ? json : null;

        /* Alternatives cost a second request, so they are only fetched when
           the answer is actually "no" (plan 4.6: three cars of the same
           category free for the same dates). */
        if (json.ok && json.availability && !json.availability.available) {
          const a = new URLSearchParams({ startAt: search.from, endAt: search.to, freeOnly: '1' });
          if (search.pickup) a.set('pickup', search.pickup);
          const altRes = await fetch(`/api/availability?${a}`, { signal: controller.signal, cache: 'no-store' });
          const altJson = await altRes.json();
          if (controller.signal.aborted) return;
          nextAlternatives = (altJson.vehicles || [])
            .filter((v) => v.slug !== vehicle.slug && v.category === vehicle.category)
            .sort((x, y) => x.total - y.total)
            .slice(0, 3);
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }

      /* A single write, after the awaits — never synchronous inside the
         effect body. */
      if (!controller.signal.aborted) setResult({ key, quote: nextQuote, alternatives: nextAlternatives });
    })();

    return () => controller.abort();
  }, [hasDates, key, search.from, search.to, search.pickup, search.dropoff, vehicle.slug, vehicle.category, locale]);

  const onSearch = useCallback((query) => {
    setOverride({ from: query.from, to: query.to, pickup: query.pickup, dropoff: query.dropoff });
    setDatesOpen(false);
    /* Reflect it in the URL without navigating, so a refresh or a shared link
       keeps the dates the visitor picked. */
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  }, []);

  const money = (n) => formatMAD(Math.round(Number(n) || 0), locale);
  const available = quote?.availability?.available;
  const perDay = quote?.quote?.perDayEffective ?? vehicle.basePerDay;
  const total = quote?.quote?.total;

  /* The WhatsApp message carries the car, the dates, the place and the price
     the visitor is looking at (plan 4.6). With no online payment, this thread
     IS the confirmation, so the agent must not have to re-quote. */
  const waHref = whatsappNumber
    ? whatsappLink(
        whatsappNumber,
        vehicleInquiryMessage(locale, {
          vehicleName: vehicle.name,
          from: hasDates ? shortDate(search.from, locale) : undefined,
          to: hasDates ? shortDate(search.to, locale) : undefined,
          pickup: quote?.pickup?.label,
          price: total ? money(total) : undefined,
        }),
      )
    : null;

  const href = hasDates ? `${bookHref}${bookHref.includes('?') ? '&' : '?'}${new URLSearchParams({ from: search.from, to: search.to, ...(search.pickup ? { pickup: search.pickup } : {}) })}` : bookHref;

  return (
    <>
      <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
        <div className="card p-6">
          {/* ---- price object ---- */}
          <p className="eyebrow">{labels.pricePerDay}</p>
          <p className="price mt-2 text-text">
            {money(perDay)}
            <span className="text-meta font-normal text-text-muted"> {labels.perDay}</span>
          </p>

          {/* ---- availability block ---- */}
          <div className="mt-6 border-t border-border pt-6" data-testid="availability-block">
            {!hasDates ? (
              <p className="text-meta text-text-2">{labels.chooseDates}</p>
            ) : loading ? (
              <>
                <p className="eyebrow text-text-2">{labels.checking}</p>
                <div className="redline-loading mt-2" role="progressbar" aria-label={labels.checking} />
              </>
            ) : available ? (
              <p className="text-meta flex items-start gap-2 font-semibold text-text" data-state="available">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-signal" aria-hidden="true" />
                {labels.availableForDates.replace('{range}', range(search.from, search.to, locale))}
              </p>
            ) : quote ? (
              <div data-state="unavailable">
                <p className="text-meta flex items-start gap-2 font-semibold text-text">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-text-muted" aria-hidden="true" />
                  {quote.availability.nextAvailableAt
                    ? labels.unavailableUntil.replace('{date}', shortDate(quote.availability.nextAvailableAt, locale))
                    : labels.unavailable}
                </p>

                {alternatives.length ? (
                  <div className="mt-4">
                    <p className="eyebrow">{labels.alternatives}</p>
                    <ul className="mt-3 space-y-2">
                      {alternatives.map((a) => (
                        <li key={a.slug}>
                          <a
                            href={`/${locale}/vehicules/${a.slug}?${new URLSearchParams({ from: search.from, to: search.to })}`}
                            className="text-meta flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-text-2 transition-colors hover:border-border-strong hover:text-text"
                          >
                            <span className="truncate">{a.brand} {a.model}</span>
                            <span className="tnum shrink-0">{money(a.total)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-meta text-text-2">{labels.checkFailed}</p>
            )}
          </div>

          {/* ---- dates + total ---- */}
          <div className="mt-6 border-t border-border pt-6">
            <button
              type="button"
              onClick={openDates}
              data-testid="vehicle-dates"
              className="text-meta flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-start text-text transition-colors hover:border-border-strong"
            >
              <span className="tnum truncate">{hasDates ? range(search.from, search.to, locale) : labels.pickDates}</span>
              <span aria-hidden="true">✎</span>
            </button>

            {total ? (
              <dl className="mt-4 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-meta text-text-2">{labels.totalFor.replace('{days}', String(quote.quote.days))}</dt>
                  <dd className="price tnum text-text">{money(total)}</dd>
                </div>
                {quote.quote.deposit ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-meta text-text-muted">{labels.deposit}</dt>
                    <dd className="text-meta tnum text-text-2">{money(quote.quote.deposit)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          {/* ---- actions ---- */}
          <div className="mt-6 space-y-3">
            <a
              href={href}
              data-testid="vehicle-book"
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[13px] font-semibold',
                available === false ? 'pointer-events-none bg-surface-3 text-text-muted' : 'bg-red text-white',
              )}
              aria-disabled={available === false}
            >
              {labels.book}
              <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>

            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="vehicle-whatsapp"
                className="text-meta flex w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-surface-1 px-5 py-3 font-semibold text-text"
              >
                {labels.whatsapp}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---- mobile sticky bar (plan 4.6 / 4.11) ---- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-1/95 backdrop-blur-md lg:hidden" data-testid="vehicle-mobile-bar">
        <div className="container-x flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="price tnum truncate text-text">
              {money(perDay)}
              <span className="text-meta font-normal text-text-muted"> {labels.perDay}</span>
            </p>
            {total ? <p className="text-meta tnum truncate text-text-2">{money(total)}</p> : null}
          </div>
          {waHref ? (
            <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label={labels.whatsapp} className="shrink-0 rounded-full border border-border-strong p-3 text-text">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.2 1.3-1.9 1.4-.5.1-1.1.1-1.8-.1a13 13 0 0 1-5.6-4.6c-.6-.9-1-1.9-1-2.9 0-.8.4-1.5.9-1.9.2-.2.4-.2.6-.2h.4c.2 0 .4 0 .5.4l.8 1.8c.1.2 0 .4-.1.5l-.4.5c-.1.2-.2.3 0 .6.6 1 1.5 1.8 2.6 2.3.2.1.4.1.5-.1l.6-.7c.1-.2.3-.2.5-.1l1.7.8c.2.1.3.2.3.4v.9Z" />
              </svg>
            </a>
          ) : null}
          <a
            href={href}
            className={cn('shrink-0 rounded-full px-5 py-3 text-[13px] font-semibold', available === false ? 'pointer-events-none bg-surface-3 text-text-muted' : 'bg-red text-white')}
            aria-disabled={available === false}
          >
            {labels.bookShort}
          </a>
        </div>
      </div>

      <Sheet open={datesOpen} onClose={() => setDatesOpen(false)} title={labels.pickDates} labelClose={labels.close}>
        {everOpened ? <BookingWidget locations={locations} compact initial={{ pickup: search.pickup, dropoff: search.dropoff }} onSearch={onSearch} /> : null}
      </Sheet>
    </>
  );
}

function shortDate(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'fr' : locale, { day: '2-digit', month: 'short' }).format(new Date(iso)).toUpperCase();
  } catch {
    return '';
  }
}

function range(from, to, locale) {
  if (!from || !to) return '';
  return `${shortDate(from, locale)} → ${shortDate(to, locale)}`;
}
