'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live availability for the results list and the vehicle page (plan 6.4).
 *
 * WHAT THE BROWSER SUBSCRIBES TO, AND WHY IT IS NOT `holds` / `reservations`
 * -------------------------------------------------------------------------
 * Plan 6.4 says the pages subscribe to postgres_changes on `holds` and
 * `reservations`. Supabase Realtime honours RLS, which means delivering those
 * rows to a visitor requires an anon SELECT policy on those tables — and any
 * policy permissive enough to deliver the row also delivers `customer_id`, the
 * travel dates and the stored `quote`. That is precisely the leak plan 9.4 and
 * CLAUDE.md rule 5 exist to prevent, and no amount of client-side discarding
 * fixes it: the payload has already crossed the wire.
 *
 * So the browser subscribes to `availability_ping` instead — a table with two
 * columns, `vehicle_id` and `updated_at`, written by a trigger on holds,
 * reservations and blocks (supabase/migrations/0008). It carries no dates, no
 * prices, no customer and no unit. It says "something about this car moved",
 * and the page then re-asks /api/availability, which remains the single place
 * that decides what a visitor is allowed to know.
 *
 * `realtime.broadcast_changes()` was the alternative. It keeps the payload
 * private too, but it needs a policy on `realtime.messages` and a recent
 * realtime extension, and it fails silently on a project where either is
 * missing. A plain table with an RLS policy behaves the same on every project
 * and can be inspected with a SELECT when something looks wrong.
 *
 * The subscription is an optimisation, not the mechanism. A 30-second poll runs
 * regardless, so the page stays correct with realtime disabled, blocked by a
 * proxy, or dropped on a flaky connection.
 *
 * @param {{ params: URLSearchParams|object, vehicleId?: string, enabled?: boolean, pollMs?: number }} options
 * @returns {{ data: object|null, error: string|null, loading: boolean, refetch: () => void, live: boolean }}
 */
export function useVehicleAvailability({ params, vehicleId = null, enabled = true, pollMs = 30_000 } = {}) {
  /* One piece of state, tagged with the query it answers.
     `loading` is DERIVED from it rather than being its own setState in an
     effect — which also means a background poll for the same query refreshes
     the numbers without flashing the whole list back to a skeleton. */
  const [result, setResult] = useState(null); // { query, json, error }
  const [live, setLive] = useState(false);

  const query = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params || {}).toString();

  const queryRef = useRef(query);
  /* Written in an effect, never during render: the debounce timer and the
     realtime callback need the latest query without either of them becoming a
     dependency that tears down and re-subscribes the channel. This effect is
     declared first so it has already run by the time the fetch effect below
     fires for a new query. */
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchNow = useCallback(async () => {
    const q = queryRef.current;
    if (!enabled || !q) return;

    /* One request in flight at a time: a burst of pings must not produce a
       burst of fetches whose responses land out of order. */
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/availability?${q}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      const json = await res.json();
      if (controller.signal.aborted) return;
      setResult(!res.ok || !json.ok ? { query: q, json: null, error: json?.error || 'server' } : { query: q, json, error: null });
    } catch (e) {
      if (e?.name !== 'AbortError') setResult({ query: q, json: null, error: 'network' });
    }
  }, [enabled]);

  /** Coalesce a flurry of pings into one refetch. */
  const schedule = useCallback(
    (delay = 400) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchNow, delay);
    },
    [fetchNow],
  );

  /* Fetch on mount and whenever the dates or filters change. No setState here:
     `loading` falls out of comparing the answered query with the current one. */
  useEffect(() => {
    if (!enabled) return undefined;
    fetchNow();
    return () => abortRef.current?.abort();
  }, [enabled, query, fetchNow]);

  /* Poll. This is the floor: it runs whether or not realtime connects. */
  useEffect(() => {
    if (!enabled || !pollMs) return undefined;
    const id = setInterval(fetchNow, pollMs);
    return () => clearInterval(id);
  }, [enabled, pollMs, fetchNow]);

  /* Refetch when the tab comes back — a page left open for an hour is stale
     in a way no poll interval can excuse. */
  useEffect(() => {
    if (!enabled) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule(0);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, schedule]);

  /* Realtime. Everything here is best-effort: any failure leaves the poll in
     charge, and `live` reports honestly whether the subscription is up. */
  useEffect(() => {
    if (!enabled) return undefined;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return undefined;

    let channel;
    let client;
    let cancelled = false;

    (async () => {
      try {
        const { createBrowserSupabase } = await import('@/lib/supabase/client');
        if (cancelled) return;
        client = createBrowserSupabase();

        channel = client
          .channel(vehicleId ? `availability:${vehicleId}` : 'availability:list')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'availability_ping',
              ...(vehicleId ? { filter: `vehicle_id=eq.${vehicleId}` } : {}),
            },
            () => schedule(),
          )
          .subscribe((status) => {
            if (cancelled) return;
            setLive(status === 'SUBSCRIBED');
            /* On reconnect, catch up on whatever was missed while away. */
            if (status === 'SUBSCRIBED') schedule(0);
          });
      } catch {
        setLive(false);
      }
    })();

    return () => {
      cancelled = true;
      setLive(false);
      clearTimeout(debounceRef.current);
      try {
        if (channel && client) client.removeChannel(channel);
      } catch {
        /* Already torn down. */
      }
    };
  }, [enabled, vehicleId, schedule]);

  return {
    data: result?.json ?? null,
    error: result?.error ?? null,
    /* True until the answer on hand is the answer to the question being asked. */
    loading: Boolean(enabled && query) && result?.query !== query,
    live,
    refetch: fetchNow,
  };
}

export default useVehicleAvailability;
