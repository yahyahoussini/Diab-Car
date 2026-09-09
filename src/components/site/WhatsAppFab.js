'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import Magnetic from '@/components/ui/Magnetic';
import { WhatsAppIcon } from '@/components/site/icons';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

/** Floating WhatsApp button on content pages (hidden on the booking flow). */
export default function WhatsAppFab({ number }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const pathname = usePathname();
  /* The /reservation funnel it used to hide behind was removed with the old
     booking flow; only the vehicle page still has its own WhatsApp button. */
  if (!number || pathname.startsWith('/vehicules/')) return null;
  /* Magnetic (plan 5.3): within reach the button leans <= 8 px toward the
     pointer and springs back. It is the wrapper that is fixed, because the
     magnet works by translating its own element — leaving `fixed` on the
     anchor would fight the transform. Desktop fine pointers only, and inert
     under reduced motion; Magnetic decides both. */
  return (
    <Magnetic className="fixed bottom-5 end-5 z-30 lg:bottom-7 lg:end-7">
      <a
        href={whatsappLink(number, genericMessage(locale))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('whatsapp')}
        data-cursor="whatsapp"
        className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-on-whatsapp shadow-[0_12px_32px_-8px_rgba(37,211,102,0.8)] transition-transform hover:scale-105 active:scale-95"
      >
        <WhatsAppIcon className="h-7 w-7" />
        <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-whatsapp/40 [animation-duration:2.4s]" aria-hidden="true" />
      </a>
    </Magnetic>
  );
}
