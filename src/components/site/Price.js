import { formatEUR, formatMAD } from '@/lib/format';

/**
 * MAD amount with a server-rendered EUR approximation that CSS reveals when the
 * visitor toggles EUR (html[data-currency="EUR"]). No hydration cost.
 */
export function Price({ amount, className, eurClassName, suffix, locale = 'fr', eurRate = 10.8 }) {
  const eurBlock = eurClassName?.includes('block');
  return (
    <span className={className}>
      <bdi className="tnum">{formatMAD(amount, locale)}</bdi>
      {suffix ? <span className="text-text-muted"> {suffix}</span> : null}
      <span className={`price-eur ${eurBlock ? 'block' : ''} ${eurClassName || 'ms-1.5 text-[0.75em] font-normal text-text-muted'}`}>
        ≈ <bdi className="tnum">{formatEUR(amount, eurRate, locale)}</bdi>
      </span>
    </span>
  );
}
export default Price;
