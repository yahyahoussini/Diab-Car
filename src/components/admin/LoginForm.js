'use client';

import { useActionState } from 'react';
import { login } from '@/lib/actions/auth';
import { Field, Input } from '@/components/ui/Field';
import { LogoMark } from '@/components/site/Logo';

export default function LoginForm({ next = '', mode = 'demo' }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="absolute inset-0 zellige" aria-hidden="true" />
      <form action={action} className="card relative w-full max-w-sm p-7">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <div>
            <div className="font-latin-display text-xl font-semibold text-text">DIAB CAR</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Administration</div>
          </div>
        </div>
        <input type="hidden" name="next" value={next} />
        <div className="mt-6 space-y-4">
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="username" defaultValue={mode === 'demo' ? 'admin@diabcar.ma' : ''} className="font-latin-sans" />
          </Field>
          <Field label="Mot de passe" htmlFor="password" error={state?.error}>
            <Input id="password" name="password" type="password" required autoComplete="current-password" className="font-latin-sans" />
          </Field>
        </div>
        <button type="submit" disabled={pending} className="btn-gold mt-6 h-11 w-full rounded-full text-sm font-semibold disabled:opacity-60">
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
        {mode === 'demo' ? <p className="mt-4 text-center text-xs text-text-muted">Mode démo — mot de passe : diabcar-demo (variable ADMIN_DEMO_PASSWORD)</p> : null}
      </form>
    </div>
  );
}
