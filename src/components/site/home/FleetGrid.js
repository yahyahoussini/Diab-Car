'use client';

import { useEffect, useRef, useState } from 'react';
import { usePurpose } from './purposeStore';
import { matches } from './purposes';

/**
 * Filters the fleet block without refetching anything (plan 4.3 §3).
 *
 * The cards are rendered on the SERVER by FleetSection and passed in as
 * children; this only toggles the `hidden` attribute on their wrappers. That
 * matters: the cards stay in the prerendered HTML, so they are crawlable and
 * work with ISR, and switching a filter costs no network and no re-render of
 * the card tree.
 *
 * Six visible at a time, per plan 4.3.
 *
 * `showingLabel` arrives as a plain template ("{count} sur {total} véhicules")
 * already localized by the server, so the client bundle carries no message
 * catalogue. Only {count} changes here, so a substitution is enough — this key
 * is authored without ICU plurals for exactly that reason.
 *
 * @param {{ children: React.ReactNode, total: number, showingLabel: string }} props
 */
const LIMIT = 6;

export default function FleetGrid({ children, total, showingLabel }) {
  const purpose = usePurpose();
  const ref = useRef(null);
  const [visible, setVisible] = useState(Math.min(LIMIT, total));

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    /* Queried fresh each time rather than cached across renders: the card list
       is owned by the server render, and holding a mutable copy of it is
       exactly what the React compiler (rightly) rejects. It is a handful of
       nodes, so there is nothing to gain by memoising it. */
    let shown = 0;
    for (const el of root.querySelectorAll('[data-vehicle]')) {
      const card = { category: el.dataset.category, seats: Number(el.dataset.seats) || 0 };
      const show = matches(card, purpose) && shown < LIMIT;
      el.hidden = !show;
      if (show) shown += 1;
    }
    setVisible(shown);
  }, [purpose]);

  return (
    <>
      <p data-testid="fleet-count" aria-live="polite" className="text-meta mb-4 text-text-muted">
        {showingLabel.replace('{count}', String(visible)).replace('{total}', String(total))}
      </p>
      <div ref={ref} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </>
  );
}
