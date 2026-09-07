import { getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';
import VehicleCard from '@/components/site/VehicleCard';
import PurposeTiles from './PurposeTiles';
import FleetGrid from './FleetGrid';
import { PURPOSES } from './purposes';

/**
 * Purpose tiles + the fleet block (plan 4.3 §2 and §3).
 *
 * Every published vehicle is rendered here on the server; FleetGrid shows six
 * and hides the rest. That is deliberate — the cards stay in the HTML for
 * crawlers and the purpose filter costs no network round-trip.
 *
 * No `availability` is passed: without dates there is no truthful state to
 * show, and the UI never invents one (CLAUDE.md rule 5).
 *
 * @param {{ vehicles: object[] }} props
 */
export default async function FleetSection({ vehicles = [] }) {
  const t = await getTranslations('home.fleet');
  const tp = await getTranslations('home.purpose');

  const published = vehicles
    .filter((v) => v.published !== false)
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.sortOrder || 0) - (b.sortOrder || 0));

  return (
    <section id="flotte" className="section-y">
      <div className="container-x">
        <p className="eyebrow">{tp('eyebrow')}</p>
        <h2 className="text-h2 mt-3 text-text">{tp('title')}</h2>
        <p className="mt-4 max-w-2xl text-text-2">{tp('subtitle')}</p>

        <div className="mt-8">
          <PurposeTiles tiles={PURPOSES.map(({ key }) => ({ key, title: tp(`${key}.title`), text: tp(`${key}.text`) }))} />
        </div>

        <div className="mt-14">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h3 className="text-h2 mt-3 text-text">{t('title')}</h3>
        </div>

        <div className="mt-8">
          <FleetGrid total={published.length} showingLabel={t.raw('showing')}>
            {published.map((v, i) => (
              <div key={v.id} data-vehicle="" data-category={v.category} data-seats={v.seats} hidden={i >= 6 ? true : undefined}>
                {/* The first three are above the fold on desktop; the rest lazy-load. */}
                <VehicleCard vehicle={v} fleet={published} priority={i < 3} className="h-full" />
              </div>
            ))}
          </FleetGrid>
        </div>

        <div className="mt-10">
          <Button href="/vehicules" size="lg">
            {t('viewAll', { count: published.length })}
            <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </section>
  );
}
