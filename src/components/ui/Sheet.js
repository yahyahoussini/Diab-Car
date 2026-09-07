'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * A sheet, not a modal (plan 4.11): it slides from the bottom on mobile and
 * from the reading edge on desktop, so the page behind stays visible and the
 * user never loses their place in the results.
 *
 * Built on <dialog> rather than a hand-rolled overlay, which buys the focus
 * trap, the Escape key, inertness of the background and the top layer from the
 * platform instead of from ~150 lines of JavaScript that would each be a bug.
 *
 * The visual entry is CSS; `prefers-reduced-motion` turns it into an instant
 * appearance without touching this file (see globals.css).
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title: string,
 *   side?: 'bottom'|'end',
 *   children: React.ReactNode,
 *   footer?: React.ReactNode,
 *   labelClose?: string,
 * }} props
 */
export default function Sheet({ open, onClose, title, side = 'bottom', children, footer, labelClose = 'Fermer' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /* Escape and the browser's own close both fire `cancel`/`close`; route them
     back through the caller so React state stays the source of truth. */
  const handleClose = useCallback(() => {
    if (open) onClose();
  }, [open, onClose]);

  /* Clicking the backdrop closes. <dialog> reports backdrop clicks as clicks on
     the dialog itself, so the target check is what separates "outside" from
     "on the panel". */
  const onBackdrop = (event) => {
    if (event.target === ref.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onCancel={handleClose}
      onClick={onBackdrop}
      aria-label={title}
      className={cn(
        'max-h-full max-w-full bg-transparent p-0 text-text backdrop:bg-black/50 backdrop:backdrop-blur-[2px]',
        side === 'bottom'
          ? 'mt-auto mb-0 w-full sm:mx-auto sm:mb-auto sm:mt-auto sm:max-w-lg'
          : 'ms-auto me-0 my-0 h-full',
      )}
    >
      <div
        className={cn(
          'flex flex-col overflow-hidden border border-border bg-surface-1 shadow-2xl',
          side === 'bottom' ? 'max-h-[85dvh] rounded-t-2xl sm:rounded-2xl' : 'h-full w-[min(92vw,26rem)]',
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="text-meta font-semibold text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={labelClose}
            className="-me-2 rounded-full p-2 text-text-2 transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

        {footer ? <footer className="border-t border-border px-5 py-4">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
