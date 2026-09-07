'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { submitBooking } from '@/lib/actions/booking';
import { cn } from '@/lib/cn';

/**
 * Step 04 — CONFIRMATION (plan 4.7): who you are, what it costs, and consent.
 *
 * Three things here are deliberate rather than incidental:
 *
 *   PAYMENT is a LINE, not a choice. Diab Car takes nothing online (plan 9.5),
 *   so there is no gateway, no card field and no radio group — just the fact,
 *   stated before the customer commits.
 *
 *   CONSENT is unchecked and separate from the submit button. Loi 09-08 / CNDP
 *   wants an affirmative act, and a pre-ticked box is not one. The receipt
 *   number is shown when settings carry it and simply omitted when they do not
 *   — an invented declaration number would be worse than none (rule 11).
 *
 *   TURNSTILE renders only when a site key exists. The server decides whether
 *   the token was required; this component never pretends to be the gate.
 */
export default function StepCustomer({
  search,
  vehicleSlug,
  extraKeys,
  holdId,
  quote,
  customer,
  onCustomerChange,
  settings,
  labels,
  locale,
  money,
  turnstileSiteKey,
  isAirport,
  onBack,
  disabled,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [consent, setConsent] = useState(false);

  const set = (patch) => onCustomerChange({ ...customer, ...patch });

  /* ---- Turnstile ---- */
  const widgetRef = useRef(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!turnstileSiteKey || !widgetRef.current) return undefined;
    let id;
    const render = () => {
      if (!window.turnstile || !widgetRef.current) return;
      id = window.turnstile.render(widgetRef.current, { sitekey: turnstileSiteKey, callback: setToken, 'error-callback': () => setToken('') });
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      try {
        if (id && window.turnstile) window.turnstile.remove(id);
      } catch {
        /* already gone */
      }
    };
  }, [turnstileSiteKey]);

  async function onSubmit(event) {
    event.preventDefault();
    setGlobalError('');
    setErrors({});

    const [d, t] = splitIso(search.from);
    const [d2, t2] = splitIso(search.to);

    const result = await submitBooking({
      vehicle: vehicleSlug,
      from: d,
      ft: t,
      to: d2,
      tt: t2,
      pickup: search.pickup || 'agency',
      dropoff: search.dropoff || search.pickup || 'agency',
      flightNumber: isAirport ? customer.flight || '' : '',
      extras: extraKeys,
      name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      phone: customer.phone || '',
      email: customer.email || '',
      country: customer.country || 'MA',
      age: Number(customer.age) || 25,
      notes: customer.notes || '',
      consent: consent,
      locale,
      holdId: holdId || undefined,
      turnstileToken: token || undefined,
    });

    if (result?.ok) {
      /* Hand the confirmation everything it needs, through sessionStorage.
         It could not read the reservation instead: `reservations` is staff-only
         under RLS (0005), and opening an anonymous read path — even one keyed
         by reference — would let anyone who guesses a DC- code see a
         customer's dates and phone. Plan 9.4 says collect the minimum and do
         not spread it around; this keeps the database closed. */
      try {
        window.sessionStorage.setItem(
          'dc_last_booking',
          JSON.stringify({
            reference: result.reference,
            vehicleName: quote?.vehicle ? `${quote.vehicle.brand} ${quote.vehicle.model}` : vehicleSlug,
            slug: vehicleSlug,
            from: search.from,
            to: search.to,
            pickupLabel: quote?.pickup?.label || '',
            dropoffLabel: quote?.dropoff?.label || '',
            total: q?.total ?? null,
            deposit: q?.deposit ?? null,
            days: q?.days ?? null,
            at: new Date().toISOString(),
          }),
        );
      } catch {
        /* Private mode: the confirmation falls back to its "not found" state,
           which still offers WhatsApp with the reference. */
      }
      startTransition(() => router.push({ pathname: '/reservation/confirmation', query: { ref: result.reference } }));
      return;
    }

    if (result?.error === 'validation') setErrors(result.fieldErrors || {});
    else if (result?.error === 'captcha') setGlobalError(labels.errorCaptcha);
    else if (result?.error === 'sold_out') setGlobalError(labels.errorSoldOut);
    else setGlobalError(labels.errorServer);
  }

  const q = quote?.quote;
  const receipt = settings?.cndpReceipt;

  return (
    <form onSubmit={onSubmit} noValidate data-testid="step-customer">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.firstName} error={errors.name}>
          <input required value={customer.firstName || ''} onChange={(e) => set({ firstName: e.target.value })} autoComplete="given-name" className={input} data-testid="first-name" />
        </Field>
        <Field label={labels.lastName} error={errors.name}>
          <input required value={customer.lastName || ''} onChange={(e) => set({ lastName: e.target.value })} autoComplete="family-name" className={input} data-testid="last-name" />
        </Field>

        <Field label="Téléphone" error={errors.phone} className="sm:col-span-2">
          {/* Morocco is the default country because that is who rents here;
              an international number is still accepted by the pattern. */}
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="+212 6 12 34 56 78"
            value={customer.phone || ''}
            onChange={(e) => set({ phone: e.target.value })}
            autoComplete="tel"
            className={cn(input, 'font-latin-sans')}
            data-testid="phone"
          />
          <label className="text-meta mt-2 flex items-center gap-2 text-text-2">
            <input type="checkbox" checked={sameWhatsapp} onChange={(e) => setSameWhatsapp(e.target.checked)} className="h-4 w-4 accent-red" />
            {labels.whatsappCheckbox}
          </label>
        </Field>

        <Field label="E-mail" error={errors.email} className="sm:col-span-2">
          <input required type="email" value={customer.email || ''} onChange={(e) => set({ email: e.target.value })} autoComplete="email" className={cn(input, 'font-latin-sans')} data-testid="email" />
        </Field>

        {isAirport ? (
          <Field label="Numéro de vol" className="sm:col-span-2">
            {/* Only for an airport pick-up — asking everyone would be noise. */}
            <input value={customer.flight || ''} onChange={(e) => set({ flight: e.target.value })} className={cn(input, 'font-latin-sans')} data-testid="flight" />
          </Field>
        ) : null}

        <Field label="Message" className="sm:col-span-2">
          <textarea rows={3} value={customer.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={input} />
        </Field>
      </div>

      {/* ---- summary ---- */}
      {q ? (
        <div className="mt-8 border-t border-border pt-6" data-testid="funnel-breakdown">
          <p className="eyebrow">{labels.summaryTitle}</p>
          <dl className="mt-4 space-y-2">
            <Line label={`${labels.rental} ${money(q.basePerDay)} × ${q.days}`} value={money(q.subtotal)} />
            {q.discountAmount ? <Line label={`${labels.discount} ${q.discountPct}%`} value={`− ${money(q.discountAmount)}`} /> : null}
            {q.extrasTotal ? <Line label={labels.options} value={money(q.extrasTotal)} /> : null}
            {q.deliveryFee ? <Line label={labels.delivery} value={money(q.deliveryFee)} /> : null}
            {q.oneWayFee ? <Line label={labels.oneWay} value={money(q.oneWayFee)} /> : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <dt className="text-meta font-semibold text-text">{labels.total}</dt>
              <dd className="price tnum text-text">{money(q.total)}</dd>
            </div>
            <Line label={labels.deposit} value={money(q.deposit)} muted />
          </dl>
          <p className="text-meta mt-1 text-text-muted">{labels.depositNote.replace('{days}', String(settings?.depositReleaseDays || 7))}</p>
        </div>
      ) : null}

      {/* ---- payment: information, not a choice (plan 9.5) ---- */}
      <p className="text-meta mt-6 border-s-2 border-red-signal ps-4 text-text-2" data-testid="payment-line">
        {labels.payment}
      </p>

      {/* ---- consent (plan 9.4) ---- */}
      <label className="mt-6 flex items-start gap-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-red" required data-testid="consent" />
        <span className="text-meta text-text-2">
          {labels.consent}
          {receipt ? ` ${labels.consentReceipt.replace('{receipt}', receipt)}` : ''}
        </span>
      </label>
      {errors.consent ? <p className="text-meta mt-2 text-red-signal">{labels.errorServer}</p> : null}

      {turnstileSiteKey ? <div ref={widgetRef} className="mt-6" data-testid="turnstile" /> : null}

      {globalError ? (
        <p className="text-meta mt-6 text-red-signal" role="alert" data-testid="funnel-error">
          {globalError}
        </p>
      ) : null}

      <div className="mt-8 flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-meta rounded-full border border-border-strong px-5 py-3 font-semibold text-text">
          {labels.back}
        </button>
        <button
          type="submit"
          disabled={pending || disabled || !consent}
          data-testid="funnel-submit"
          className="text-meta rounded-full bg-red px-6 py-3.5 font-semibold text-white disabled:bg-surface-3 disabled:text-text-muted"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
      </div>
    </form>
  );
}

const input =
  'w-full rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal';

function Field({ label, error, className, children }) {
  return (
    <label className={cn('block', className)}>
      <span className="eyebrow mb-2 block">{label}</span>
      {children}
      {error ? <span className="text-meta mt-1 block text-red-signal">{String(error)}</span> : null}
    </label>
  );
}

function Line({ label, value, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-meta', muted ? 'text-text-muted' : 'text-text-2')}>{label}</dt>
      <dd className={cn('text-meta tnum', muted ? 'text-text-muted' : 'text-text')}>{value}</dd>
    </div>
  );
}

/** `2026-10-07T10:00:00.000Z` → ['2026-10-07', '10:00'] for the action's schema. */
function splitIso(iso) {
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`];
  } catch {
    return ['', ''];
  }
}
