import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none transition-[transform,background-color,border-color,color,box-shadow] duration-300 ease-out-expo disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

const variants = {
  primary: 'btn-gold rounded-full shadow-[0_8px_24px_-8px_rgba(201,168,92,0.6)] hover:shadow-[0_12px_32px_-8px_rgba(201,168,92,0.75)] hover:-translate-y-0.5',
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

export default function Button({ href, external, variant = 'primary', size = 'md', className, children, ...props }) {
  const classes = cn(base, variants[variant] || variants.primary, variant === 'link' ? '' : sizes[size] || sizes.md, className);
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
