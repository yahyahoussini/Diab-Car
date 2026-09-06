'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GoogleAnalytics } from '@next/third-parties/google';

const KEY = 'dc-consent';

/** Consent-gated GA4. Nothing loads before the visitor accepts. */
export default function CookieBanner({ gaId }) {
  const t = useTranslations('cookie');
  const [state, setState] = useState('unknown');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      setState(saved === 'accepted' || saved === 'declined' ? saved : 'ask');
    } catch {
      setState('ask');
    }
  }, []);

  function decide(value) {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {}
    setState(value);
  }

  if (!gaId) return null;
  return (
    <>
      {state === 'accepted' ? <GoogleAnalytics gaId={gaId} /> : null}
      {state === 'ask' ? (
        <div role="dialog" aria-live="polite" className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl rounded-2xl border border-border bg-surface-1 p-4 shadow-float sm:inset-x-auto sm:start-6 sm:bottom-6">
          <p className="text-sm text-text-2">{t('text')}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => decide('accepted')} className="bg-red text-on-red transition-colors duration-[var(--dur-micro)] hover:bg-red-hover rounded-full px-4 py-2 text-sm font-semibold">
              {t('accept')}
            </button>
            <button type="button" onClick={() => decide('declined')} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-2 hover:text-text">
              {t('decline')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
