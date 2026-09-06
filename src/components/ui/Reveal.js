import { cn } from '@/lib/cn';

/**
 * Zero-JS scroll reveals. Uses CSS scroll-driven animations
 * (`animation-timeline: view()`) where supported; elsewhere the content simply
 * renders visible. Never wraps the LCP element in an opacity animation on
 * first viewport — use `eager` for above-the-fold content.
 */
export default function Reveal({ children, className, as: Tag = 'div', delay = 0, eager = false, style, ...props }) {
  return (
    <Tag className={cn(eager ? 'eager-rise' : 'reveal-view', className)} style={{ ...(eager ? { animationDelay: `${delay}s` } : {}), ...style }} {...props}>
      {children}
    </Tag>
  );
}

export function Stagger({ children, className, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cn('stagger', className)} {...props}>
      {children}
    </Tag>
  );
}

/** Items stagger via nth-child offsets on the scroll timeline (see globals.css). */
export function StaggerItem({ children, className, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cn('reveal-view', className)} {...props}>
      {children}
    </Tag>
  );
}
