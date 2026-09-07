import { getTranslations } from 'next-intl/server';

/**
 * "Comment ça marche" (plan 4.3 §5): four horizontal editorial rows, each with
 * its number, title, one sentence, and a red line that grows on hover.
 *
 * The numbering is real information here — these are ordered steps, not
 * decoration — which is the only reason 01–04 markers are justified.
 *
 * Numbers stay Latin digits in Arabic (plan 4.12); `.text-meta` already drops
 * the uppercasing and letter-spacing under [dir=rtl].
 */
const STEPS = ['choose', 'book', 'collect', 'drive'];

export default async function HowItWorks() {
  const t = await getTranslations('home.how');

  return (
    <section id="how" className="section-y">
      <div className="container-x">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="text-h2 mt-3 text-text">{t('title')}</h2>

        <ol className="mt-10">
          {STEPS.map((key, i) => (
            <li key={key} className="group border-t border-border py-7 last:border-b">
              <div className="grid items-baseline gap-2 lg:grid-cols-12 lg:gap-6">
                <span className="text-meta tnum text-text-muted lg:col-span-1">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-h3 text-text lg:col-span-4">{t(`items.${key}.title`)}</h3>
                <p className="text-text-2 lg:col-span-6 lg:col-start-7">{t(`items.${key}.text`)}</p>
              </div>
              {/* 40 px at rest, full width on hover — the row is the group. */}
              <span className="redline mt-5" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
