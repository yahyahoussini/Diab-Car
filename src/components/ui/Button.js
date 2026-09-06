import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none transition-[transform,background-color,border-color,color,box-shadow] duration-300 ease-out disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

const variants = {
  primary: 'bg-red text-on-red rounded-full hover:bg-red-hover hover:-translate-y-0.5',
  secondary: 'rounded-full border border-border-strong bg-transparent text-text hover:border-accent hover:text-accent hover:-translate-y-0.5',
  ghost: 'rounded-full text-text-2 hover:text-text hover:bg-surface-2',
  dark: 'rounded-full bg-text text-bg hover:opacity-90 hover:-translate-y-0.5',
  whatsapp: 'rounded-full bg-whatsapp text-on-whatsapp hover:brightness-105 hover:-translate-y-0.5 shadow-[0_8px_24px_-10px_rgba(37,211,102,0.7)]',
  link: 'text-accent underline-offset-4 hover:underline px-0',
};

const sizes = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-7 text-base',
  xl: 'h-14 px-8 text-base',
  icon: 'h-11 w-11',
};

/**
 * Indeterminate progress as The Red Line, not a spinner (plan 4.13: "Loader:
 * the red line, never 'Loading…'"). It rides along the bottom edge of the
 * button, inside its rounded clip.
 */
function LoadingLine() {
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden="true">
      <span className="block h-full w-1/3 bg-on-red/80 motion-safe:animate-[button-sweep_1.1s_var(--ease-inout)_infinite]" />
    </span>
  );
}

export default function Button({ href, external, variant = 'primary', size = 'md', className, children, loading = false, loadingLabel, ...props }) {
  const classes = cn(base, variants[variant] || variants.primary, variant === 'link' ? '' : sizes[size] || sizes.md, loading && 'relative overflow-hidden', className);
  if (loading && !href) {
    return (
      <button type="button" className={classes} aria-busy="true" disabled {...props}>
        {loadingLabel || children}
        <LoadingLine />
      </button>
    );
  }
  if (href && external) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
