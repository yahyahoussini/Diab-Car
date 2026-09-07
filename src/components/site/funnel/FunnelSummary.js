'use client';

/**
 * The summary that follows the customer through all four steps (plan 4.7).
 *
 * It carries `data-car-transition={slug}` on the car image. That attribute is
 * the anchor for WOW 3 (plan 5.2): the same car keeps its
 * `view-transition-name` from results → vehicle page → funnel → confirmation,
 * so it appears to travel into the booking rather than being re-rendered.
 * PROMPT 14 wires the View Transitions API to it; putting the hook in now
 * means that prompt does not have to touch this component's markup.
 *
 * The hold timer lives here because this is the one element on screen at every
 * step. mm:ss in tabular numerals so the width does not jitter as it counts.
 */
export default function FunnelSummary({ quote, vehicleSlug, search, settings, labels, money, msLeft }) {
  const q = quote?.quote;
  const v = quote?.vehicle;

  return (
    <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
      <div className="card p-6" data-testid="funnel-summary">
        <p className="eyebrow">{labels.summaryTitle}</p>

        {vehicleSlug ? (
          <div className="mt-4" data-car-transition={vehicleSlug}>
            {v ? (
              <p className="text-meta font-semibold text-text">
                {v.brand} {v.model}
              </p>
            ) : (
              <p className="text-meta font-semibold text-text-muted">{vehicleSlug}</p>
            )}
          </div>
        ) : null}

        {search.from && search.to ? (
          <p className="text-meta tnum mt-2 text-text-2">
            {shortDate(search.from)} → {shortDate(search.to)}
            {/* With its unit: a bare "4" next to two dates reads as a fourth
                date, not a duration. */}
            {q?.days ? ` · ${labels.days.replace('{n}', String(q.days))}` : ''}
          </p>
        ) : null}

        {/* The hold, counting down. Shown only while one is live. */}
        {msLeft !== null && msLeft !== undefined ? (
          <div className="mt-5 flex items-center gap-2 border-t border-border pt-5" data-testid="hold-timer">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-signal" aria-hidden="true" />
            <span className="text-meta text-text-2">{labels.holdLeft}</span>
            <span className="text-meta tnum ms-auto font-semibold text-text" aria-live="off">
              {mmss(msLeft)}
            </span>
          </div>
        ) : null}

        {q ? (
          <dl className="mt-5 space-y-2 border-t border-border pt-5">
            <Row label={labels.rental} value={money(q.subtotal)} />
            {q.extrasTotal ? <Row label={labels.options} value={money(q.extrasTotal)} /> : null}
            {q.deliveryFee ? <Row label={labels.delivery} value={money(q.deliveryFee)} /> : null}
            {q.oneWayFee ? <Row label={labels.oneWay} value={money(q.oneWayFee)} /> : null}
            {q.discountAmount ? <Row label={labels.discount} value={`− ${money(q.discountAmount)}`} /> : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <dt className="text-meta font-semibold text-text">{labels.total}</dt>
              <dd className="price tnum text-text">{money(q.total)}</dd>
            </div>
            <Row label={labels.deposit} value={money(q.deposit)} muted />
          </dl>
        ) : null}

        <p className="text-meta mt-5 border-t border-border pt-5 text-text-muted">{labels.payment}</p>
      </div>
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-meta ${muted ? 'text-text-muted' : 'text-text-2'}`}>{label}</dt>
      <dd className={`text-meta tnum ${muted ? 'text-text-muted' : 'text-text'}`}>{value}</dd>
    </div>
  );
}

function mmss(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function shortDate(iso) {
  try {
    return new Intl.DateTimeFormat('fr', { day: '2-digit', month: 'short' }).format(new Date(iso)).toUpperCase();
  } catch {
    return '';
  }
}
