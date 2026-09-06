'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { formatEUR, formatMAD } from '@/lib/format';

const CurrencyContext = createContext({ currency: 'MAD', eurRate: 10.8, toggle: () => {}, setCurrency: () => {} });

export function CurrencyProvider({ eurRate = 10.8, children }) {
  const [currency, setCurrency] = useState('MAD');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('dc-currency');
      if (saved === 'EUR' || saved === 'MAD') setCurrency(saved);
    } catch {}
  }, []);
  const set = useCallback((c) => {
    setCurrency(c);
    try {
      window.localStorage.setItem('dc-currency', c);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.currency = currency;
  }, [currency]);
  const value = useMemo(() => ({ currency, eurRate, setCurrency: set, toggle: () => set(currency === 'MAD' ? 'EUR' : 'MAD') }), [currency, eurRate, set]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function CurrencyToggle({ className }) {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className={className} role="group" aria-label="MAD / EUR">
      <div className="font-latin-sans inline-flex rounded-full border border-border bg-surface-1 p-0.5 text-xs font-semibold">
        {['MAD', 'EUR'].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            aria-pressed={currency === c}
            className={`rounded-full px-2.5 py-1 transition-colors ${currency === c ? 'bg-text text-bg' : 'text-text-muted hover:text-text'}`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
