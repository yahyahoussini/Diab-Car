'use client';

import { useState } from 'react';
import Sheet from '@/components/ui/Sheet';
import { cn } from '@/lib/cn';

/**
 * Chip row + "FILTRES +" sheet + sort (plan 4.4).
 *
 * The quick chips deliberately mix two kinds of filter — four categories plus
 * transmission and seats — because that is how people actually narrow a fleet
 * ("an automatic", "something for seven"), not because the data model groups
 * them that way. Each chip therefore carries its own patch rather than being
 * driven by a single field.
 *
 * Counts next to each chip are live: they are computed against the CURRENT
 * result set, so a chip that would return nothing says 0 before it is tapped
 * rather than after (plan 4.4, "counts update live").
 *
 * @param {{
 *   filters: object, onChange: (patch:object) => void, onReset: () => void,
 *   counts: Record<string, number>, labels: Record<string, any>,
 *   priceBounds: {min:number, max:number}, busy: boolean,
 * }} props
 */
export default function ResultsFilters({ filters, onChange, onReset, counts, labels, priceBounds, busy }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const chips = [
    { id: 'all', label: labels.all, active: !filters.category && !filters.transmission && !filters.seats, patch: { category: '', transmission: '', seats: '' } },
    { id: 'economy', label: labels.categories.economy, active: filters.category === 'economy', patch: { category: filters.category === 'economy' ? '' : 'economy' } },
    { id: 'compact', label: labels.categories.compact, active: filters.category === 'compact', patch: { category: filters.category === 'compact' ? '' : 'compact' } },
    { id: 'suv', label: labels.categories.suv, active: filters.category === 'suv', patch: { category: filters.category === 'suv' ? '' : 'suv' } },
    { id: 'premium', label: labels.categories.premium, active: filters.category === 'premium', patch: { category: filters.category === 'premium' ? '' : 'premium' } },
    { id: 'automatic', label: labels.automatic, active: filters.transmission === 'automatic', patch: { transmission: filters.transmission === 'automatic' ? '' : 'automatic' } },
    { id: 'seats7', label: labels.sevenSeats, active: filters.seats === '7', patch: { seats: filters.seats === '7' ? '' : '7' } },
  ];

  /* Active filters as removable chips (plan 4.4). Built from the filter object
     so a filter set in the sheet appears here without a second registry. */
  const active = [];
  const push = (key, text, patch) => active.push({ key, text, patch });
  if (filters.category) push('category', labels.categories[filters.category] || filters.category, { category: '' });
  if (filters.transmission) push('transmission', labels[`transmission_${filters.transmission}`], { transmission: '' });
  if (filters.fuel) push('fuel', labels[`fuel_${filters.fuel}`], { fuel: '' });
  if (filters.seats) push('seats', labels.seatsMin.replace('{n}', filters.seats), { seats: '' });
  if (filters.maxPrice) push('maxPrice', `≤ ${filters.maxPrice} MAD`, { maxPrice: '' });
  if (filters.ac === '1') push('ac', labels.ac, { ac: '' });

  return (
    <div aria-busy={busy}>
      <div className="-mx-5 overflow-x-auto px-5 pb-1 scrollbar-none">
        <div className="flex items-center gap-2">
          {chips.map((c) => (
            <Chip key={c.id} active={c.active} onClick={() => onChange(c.patch)}>
              {c.label}
              {counts[c.id] !== undefined ? (
                /* The count has to dim against whichever ground the chip is
                   currently on. `text-text-muted` on the ACTIVE chip's near-black
                   fill measured 3.45:1 — below AA. On the active chip it is the
                   chip's own foreground at 70%, which stays legible. */
                <span className={cn('tnum', c.active ? 'text-bg/70' : 'text-text-muted')}>{counts[c.id]}</span>
              ) : null}
            </Chip>
          ))}

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-surface-1 px-4 py-2 text-[13px] font-semibold text-text transition-colors hover:border-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
          >
            {labels.moreFilters}
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {active.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onChange(a.patch)}
            className="text-meta inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-text-2 transition-colors hover:text-text"
          >
            {a.text}
            <span aria-hidden="true">×</span>
            <span className="sr-only">{labels.remove}</span>
          </button>
        ))}
        {active.length ? (
          <button type="button" onClick={onReset} className="text-meta font-semibold text-text underline decoration-red-signal underline-offset-4">
            {labels.reset}
          </button>
        ) : null}

        <label className="text-meta ms-auto flex items-center gap-2 text-text-muted">
          <span className="sr-only sm:not-sr-only">{labels.sort}</span>
          <select
            value={filters.sort || 'recommended'}
            onChange={(e) => onChange({ sort: e.target.value === 'recommended' ? '' : e.target.value })}
            className="rounded-full border border-border bg-surface-1 px-3 py-1.5 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
          >
            {['recommended', 'price_asc', 'price_desc', 'premium'].map((s) => (
              <option key={s} value={s}>
                {labels.sortOptions[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={labels.moreFilters} labelClose={labels.close} side="bottom">
        <div className="space-y-6">
          <Field label={labels.maxPriceLabel}>
            {/* A range input, not a two-handle slider: the useful question here
                is "no more than X per day", and one handle is operable with a
                keyboard and a screen reader without extra work. */}
            <input
              type="range"
              min={priceBounds.min}
              max={priceBounds.max}
              step={50}
              value={filters.maxPrice || priceBounds.max}
              onChange={(e) => onChange({ maxPrice: Number(e.target.value) >= priceBounds.max ? '' : e.target.value })}
              className="w-full accent-red"
            />
            <p className="text-meta mt-2 tnum text-text-2">
              {filters.maxPrice ? `≤ ${filters.maxPrice} MAD` : labels.anyPrice}
            </p>
          </Field>

          <Field label={labels.transmission}>
            <Radios
              value={filters.transmission}
              onChange={(v) => onChange({ transmission: v })}
              options={[['', labels.any], ['automatic', labels.transmission_automatic], ['manual', labels.transmission_manual]]}
            />
          </Field>

          <Field label={labels.fuel}>
            <Radios
              value={filters.fuel}
              onChange={(v) => onChange({ fuel: v })}
              options={[['', labels.any], ['petrol', labels.fuel_petrol], ['diesel', labels.fuel_diesel], ['hybrid', labels.fuel_hybrid]]}
            />
          </Field>

          <Field label={labels.seats}>
            <Radios
              value={filters.seats}
              onChange={(v) => onChange({ seats: v })}
              options={[['', labels.any], ['5', labels.seatsMin.replace('{n}', '5')], ['7', labels.seatsMin.replace('{n}', '7')]]}
            />
          </Field>

          <Field label={labels.comfort}>
            <label className="text-meta flex items-center gap-3 text-text-2">
              <input
                type="checkbox"
                checked={filters.ac === '1'}
                onChange={(e) => onChange({ ac: e.target.checked ? '1' : '' })}
                className="h-4 w-4 accent-red"
              />
              {labels.ac}
            </label>
          </Field>
        </div>
      </Sheet>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="eyebrow mb-3">{label}</p>
      {children}
    </div>
  );
}

function Radios({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, text]) => (
        <button
          key={v || 'any'}
          type="button"
          aria-pressed={(value || '') === v}
          onClick={() => onChange(v)}
          className={cn(
            'text-meta rounded-full border px-4 py-2 transition-colors',
            (value || '') === v ? 'border-text bg-text text-bg' : 'border-border bg-surface-1 text-text-2 hover:border-border-strong hover:text-text',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal',
        active ? 'border-text bg-text text-bg' : 'border-border bg-surface-1 text-text-2 hover:border-border-strong hover:text-text',
      )}
      {...props}
    >
      {children}
    </button>
  );
}
