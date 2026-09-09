'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';

/* The pop-up carries a calendar, a catalogue and a server action, and most
   visitors never open one. It is fetched on the first click instead of riding
   along with every fleet page (rule 7: the home budget is 160 kB gzipped). */
const BookingModal = dynamic(() => import('./BookingModal'));

/**
 * « Réserver » — one per car (owner's specification, Sept 2026).
 *
 * It takes the car and nothing else. The delivery destinations and the extra
 * options are read from the database when the pop-up opens, so this button can
 * sit on any card anywhere without its page having to fetch a catalogue it will
 * usually not need.
 *
 * The modal stays mounted after the first open so a customer who closes it to
 * re-read the page does not lose the dates they had already chosen.
 */
export default function ReserveButton({ vehicle, whatsappNumber = null, size = 'lg', variant = 'primary', className }) {
  const t = useTranslations('booking');
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        data-testid="reserve-button"
        aria-haspopup="dialog"
        aria-label={t('openAria', { car: vehicle.name })}
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
      >
        {t('open')}
      </Button>

      {everOpened ? (
        <BookingModal open={open} onClose={() => setOpen(false)} vehicle={vehicle} whatsappNumber={whatsappNumber} />
      ) : null}
    </>
  );
}
