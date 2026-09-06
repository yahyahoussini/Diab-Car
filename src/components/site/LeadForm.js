'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { WhatsAppIcon } from '@/components/site/icons';
import { submitContact } from '@/lib/actions/contact';
import { whatsappLink } from '@/lib/whatsapp';

/**
 * Generic lead / contact form. `fields` adds selects before the message
 * (e.g. duration, category). Falls back to a WhatsApp deep link with the
 * composed message so the lead is never lost.
 */
export default function LeadForm({ subject, title, whatsapp, fields = [], compact = false }) {
  const t = useTranslations('contact.form');
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', ...Object.fromEntries(fields.map((f) => [f.name, f.options?.[0]?.value || ''])) });
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const composed = () => {
    const extra = fields.map((f) => `${f.label}: ${f.options?.find((o) => o.value === form[f.name])?.label || form[f.name]}`).join('\n');
    return `${subject}\n${extra ? extra + '\n' : ''}${form.message}\n— ${form.name} · ${form.phone}`;
  };

  function onSubmit(e) {
    e.preventDefault();
    setError('');
    start(async () => {
      const res = await submitContact({ name: form.name, phone: form.phone, email: form.email, message: composed(), subject, locale });
      if (res?.ok) setSent(true);
      else setError(t('error'));
    });
  }

  if (sent) {
    return (
      <div className="card p-6 text-center">
        <p className="font-semibold text-success">{t('sent')}</p>
        {whatsapp ? (
          <Button href={whatsappLink(whatsapp, composed())} external variant="whatsapp" className="mt-4">
            <WhatsAppIcon className="h-5 w-5" />
            {t('viaWhatsapp')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6">
      {title ? <h3 className="font-display text-2xl text-text">{title}</h3> : null}
      <div className={compact ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
        <Field label={t('name')} htmlFor={`${subject}-name`}>
          <Input id={`${subject}-name`} required value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
        </Field>
        <Field label={t('phone')} htmlFor={`${subject}-phone`}>
          <Input id={`${subject}-phone`} type="tel" required value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" className="font-latin-sans" placeholder="+212 6…" />
        </Field>
        <Field label={t('email')} htmlFor={`${subject}-email`} className={compact ? '' : 'sm:col-span-2'}>
          <Input id={`${subject}-email`} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" className="font-latin-sans" />
        </Field>
        {fields.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={`${subject}-${f.name}`}>
            <Select id={`${subject}-${f.name}`} value={form[f.name]} onChange={(e) => set(f.name, e.target.value)}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
        <Field label={t('message')} htmlFor={`${subject}-message`} className="sm:col-span-2">
          <Textarea id={`${subject}-message`} required minLength={5} value={form.message} onChange={(e) => set('message', e.target.value)} />
        </Field>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {t('submit')}
        </Button>
        {whatsapp ? (
          <Button href={whatsappLink(whatsapp, composed())} external variant="whatsapp" size="lg">
            <WhatsAppIcon className="h-5 w-5" />
            {t('viaWhatsapp')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
