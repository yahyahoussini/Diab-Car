'use client';

import { useState } from 'react';

/**
 * One large review at a time, with an `01 / 05` counter and prev/next
 * (plan 4.3 §7).
 *
 * RTL: the arrows flip, and so does their meaning — "next" always advances
 * toward the reading direction, so in Arabic the left button moves forward
 * (plan 4.12: motion direction reverses).
 *
 * The reviews are already filtered and localized by the server component; this
 * only holds the index.
 *
 * @param {{ items: {id: string, text: string, author: string, meta: string}[], labels: {previous: string, next: string} }} props
 */
export default function ReviewsCarousel({ items, labels }) {
  const [i, setI] = useState(0);
  const total = items.length;
  const go = (delta) => setI((n) => (n + delta + total) % total);
  const pad = (n) => String(n).padStart(2, '0');
  const current = items[i];

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
      }}
    >
      <blockquote aria-live="polite" className="min-h-40">
        <p className="text-h3 text-text">“{current.text}”</p>
        <footer className="text-meta mt-6 text-text-muted">
          <cite className="not-italic">{current.author}</cite>
          {current.meta ? <span> · {current.meta}</span> : null}
        </footer>
      </blockquote>

      {total > 1 ? (
        <div className="mt-8 flex items-center gap-4">
          <span data-testid="reviews-counter" className="text-meta tnum text-text-muted">
            {pad(i + 1)} / {pad(total)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={labels.previous}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-text transition-colors duration-[var(--dur-micro)] hover:border-border-strong hover:bg-surface-2"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M11 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={labels.next}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-text transition-colors duration-[var(--dur-micro)] hover:border-border-strong hover:bg-surface-2"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
