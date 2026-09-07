'use client';

import { useState } from 'react';

/**
 * Tap-to-flip for the vehicle card (plan 4.11: "tap = hover"). Pointer devices
 * crossfade on hover through CSS alone; this only adds the touch path by
 * toggling `data-flipped` on the card, which the same CSS reads. It renders
 * nothing of its own when the card has no rear photo to flip to.
 *
 * Kept deliberately tiny and free of the image manifest, so the only thing
 * that ships to the browser for a card is this toggle.
 */
export default function CarSwap({ enabled, label, className }) {
  const [flipped, setFlipped] = useState(false);
  if (!enabled) return null;
  return (
    <button
      type="button"
      aria-pressed={flipped}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = !flipped;
        setFlipped(next);
        const card = event.currentTarget.closest('[data-vcard]');
        if (card) card.setAttribute('data-flipped', next ? 'true' : 'false');
      }}
      className={className}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 0 1 15.5-6.4M21 12a9 9 0 0 1-15.5 6.4M18 3v4h-4M6 21v-4h4" />
      </svg>
    </button>
  );
}
