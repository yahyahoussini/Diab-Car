import { cn } from '@/lib/cn';

/**
 * The road divider (plan 2.4 / 5.3): two hairlines with a dashed centre line
 * whose dashes drift as the page scrolls. The drift is a CSS scroll-driven
 * animation (see `.road-dash` in globals.css) - zero JavaScript, static where
 * the browser lacks `animation-timeline`, and static under reduced motion.
 * It replaces the brand marquee between homepage sections (plan section 10).
 *
 * Decorative: aria-hidden, and a plain <hr> for the document outline.
 */
export default function Divider({ className }) {
  return (
    <div className={cn('container-x', className)} aria-hidden="true">
      <div className="relative py-2">
        <hr className="hairline" />
        <div className="road-dash my-1.5 h-0.5 w-full" />
        <hr className="hairline" />
      </div>
    </div>
  );
}
