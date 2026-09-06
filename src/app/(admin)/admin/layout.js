import { NextIntlClientProvider } from 'next-intl';
import { fontClassNames } from '@/styles/fonts';
import '@/styles/globals.css';
import ThemeProvider from '@/components/site/ThemeProvider';
import AdminShell from '@/components/admin/AdminShell';
import { getAdminBase, getAdminSession } from '@/lib/auth/server';
import { logout } from '@/lib/actions/auth';
import { dataMode } from '@/lib/data';
import { SITE_URL } from '@/lib/seo';
import frMessages from '../../../../messages/fr.json';

export const metadata = {
  title: { default: 'Administration — Diab Car', template: '%s · Admin Diab Car' },
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#080808' },
  ],
};

export default async function AdminLayout({ children }) {
  const [session, base] = await Promise.all([getAdminSession(), getAdminBase()]);
  return (
    <html lang="fr" dir="ltr" className={fontClassNames} suppressHydrationWarning>
      <body className="bg-bg text-text">
        <ThemeProvider>
          <NextIntlClientProvider locale="fr" messages={{ common: frMessages.common }} timeZone="Africa/Casablanca">
            {session ? (
              <AdminShell base={base} session={session} mode={dataMode()} siteUrl={SITE_URL} logoutAction={logout}>
                {children}
              </AdminShell>
            ) : (
              children
            )}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
