'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { CITIES, GUIDE_CITIES, GUIDE_SLUG } from './moroccoRoutes';
import { cn } from '@/lib/cn';

/**
 * Drive Morocco (plan 4.3 §8): a simplified silhouette of Morocco with the
 * cities marked, and a list beside it showing distance and drive time from
 * Casablanca.
 *
 * Two decisions worth stating:
 *
 * 1. The interactive controls are a real <ul> of <button>s NEXT TO the map,
 *    not hit areas inside the SVG. Buttons in an SVG need foreignObject to be
 *    reliably focusable and announced; a plain list is keyboard- and
 *    screen-reader-correct for free, and the map just reflects the state.
 *
 * 2. The map itself is wrapped in dir="ltr" and never mirrored. RTL flips
 *    layout, not geography — a mirrored Morocco would put the Atlantic on the
 *    wrong side (plan 4.12 mirrors UI, not maps).
 *
 * @param {{ labels: Record<string,string>, rows: Record<string,string>, approxLabel: string }} props
 */
export default function MoroccoMap({ labels, rows, approxLabel }) {
  const [active, setActive] = useState(null);
  const home = CITIES.find((c) => c.home);
  const current = CITIES.find((c) => c.key === active) || null;

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
      {/* ---- the map: geography, so never mirrored ---- */}
      <div dir="ltr" className="lg:col-span-5">
        <svg viewBox="0 0 400 520" className="h-auto w-full max-w-md" role="img" aria-label={labels.mapAlt}>
          {/* Simplified outline: Mediterranean edge, Atlantic coast down past
              Agadir, the southern line, and the eastern border. Recognisable,
              not cartographic. */}
          <path
            d="M168 46 209 58 246 74 271 96 300 112 327 137 344 166 356 199 344 214 318 219 300 236
               286 262 268 288 246 316 226 348 205 380 186 410 168 438 150 462 130 480 108 470
               96 444 92 412 84 380 72 350 60 318 52 288 44 258 40 228 48 200 62 172 84 146
               106 122 128 96 146 68 Z"
            className="text-surface-2 dark:text-surface-3"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1"
          />

          {/* Faint routes from Casablanca. */}
          <g className="text-text-muted" opacity="0.3">
            {CITIES.filter((c) => !c.home).map((c) => (
              <line
                key={c.key}
                x1={home.x}
                y1={home.y}
                x2={c.x}
                y2={c.y}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 4"
                opacity={active === c.key ? 1 : 0.5}
              />
            ))}
          </g>

          {CITIES.map((c) => (
            <g key={c.key}>
              {c.home ? <circle cx={c.x} cy={c.y} r="11" className="text-red-signal" fill="currentColor" opacity="0.25" /> : null}
              <circle
                cx={c.x}
                cy={c.y}
                r={c.home ? 6 : active === c.key ? 6 : 4}
                className={c.home || active === c.key ? 'text-red-signal' : 'text-text-muted'}
                fill="currentColor"
              >
                <title>{labels[c.key]}</title>
              </circle>
            </g>
          ))}
        </svg>
      </div>

      {/* ---- the list: this is what people actually operate ---- */}
      <div className="lg:col-span-6 lg:col-start-7">
        <ul className="divide-y divide-border border-y border-border">
          {CITIES.filter((c) => !c.home).map((c) => {
            const on = active === c.key;
            const row = (
              <>
                <span className="text-h3 text-text">{labels[c.key]}</span>
                <span className="text-meta tnum text-text-2">{rows[c.key]}</span>
              </>
            );
            return (
              <li key={c.key}>
                {GUIDE_CITIES.has(c.key) ? (
                  <Link
                    href={{ pathname: '/blog/[slug]', params: { slug: GUIDE_SLUG } }}
                    onMouseEnter={() => setActive(c.key)}
                    onFocus={() => setActive(c.key)}
                    onMouseLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      'flex min-h-14 w-full items-baseline justify-between gap-4 px-1 py-4 text-start transition-colors duration-[var(--dur-micro)]',
                      on && 'bg-surface-1',
                    )}
                  >
                    {row}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-pressed={on}
                    onMouseEnter={() => setActive(c.key)}
                    onFocus={() => setActive(c.key)}
                    onMouseLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(on ? null : c.key)}
                    className={cn(
                      'flex min-h-14 w-full items-baseline justify-between gap-4 px-1 py-4 text-start transition-colors duration-[var(--dur-micro)]',
                      on && 'bg-surface-1',
                    )}
                  >
                    {row}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-meta mt-4 text-text-muted">{approxLabel}</p>
      </div>
    </div>
  );
}
