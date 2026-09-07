'use client';

import { useVehicleAvailability } from '@/lib/realtime/useVehicleAvailability';
import { cn } from '@/lib/cn';

/**
 * Step 02 — VOITURE (plan 4.7): the results in compact mode.
 *
 * Reuses the availability hook from the results page, so this list is live:
 * if someone takes the last car while the customer is deciding, the count
 * changes under them rather than failing at the end of the form.
 *
 * Selecting does NOT just set state — it asks Postgres for a real 10-minute
 * hold. That call can fail with SOLD_OUT, and the plan 4.13 copy for exactly
 * that moment is rendered here.
 */
export default function StepVehicles({ search, selected, notice, labels, locale, money, onSelect, onChangeDates }) {
  const params = search.from && search.to
    ? { startAt: search.from, endAt: search.to, ...(search.pickup ? { pickup: search.pickup } : {}), freeOnly: '1' }
    : {};

  const { data, loading } = useVehicleAvailability({ params, enabled: Boolean(search.from && search.to) });
  const rows = data?.vehicles || [];

  return (
    <div data-testid="step-vehicles">
      {notice?.kind === 'soldOut' ? (
        <div className="mb-6 border border-red-signal bg-red-soft/40 p-5" role="alert" data-testid="sold-out">
          <p className="text-meta font-semibold text-text">{labels.soldOutTitle}</p>
          <p className="mt-2 text-text-2">{labels.soldOutBody}</p>
        </div>
      ) : null}

      {notice?.kind === 'server' ? (
        <p className="mb-6 text-meta text-text-2" role="alert">
          {labels.errorServer}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="silhouette h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-border bg-surface-1 p-8 text-center">
          <p className="text-text-2">{labels.noCars}</p>
          <button type="button" onClick={onChangeDates} className="text-meta mt-4 rounded-full border border-border-strong px-5 py-3 font-semibold text-text">
            {labels.changeDates}
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((v) => (
            <li key={v.slug}>
              <button
                type="button"
                onClick={() => onSelect(v)}
                data-slug={v.slug}
                className={cn(
                  'flex w-full items-center gap-4 border p-4 text-start transition-colors',
                  selected === v.slug ? 'border-red-signal bg-red-soft/20' : 'border-border bg-surface-1 hover:border-border-strong',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-meta block font-semibold text-text">
                    {v.brand} {v.model}
                  </span>
                  <span className="text-meta block text-text-muted">
                    {[v.transmission, `${v.seats}`, v.fuel].join(' · ')}
                    {v.lastOne ? ` · ${labels.selected}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  {/* Rule 4: per day and the total for these dates, together. */}
                  <span className="price tnum block text-text">{money(v.perDayEffective)}</span>
                  <span className="text-meta tnum block text-text-2">{money(v.total)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onChangeDates} className="text-meta mt-6 font-semibold text-text underline decoration-red-signal underline-offset-4">
        {labels.changeDates}
      </button>
    </div>
  );
}
