import { getLocale, getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';
import { WhatsAppIcon } from '@/components/site/icons';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

/**
 * The closing band (plan 4.3 §10): PRÊT À PRENDRE LA ROUTE ? plus the two ways
 * to actually book — online, or WhatsApp (the agency's own two channels).
 *
 * The band is black in BOTH themes. That is done by putting the `dark` class on
 * the section so the BLACKLINE dark tokens apply inside it — the same trick the
 * mobile menu uses — rather than writing hexes (CLAUDE.md rule 2).
 *
 * @param {{ settings: object }} props
 */
export default async function CtaBand({ settings }) {
  const t = await getTranslations('home.cta');
  const locale = await getLocale();
  const whatsapp = settings?.whatsapp;

  return (
    <section id="cta" className="dark bg-bg text-text">
      <div className="container-x section-y">
        <h2 className="text-display-2 max-w-3xl text-text">{t('title')}</h2>
        <p className="mt-6 max-w-xl text-text-2">{t('text')}</p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button href="/vehicules" size="xl">
            {t('primary')}
            <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Button>
          {whatsapp ? (
            <Button href={whatsappLink(whatsapp, genericMessage(locale))} external variant="whatsapp" size="xl">
              <WhatsAppIcon className="h-5 w-5" />
              {t('secondary')}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
