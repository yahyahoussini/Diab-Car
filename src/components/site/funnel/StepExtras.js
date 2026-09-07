'use client';

import { t as pick } from '@/lib/constants';

/**
 * Step 03 — OPTIONS (plan 4.7).
 *
 * Each extra shows its own price and how it is charged, per day or once for
 * the rental, because "300 MAD" means very different things across a
 * fortnight. The running total comes from /api/quote — the same server-side
 * calculation that will be snapshotted at booking — so the figure here cannot
 * disagree with the one on the confirmation screen (rule 4).
 */
export default function StepExtras({ extras = [], selected = [], onToggle, quote, labels, money, onBack, onNext, disabled }) {
  const active = extras.filter((x) => x.active !== false);
  const days = quote?.quote?.days || 0;

  return (
    <div data-testid="step-extras">
      <h2 className="text-h2 text-text">{labels.optionsTitle}</h2>

      {active.length === 0 ? (
        <p className="mt-6 text-text-2">{labels.optionsNone}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {active.map((x) => {
            const checked = selected.includes(x.key);
            const unit = Number(x.price) || 0;
            const line = x.type === 'per_day' ? unit * (days || 1) : unit;
            return (
              <li key={x.key}>
                <label className="flex cursor-pointer items-start gap-4 border border-border bg-surface-1 p-4 transition-colors hover:border-border-strong">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(x.key)}
                    className="mt-1 h-4 w-4 shrink-0 accent-red"
                    data-extra={x.key}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-meta block font-semibold text-text">{pick(x.name, 'fr') || x.key}</span>
                    <span className="text-meta block text-text-muted">
                      {money(unit)} {x.type === 'per_day' ? labels.perDay : labels.perRental}
                    </span>
                  </span>
                  <span className="text-meta tnum shrink-0 font-semibold text-text">{money(line)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-meta rounded-full border border-border-strong px-5 py-3 font-semibold text-text">
          {labels.back}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled}
          data-testid="extras-next"
          className="text-meta rounded-full bg-red px-6 py-3 font-semibold text-white disabled:bg-surface-3 disabled:text-text-muted"
        >
          {labels.next}
        </button>
      </div>
    </div>
  );
}
