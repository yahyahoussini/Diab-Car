import manifest from '../../../public/images/cars/manifest.json';
import { cn } from '@/lib/cn';

/**
 * Responsive car photo, from either pipeline (plan 2.5).
 *
 * There are two sources of the same shape, on purpose:
 *
 *   1. the build-time pipeline (scripts/images.mjs) writing AVIF + WebP into
 *      public/images/cars/ and a static manifest.json;
 *   2. rows in `vehicle_photos`, uploaded from the admin, whose variants were
 *      encoded in the operator's browser (src/lib/images/browser.js) and put
 *      in the public `vehicles` bucket.
 *
 * Both describe a photo as "one base path, a list of widths, a list of
 * formats, intrinsic dimensions and a 24 px blur", so this component renders
 * them with identical markup. That is what lets Diab Car replace a photo from
 * the admin with no code change and no deploy (plan 7.1) while a fresh clone
 * with no database still shows the committed images.
 *
 * Order of preference: an uploaded photo, then the build-time manifest, then
 * the category silhouette. Plan 2.5 calls the silhouette a stopgap, not a
 * launch state; the card never breaks on a gap.
 *
 * Server component: the manifest (blur data URLs included) never ships to the
 * browser.
 */

/** Silhouette per category, until real photography exists. */
const SILHOUETTE = { economy: 'citadine', compact: 'citadine', sedan: 'berline', suv: 'suv', premium: 'suv-premium', luxury: 'suv-premium', van: 'van' };

/** Build-time variants are always written in these two formats. */
const MANIFEST_FORMATS = ['avif', 'webp'];

/** The public URL of an object in the `vehicles` bucket. */
function storageBase(path) {
  const root = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return root ? `${root}/storage/v1/object/public/vehicles/${path}` : null;
}

/**
 * Resolve one angle for a vehicle.
 *
 * @param {object} vehicle
 * @param {'front'|'side'|'rear'|'interior'|'dash'} angle
 * @param {object[]} [photos] rows from `vehicle_photos` for this vehicle
 * @returns {{ src: string, widths: number[], formats: string[], width: number, height: number, blur: string } | null}
 */
export function carShot(vehicle, angle = 'front', photos) {
  const uploaded = pickUploaded(vehicle, angle, photos);
  if (uploaded) return uploaded;

  const key = vehicle?.photoFolder || vehicle?.slug;
  const shot = (key && manifest?.vehicles?.[key]?.[angle]) || null;
  return shot ? { ...shot, formats: MANIFEST_FORMATS } : null;
}

function pickUploaded(vehicle, angle, photos) {
  const rows = photos || vehicle?.photos;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const forAngle = rows.filter((p) => (p.angle || 'front') === angle);
  if (forAngle.length === 0) return null;

  /* First by sort order — the operator decided which one leads, and for the
     front angle that choice IS the card image (plan 7.1). */
  const row = [...forAngle].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100))[0];
  const src = storageBase(row.basePath);
  if (!src || !row.widths?.length) return null;

  return {
    src,
    widths: [...row.widths].sort((a, b) => a - b),
    formats: row.formats?.length ? row.formats : ['webp'],
    width: row.width || 1600,
    height: row.height || 1067,
    blur: row.blur || '',
  };
}

/** True when a real photo exists for this angle — lets callers decide about a crossfade. */
export function hasCarShot(vehicle, angle, photos) {
  return Boolean(carShot(vehicle, angle, photos));
}

const srcset = (shot, fmt) => shot.widths.map((w) => `${shot.src}-${w}.${fmt} ${w}w`).join(', ');

/**
 * @param {{
 *   vehicle: object,
 *   photos?: object[],
 *   angle?: 'front'|'side'|'rear'|'interior'|'dash',
 *   alt: string,
 *   sizes?: string,
 *   priority?: boolean,
 *   className?: string,
 *   imgClassName?: string,
 * }} props
 */
export default function CarImage({ vehicle, photos, angle = 'front', alt, sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw', priority = false, className, imgClassName, ...rest }) {
  const shot = carShot(vehicle, angle, photos);

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

  /* The <img> fallback takes the last format listed, because the format lists
     are ordered best-first: avif → webp for the build pipeline, webp → jpg for
     an upload. The last entry is therefore the most compatible one. */
  const fallbackFormat = shot.formats[shot.formats.length - 1];
  const largest = shot.widths[shot.widths.length - 1];

  return (
    <picture className={cn('block', className)} style={shot.blur ? { backgroundImage: `url(${shot.blur})`, backgroundSize: 'cover' } : undefined} {...rest}>
      {shot.formats.map((fmt) => (
        <source key={fmt} type={`image/${fmt === 'jpg' ? 'jpeg' : fmt}`} srcSet={srcset(shot, fmt)} sizes={sizes} />
      ))}
      <img
        src={`${shot.src}-${largest}.${fallbackFormat}`}
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
