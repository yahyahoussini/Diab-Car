import Link from 'next/link';
import { cn } from '@/lib/cn';

export function PageTitle({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-text">{title}</h1>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className, footer }) {
  return (
    <section className={cn('card p-5', className)}>
      {title ? <h2 className="mb-4 font-sans text-base font-semibold text-text">{title}</h2> : null}
      {children}
      {footer ? <div className="mt-5 border-t border-border pt-4">{footer}</div> : null}
    </section>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{label}</div>
      <div className={cn('mt-2 font-display text-3xl', tone === 'accent' ? 'text-accent' : 'text-text')}>
        <bdi className="tnum">{value}</bdi>
      </div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </div>
  );
}

export function Table({ head = [], children, className }) {
  return (
    <div className={cn('overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface-1', className)}>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-start text-[11px] uppercase tracking-[0.1em] text-text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function AdminLink({ href, children, className, variant = 'primary' }) {
  const styles = variant === 'primary' ? 'bg-red text-on-red hover:bg-red-hover' : variant === 'danger' ? 'border border-danger/40 text-danger hover:bg-danger-soft' : 'border border-border text-text-2 hover:text-text hover:border-border-strong';
  return (
    <Link href={href} className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors', styles, className)}>
      {children}
    </Link>
  );
}

export function SubmitButton({ children, variant = 'primary', className, ...props }) {
  const styles = variant === 'primary' ? 'bg-red text-on-red hover:bg-red-hover' : variant === 'danger' ? 'border border-danger/40 text-danger hover:bg-danger-soft' : 'border border-border text-text-2 hover:text-text';
  return (
    <button type="submit" className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-50', styles, className)} {...props}>
      {children}
    </button>
  );
}

const STATUS_TONE = { pending: 'bg-warning-soft text-warning', confirmed: 'bg-success-soft text-success', active: 'bg-accent-soft text-accent', completed: 'bg-surface-2 text-text-2', cancelled: 'bg-danger-soft text-danger' };
export const STATUS_LABEL = { pending: 'En attente', confirmed: 'Confirmée', active: 'En cours', completed: 'Terminée', cancelled: 'Annulée' };

export function StatusBadge({ status }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_TONE[status] || STATUS_TONE.completed)}>{STATUS_LABEL[status] || status}</span>;
}

export function Notice({ tone = 'success', children }) {
  const styles = { success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', info: 'bg-accent-soft text-accent' };
  return <div className={cn('mb-4 rounded-xl px-4 py-3 text-sm font-medium', styles[tone])}>{children}</div>;
}

export const LOCALE_LABEL = { fr: 'Français', en: 'English', ar: 'العربية', es: 'Español' };
