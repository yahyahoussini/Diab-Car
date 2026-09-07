import { getTranslations } from 'next-intl/server';
import MoroccoMap from './MoroccoMap';
import { CITIES, splitDuration } from './moroccoRoutes';

/**
 * "Drive Morocco" (plan 4.3 §8). The section name stays in English in every
 * locale — it is the section's proper noun, as the plan writes it.
 *
 * Everything localizable is resolved here on the server and handed to the
 * client island as plain strings, so the map ships no message catalogue.
 * Numbers stay Latin digits in Arabic (plan 4.12).
 */
export default async function DriveMorocco() {
  const t = await getTranslations('home.drive');
  const tc = await getTranslations('home.drive.cities');

  const labels = { mapAlt: t('mapAlt') };
  for (const c of CITIES) labels[c.key] = tc(c.key);

  /* Every row is resolved to a plain string here. A function prop cannot
     cross the server -> client boundary, so the island receives data only. */
  const rows = {};
  for (const c of CITIES) {
    if (c.home) continue;
    const { hours, minutes } = splitDuration(c.minutes);
    const duration = hours > 0
      ? t('duration', { hours: String(hours), minutes: String(minutes).padStart(2, '0') })
      : t('durationMinutes', { minutes: String(minutes) });
    rows[c.key] = t('row', { km: new Intl.NumberFormat('en-US').format(c.km), duration });
  }

  return (
    <section id="drive" className="section-y">
      <div className="container-x">
        <p className="eyebrow">Drive Morocco</p>
        <h2 className="text-h2 mt-3 text-text">{t('title')}</h2>
        <p className="mt-4 max-w-2xl text-text-2">{t('intro')}</p>

        <div className="mt-12">
          <MoroccoMap labels={labels} rows={rows} approxLabel={t('approx')} />
        </div>
      </div>
    </section>
  );
}
