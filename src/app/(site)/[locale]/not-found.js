import { getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <section className="container-x flex min-h-[70vh] flex-col items-center justify-center pt-[var(--header-h)] text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-display-2 text-text">{t('title')}</h1>
      <p className="mt-4 max-w-md text-lg text-text-2">{t('text')}</p>
      <div className="mt-8 flex gap-3">
        <Button href="/vehicules">{t('cta')}</Button>
        <Button href="/" variant="secondary">
          {t('home')}
        </Button>
      </div>
    </section>
  );
}
