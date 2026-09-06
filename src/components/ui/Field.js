import { cn } from '@/lib/cn';

const inputBase =
  'w-full rounded-[var(--radius-input)] border border-border bg-surface-1 px-3.5 py-2.5 text-[15px] text-text placeholder:text-text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 min-h-11';

export function Label({ htmlFor, children, hint, className }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-[13px] font-semibold text-text-2', className)}>
      {children}
      {hint ? <span className="ms-1 font-normal text-text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn(inputBase, className)} {...props} />;
}

/**
 * The chevron is a background-image, so it cannot read a CSS variable and it
 * cannot inherit currentColor. It is drawn twice instead — once per theme —
 * with the BLACKLINE --text-muted of that theme, because no single grey clears
 * the 3:1 non-text bar on both #ececec and #151515. A hex inside an inline SVG
 * asset is the same category as a hex inside a .svg file (CLAUDE.md rule 2).
 * The UI kit rebuild (prompt 02) should replace this with a real icon slot.
 */
const CHEVRON = (stroke) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23${stroke}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>")`;

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        inputBase,
        'appearance-none bg-[length:16px] bg-[position:right_0.85rem_center] bg-no-repeat pe-9 rtl:bg-[position:left_0.85rem_center]',
        className,
      )}
      style={{ '--chevron-light': CHEVRON('6a6a6a'), '--chevron-dark': CHEVRON('8a8a8a'), backgroundImage: 'var(--chevron)' }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(inputBase, 'min-h-28 resize-y', className)} {...props} />;
}

export function Checkbox({ className, label, id, ...props }) {
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3 text-sm text-text-2', className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-[var(--accent-fill)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-[13px] text-danger" role="alert">
      {children}
    </p>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }) {
  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={htmlFor} hint={hint}>
          {label}
        </Label>
      ) : null}
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}
