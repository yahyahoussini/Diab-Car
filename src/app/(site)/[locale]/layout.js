import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, rtlLocales } from '@/i18n/routing';
import { pickMessages } from '@/i18n/client-messages';
import { fontClassNames } from '@/styles/fonts';
import '@/styles/globals.css';
import ThemeProvider from '@/components/site/ThemeProvider';
import MotionProvider from '@/components/site/MotionProvider';
import { CurrencyProvider } from '@/components/site/CurrencyProvider';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import WhatsAppFab from '@/components/site/WhatsAppFab';
import CookieBanner from '@/components/site/CookieBanner';
import JsonLd from '@/components/site/JsonLd';
import { getSettings } from '@/lib/data';
import { SITE_URL, businessJsonLd } from '@/lib/seo';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f3ec' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0b09' },
  ],
};

export async function generateMetadata({ params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'seo' });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('home.title'), template: '%s' },
    description: t('home.description'),
    applicationName: 'Diab Car',
    manifest: '/manifest.webmanifest',
    icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' },
    formatDetection: { telephone: true, email: true, address: true },
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const [messages, settings] = await Promise.all([getMessages(), getSettings()]);
  const dir = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  const tc = await getTranslations('common');

  return (
    <html lang={locale} dir={dir} className={fontClassNames} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-bg text-text">
        <ThemeProvider>
          <NextIntlClientProvider messages={pickMessages(messages)}>
            <MotionProvider>
              <CurrencyProvider eurRate={settings?.eurRate || 10.8}>
                <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent-fill focus:px-4 focus:py-2 focus:text-on-accent">
                  {tc('skipToContent')}
                </a>
                <Header phone={settings?.phonePrimary} whatsapp={settings?.whatsapp} transparent />
                <main id="main" className="flex-1">
                  {children}
                </main>
                <Footer settings={settings} />
                <WhatsAppFab number={settings?.whatsapp} />
                <CookieBanner gaId={settings?.gaId || process.env.NEXT_PUBLIC_GA_ID} />
              </CurrencyProvider>
            </MotionProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
        <JsonLd data={businessJsonLd(settings, locale)} />
      </body>
    </html>
  );
}
