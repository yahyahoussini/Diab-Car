'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * The opener for the per-car booking sheet.
 *
 * Deliberately almost nothing: this button ships with every vehicle card, and
 * the sheet behind it pulls react-aria's calendar and @internationalized/date.
 * `mounted` is what keeps that chunk out of the page until somebody actually
 * intends to book — `open` alone would have React render the sheet closed, and
 * the import would land on first paint of the fleet grid (rule 7, home JS
 * ≤ 160 kB gzipped).
 */
const QuickBooking = dynamic(() => import('./QuickBooking'), { ssr: false });

export default function QuickBookButton({ vehicle, locations, extras, settings, locale = 'fr', labels, className, variant = 'primary', children }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-label={labels.openAria?.replace('{car}', `${vehicle.brand} ${vehicle.model}`)}
        data-testid="quickbook-open"
        data-slug={vehicle.slug}
        className={cn(
          'text-meta inline-flex items-center justify-center rounded-full px-5 py-3 font-semibold transition-colors',
          variant === 'primary' ? 'bg-red text-on-red hover:bg-red-hover' : 'border border-border-strong text-text hover:border-red-signal',
          className,
        )}
      >
        {children || labels.open}
      </button>

      {mounted ? (
        <QuickBooking
          open={open}
          onClose={() => setOpen(false)}
          vehicle={vehicle}
          locations={locations}
          extras={extras}
          settings={settings}
          locale={locale}
          labels={labels}
        />
      ) : null}
    </>
  );
}
