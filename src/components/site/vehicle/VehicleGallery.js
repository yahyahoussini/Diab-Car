'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * The vehicle gallery (plan 4.6 / 5.3): a large lead image with three
 * thumbnails, an EXTÉRIEUR | INTÉRIEUR toggle that switches through a circular
 * mask, and a full-screen viewer with swipe, arrow keys and Escape.
 *
 * WHAT IT DOES NOT DO, DELIBERATELY
 * ---------------------------------
 * The pipeline currently holds one angle per car — `front` — so today there is
 * no interior set and no thumbnail strip. Rather than render an empty
 * INTÉRIEUR tab and three grey boxes, the toggle appears only when interior
 * photos exist and the strip only when there is more than one image. The same
 * rule the rest of the site follows: unverified is hidden, not invented
 * (CLAUDE.md rule 11). Drop side/rear/interior/dash into
 * docs/inputs/photos/<slug>/ and both appear with no code change.
 *
 * Images arrive as plain records from the server ({ widths, width, height,
 * src, alt }) — the photo manifest must not reach the browser.
 *
 * @param {{
 *   exterior: object[], interior: object[],
 *   labels: { exterior:string, interior:string, open:string, close:string,
 *             previous:string, next:string, counter:string },
 *   priority?: boolean,
 * }} props
 */
export default function VehicleGallery({ exterior = [], interior = [], labels, priority = false }) {
  const [tab, setTab] = useState('exterior');
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const hasInterior = interior.length > 0;
  const shots = tab === 'interior' && hasInterior ? interior : exterior;
  const current = shots[Math.min(index, shots.length - 1)] || null;

  const dialogRef = useRef(null);
  const touchX = useRef(null);

  const go = useCallback(
    (delta) => setIndex((i) => (shots.length ? (i + delta + shots.length) % shots.length : 0)),
    [shots.length],
  );

  const switchTab = useCallback((next) => {
    setTab(next);
    setIndex(0);
  }, []);

  /* Fullscreen uses <dialog> for the same reasons the Sheet does: focus trap,
     Escape and top-layer come from the platform. */
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (fullscreen && !el.open) el.showModal();
    if (!fullscreen && el.open) el.close();
  }, [fullscreen]);

  /* Arrow keys work in the viewer; Escape is handled by <dialog> itself. */
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, go]);

  if (!current) return null;

  return (
    <div>
      {/* ---- toggle: only when there is something on the other side ---- */}
      {hasInterior ? (
        <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-border bg-surface-1 p-1" role="tablist" aria-label={labels.exterior}>
          {[
            ['exterior', labels.exterior],
            ['interior', labels.interior],
          ].map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={cn(
                'text-meta rounded-full px-4 py-1.5 font-semibold transition-colors',
                tab === key ? 'bg-text text-bg' : 'text-text-2 hover:text-text',
              )}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}

      {/* ---- lead image ---- */}
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        data-cursor="DRAG"
        aria-label={labels.open}
        className="chamfer group relative block w-full overflow-hidden bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
      >
        {/* keyed on tab+index so React remounts it and the iris animation
            replays on every switch */}
        <Shot key={`${tab}-${index}`} shot={current} priority={priority} className="gallery-iris aspect-[16/10] w-full" sizes="(min-width: 1024px) 66vw, 100vw" />
      </button>

      {/* ---- thumbnails: only when there is more than one ---- */}
      {shots.length > 1 ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {shots.slice(1, 4).map((s, i) => (
            <button
              key={s.src}
              type="button"
              onClick={() => setIndex(i + 1)}
              aria-label={s.alt}
              className={cn(
                'chamfer relative overflow-hidden bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal',
                index === i + 1 && 'outline-2 outline-offset-2 outline-red-signal',
              )}
            >
              <Shot shot={s} className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 22vw, 33vw" />
            </button>
          ))}
        </div>
      ) : null}

      {/* ---- fullscreen viewer ---- */}
      <dialog
        ref={dialogRef}
        onClose={() => setFullscreen(false)}
        onCancel={() => setFullscreen(false)}
        aria-label={labels.open}
        className="gallery-fullscreen h-full max-h-full w-full max-w-full p-0 backdrop:bg-black/80"
      >
        <div
          className="relative flex h-full w-full items-center justify-center p-4"
          onTouchStart={(e) => {
            touchX.current = e.changedTouches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            /* 48 px so a vertical scroll is not mistaken for a swipe. */
            if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
        >
          <Shot shot={current} className="max-h-[85dvh] w-auto max-w-full" sizes="100vw" contain />

          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label={labels.close}
            className="absolute end-4 top-4 rounded-full bg-surface-1/90 p-3 text-text"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {shots.length > 1 ? (
            <>
              <NavButton side="start" label={labels.previous} onClick={() => go(-1)} />
              <NavButton side="end" label={labels.next} onClick={() => go(1)} />
              <p className="text-meta tnum absolute bottom-4 start-1/2 -translate-x-1/2 rounded-full bg-surface-1/90 px-3 py-1 text-text">
                {labels.counter.replace('{i}', String(index + 1)).replace('{n}', String(shots.length))}
              </p>
            </>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}

/** Arrows flip with the reading direction (plan 4.12). */
function NavButton({ side, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn('absolute top-1/2 -translate-y-1/2 rounded-full bg-surface-1/90 p-3 text-text', side === 'start' ? 'start-4' : 'end-4')}
    >
      <svg viewBox="0 0 24 24" className={cn('h-5 w-5 rtl:-scale-x-100', side === 'start' && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/**
 * A <picture> built from the compact record the server sent. Same reasoning as
 * the results card: the manifest stays on the server.
 */
function Shot({ shot, className, sizes, priority = false, contain = false }) {
  const largest = shot.widths[shot.widths.length - 1];
  return (
    <picture className={cn('block', className)}>
      <source type="image/avif" srcSet={shot.widths.map((w) => `${shot.src}-${w}.avif ${w}w`).join(', ')} sizes={sizes} />
      <source type="image/webp" srcSet={shot.widths.map((w) => `${shot.src}-${w}.webp ${w}w`).join(', ')} sizes={sizes} />
      <img
        src={`${shot.src}-${largest}.webp`}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={cn('h-full w-full', contain ? 'object-contain' : 'object-cover')}
      />
    </picture>
  );
}
