'use client';

import { setPurpose, usePurpose } from './purposeStore';
import { cn } from '@/lib/cn';

/**
 * "Choisir par usage" — five tiles (plan 4.3 §2). Each sets the fleet filter
 * and scrolls to the fleet block; tapping the active tile clears it.
 *
 * Real <button aria-pressed> elements, so the state is announced and the whole
 * row is keyboard-operable without any extra handling.
 *
 * Strings arrive as props, already localized by the server. That keeps the
 * whole `home` namespace (6.6 kB of section prose) out of the client bundle
 * for the sake of ten labels.
 *
 * @param {{ tiles: {key: string, title: string, text: string}[] }} props
 */
export default function PurposeTiles({ tiles }) {
  const active = usePurpose();

  function choose(key) {
    setPurpose(key);
    const fleet = document.getElementById('flotte');
    if (!fleet) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    fleet.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map(({ key, title, text }) => {
        const on = active === key;
        return (
          <li key={key}>
            <button
              type="button"
              data-testid={`purpose-${key}`}
              aria-pressed={on}
              onClick={() => choose(key)}
              className={cn(
                'group flex h-full w-full flex-col items-start gap-2 rounded-[var(--radius-card)] border p-4 text-start transition-colors duration-[var(--dur-micro)] ease-[var(--ease-out)] min-h-24',
                on ? 'border-red-signal bg-red-soft' : 'border-border bg-surface-1 hover:border-border-strong',
              )}
            >
              <span className="text-meta text-text">{title}</span>
              <span className="text-[13px] leading-snug text-text-2">{text}</span>
              <span
                className="redline mt-auto"
                style={{ '--redline-rest': '0px' }}
                data-active={on ? '' : undefined}
                aria-hidden="true"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
