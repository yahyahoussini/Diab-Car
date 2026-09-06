import { getLocale, getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';
import Magnetic from '@/components/ui/Magnetic';
import Counter from '@/components/ui/Counter';
import HeroTitle, { FadeIn } from '@/components/site/HeroTitle';
import BookingWidget from '@/components/site/BookingWidget';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';
import { WhatsAppIcon } from '@/components/site/icons';

export default async function Hero({ settings, locations, fleetCount = 12 }) {
  const t = await getTranslations('home.hero');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const years = new Date().getFullYear() - (settings?.foundedYear || 2013);

  return (
    <section className="relative overflow-hidden pt-[calc(var(--header-h)+2.5rem)]">
      {/* Backdrop: warm gradient + zellige lattice + gold glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,var(--accent-soft),transparent_60%)]" aria-hidden="true" />
      <div className="absolute inset-0 -z-10 zellige" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" aria-hidden="true" />

      <div className="container-x">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-6">
            <FadeIn delay={0.05}>
              <p className="eyebrow mb-5">{t('eyebrow')}</p>
            </FadeIn>
            <HeroTitle lines={[t('title1'), t('title2')]} className="text-display-1 text-text" />
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl">{t('subtitle')}</p>
            <FadeIn delay={0.6} className="mt-8 flex flex-wrap items-center gap-3">
              <Magnetic>
                <Button href="/vehicules" size="xl">
                  {t('cta')}
                  <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </Button>
              </Magnetic>
              {settings?.whatsapp ? (
                <Button href={whatsappLink(settings.whatsapp, genericMessage(locale))} external variant="secondary" size="xl">
                  <WhatsAppIcon className="h-5 w-5 text-whatsapp" />
                  {t('ctaSecondary')}
                </Button>
              ) : null}
            </FadeIn>
            <FadeIn delay={0.75} className="mt-10 grid max-w-lg grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat value={fleetCount} suffix="+" label={t('stats.fleet')} />
              <Stat value={years} label={t('stats.since')} />
              <Stat text="24/7" label={t('stats.airport')} />
              <Stat value={4} label={t('stats.languages')} />
            </FadeIn>
          </div>

          <div className="relative lg:col-span-6">
            <div className="relative mx-auto max-w-xl">
              <div className="plate arch relative aspect-[4/3] overflow-hidden rounded-b-[var(--radius-card)] border border-border/60">
                <div className="absolute inset-0 zellige opacity-[0.12]" aria-hidden="true" />
                <div className="absolute inset-x-8 bottom-6 top-10 parallax-view">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/cars/suv-premium.svg" alt={tc('categories.premium')} width={800} height={380} className="h-full w-full object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.35)]" fetchPriority="high" decoding="async" />
                </div>
                <div className="absolute bottom-4 start-4 rounded-full border border-border bg-surface-1/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent backdrop-blur rtl:tracking-normal">
                  {tc('verifiedBusiness', { year: settings?.foundedYear || 2013 })}
                </div>
              </div>
              <div className="hairline mx-10 mt-3 h-1.5" aria-hidden="true" />
            </div>
          </div>
        </div>

        <FadeIn delay={0.5} className="relative z-10 mt-12 lg:mt-14">
          <BookingWidget locations={locations} />
        </FadeIn>
      </div>
    </section>
  );
}

function Stat({ value, text, suffix, label }) {
  return (
    <div>
      <div className="font-display text-3xl text-text">{text ? <bdi className="tnum">{text}</bdi> : <Counter value={value} suffix={suffix} />}</div>
      <div className="mt-1 text-xs font-medium text-text-muted">{label}</div>
    </div>
  );
}

