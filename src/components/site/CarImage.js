import manifest from '../../../public/images/cars/manifest.json';
import { cn } from '@/lib/cn';

/**
 * Responsive car photo from the build-time pipeline (scripts/images.mjs):
 * a <picture> with AVIF then WebP sources across 480-2000 px, explicit
 * width/height so the box is reserved before the bytes land (CLS 0), the 24 px
 * blur placeholder painted behind it, and lazy loading unless `priority`.
 *
 * The manifest is a static JSON import - bundled at build, never read with fs
 * at runtime (CLAUDE.md rule 9). Server component: the manifest (blur data
 * URLs included) never ships to the browser.
 *
 * No photo yet -> the category silhouette on the neutral ground. Plan 2.5 calls
 * that a stopgap, not a launch state; the card never breaks on a gap.
 */

/** Silhouette per category, until real photography exists. */
const SILHOUETTE = { economy: 'citadine', compact: 'citadine', sedan: 'berline', suv: 'suv', premium: 'suv-premium', luxury: 'suv-premium', van: 'van' };

/**
 * Resolve one angle for a vehicle.
 * @param {object} vehicle
 * @param {'front'|'side'|'rear'|'interior'|'dash'} angle
 * @returns {{ src: string, widths: number[], width: number, height: number, blur: string } | null}
 */
export function carShot(vehicle, angle = 'front') {
  const key = vehicle?.photoFolder || vehicle?.slug;
  return (key && manifest?.vehicles?.[key]?.[angle]) || null;
}

/** True when the pipeline produced this angle - lets callers decide about a crossfade. */
export function hasCarShot(vehicle, angle) {
  return Boolean(carShot(vehicle, angle));
}

const srcset = (shot, fmt) => shot.widths.map((w) => `${shot.src}-${w}.${fmt} ${w}w`).join(', ');

/**
 * @param {{
 *   vehicle: object,
 *   angle?: 'front'|'side'|'rear'|'interior'|'dash',
 *   alt: string,
 *   sizes?: string,
 *   priority?: boolean,
 *   className?: string,
 *   imgClassName?: string,
 * }} props
 */
export default function CarImage({ vehicle, angle = 'front', alt, sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw', priority = false, className, imgClassName, ...rest }) {
  const shot = carShot(vehicle, angle);

  if (!shot) {
    const silhouette = vehicle?.image || SILHOUETTE[vehicle?.category] || 'berline';
    return (
      <span className={cn('block bg-surface-1', className)} {...rest}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/images/cars/${silhouette}.svg`}
          alt={alt}
          width={800}
          height={380}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className={cn('h-full w-full object-contain', imgClassName)}
        />
      </span>
    );
  }

  const largest = shot.widths[shot.widths.length - 1];
  return (
    <picture className={cn('block', className)} style={{ backgroundImage: `url(${shot.blur})`, backgroundSize: 'cover' }} {...rest}>
      <source type="image/avif" srcSet={srcset(shot, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcset(shot, 'webp')} sizes={sizes} />
      <img
        src={`${shot.src}-${largest}.webp`}
        alt={alt}
        width={shot.width}
        height={shot.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={cn('h-full w-full object-cover', imgClassName)}
      />
    </picture>
  );
}
