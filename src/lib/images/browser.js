/**
 * Image variants, made in the browser (plan 2.5, CLAUDE.md rule 9).
 *
 * Everything here runs in the admin's tab: decode, resize on a canvas, encode
 * WebP plus a JPEG fallback, and a 24 px blur placeholder — then the blobs go
 * straight to Supabase Storage. Nothing is processed on a server, ever.
 *
 * That is not a preference. `sharp` is a native module and rule 9 forbids one
 * at runtime; a per-request image service is not free on Workers; and the
 * agency's laptop is idle while it waits for an upload anyway. The cost of
 * doing it here is a few seconds of the operator's CPU, once, per photo.
 *
 * The output deliberately matches what `scripts/images.mjs` writes at build
 * time — same widths, same `<base>-<width>.<ext>` naming, same blur data URI —
 * so `CarImage` renders a build-time photo and an admin-uploaded one with the
 * same markup and the same `srcset`.
 */

/** Plan 2.5. A variant is only produced if the master is at least that wide. */
export const WIDTHS = [480, 768, 1080, 1600, 2000];

const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.86;
const BLUR_WIDTH = 24;

/** Hard ceiling on what we ask a browser to decode — a 50 MP RAW export kills a tab. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class ImageError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Decode a File into an ImageBitmap, with the orientation the camera recorded
 * already applied — otherwise every portrait phone photo uploads sideways.
 */
async function decode(file) {
  if (!file) throw new ImageError('NO_FILE', 'Aucun fichier.');
  if (!/^image\//.test(file.type)) throw new ImageError('NOT_IMAGE', 'Ce fichier n’est pas une image.');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('TOO_LARGE', 'Image trop lourde (25 Mo maximum).');

  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    /* Older Safari ignores the options bag and throws. Fall back to an <img>,
       which applies EXIF orientation itself. */
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new ImageError('DECODE_FAILED', 'Image illisible.'));
      };
      img.src = url;
    });
  }
}

function sizeOf(source) {
  return {
    width: source.width || source.naturalWidth || 0,
    height: source.height || source.naturalHeight || 0,
  };
}

function draw(source, width) {
  const { width: w, height: h } = sizeOf(source);
  const scale = Math.min(1, width / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** True when this browser can actually encode WebP — Safari < 16 cannot. */
let webpSupport;
export function canEncodeWebp() {
  if (webpSupport === undefined) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupport;
}

/**
 * Turn one File into the whole variant set.
 *
 * @param {File} file
 * @param {{ widths?: number[] }} [opts]
 * @returns {Promise<{
 *   width: number, height: number, widths: number[], formats: string[],
 *   blur: string,
 *   files: { width: number, format: 'webp'|'jpg', blob: Blob }[]
 * }>}
 */
export async function prepareVariants(file, { widths = WIDTHS } = {}) {
  const source = await decode(file);
  const { width, height } = sizeOf(source);
  if (!width || !height) throw new ImageError('DECODE_FAILED', 'Image illisible.');

  const webp = canEncodeWebp();
  /* Never upscale: a 900 px master gets 480 and 768, not a blurry 2000. The
     largest source width is always included so the biggest variant is the
     photo itself rather than the nearest step below it. */
  const targets = widths.filter((w) => w <= width);
  if (targets.length === 0 || targets[targets.length - 1] < width) targets.push(Math.min(width, widths[widths.length - 1]));

  const files = [];
  for (const target of targets) {
    const canvas = draw(source, target);
    if (webp) {
      const blob = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
      if (blob) files.push({ width: canvas.width, format: 'webp', blob });
    }
    /* The JPEG fallback is produced at every width when WebP is unavailable,
       and only at the largest when it is — one file for the handful of clients
       that cannot read WebP, without doubling storage for everyone else. */
    if (!webp || target === targets[targets.length - 1]) {
      const blob = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY);
      if (blob) files.push({ width: canvas.width, format: 'jpg', blob });
    }
  }
  if (files.length === 0) throw new ImageError('ENCODE_FAILED', 'Le navigateur n’a pas pu encoder l’image.');

  const blurCanvas = draw(source, BLUR_WIDTH);
  const blur = blurCanvas.toDataURL(webp ? 'image/webp' : 'image/jpeg', 0.5);

  if (typeof source.close === 'function') source.close();

  const emitted = [...new Set(files.map((f) => f.width))].sort((a, b) => a - b);
  const formats = [...new Set(files.map((f) => f.format))];
  return { width, height, widths: emitted, formats, blur, files };
}

/** `vehicles/<slug>/<angle>-<id>` — the base every variant hangs off. */
export function photoBasePath(slug, angle) {
  const token = Math.random().toString(36).slice(2, 8);
  return `${slug || 'vehicule'}/${angle}-${token}`;
}

/**
 * Upload one photo and every variant of it.
 *
 * `onProgress(done, total)` is called after each file so a 12-file upload is
 * not a frozen button. Returns the row shape `save_vehicle_photo` expects.
 */
export async function uploadVehiclePhoto(supabase, { file, slug, angle, vehicleId, onProgress }) {
  const variants = await prepareVariants(file);
  const basePath = photoBasePath(slug, angle);
  let done = 0;

  for (const v of variants.files) {
    const path = `${basePath}-${v.width}.${v.format}`;
    const { error } = await supabase.storage.from('vehicles').upload(path, v.blob, {
      contentType: v.format === 'webp' ? 'image/webp' : 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw new ImageError('UPLOAD_FAILED', error.message);
    done += 1;
    onProgress?.(done, variants.files.length);
  }

  return {
    vehicleId,
    angle,
    basePath,
    widths: variants.widths,
    formats: variants.formats,
    width: variants.width,
    height: variants.height,
    blur: variants.blur,
  };
}

/** Remove every variant of a photo from the bucket. */
export async function removeVehiclePhotoFiles(supabase, { basePath, widths = [], formats = [] }) {
  const paths = [];
  for (const w of widths) for (const f of formats) paths.push(`${basePath}-${w}.${f}`);
  if (paths.length === 0) return { removed: 0 };
  const { error } = await supabase.storage.from('vehicles').remove(paths);
  if (error) throw new ImageError('DELETE_FAILED', error.message);
  return { removed: paths.length };
}

/**
 * An inspection photo: one resized WebP into the PRIVATE bucket.
 *
 * No variant set here — nobody browses these, an operator opens one to settle
 * a dispute — but they are still resized, because a checklist with eight
 * 8-megapixel photos on agency wifi is a checklist nobody completes.
 */
export async function uploadInspectionPhoto(supabase, { file, reservationId, kind = 'photo' }) {
  const source = await decode(file);
  const canvas = draw(source, 1600);
  const webp = canEncodeWebp();
  const blob = await toBlob(canvas, webp ? 'image/webp' : 'image/jpeg', WEBP_QUALITY);
  if (typeof source.close === 'function') source.close();
  if (!blob) throw new ImageError('ENCODE_FAILED', 'Le navigateur n’a pas pu encoder la photo.');

  const path = `${reservationId}/${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${webp ? 'webp' : 'jpg'}`;
  const { error } = await supabase.storage.from('inspections').upload(path, blob, {
    contentType: webp ? 'image/webp' : 'image/jpeg',
    upsert: false,
  });
  if (error) throw new ImageError('UPLOAD_FAILED', error.message);
  return path;
}

/** The signature canvas, as a PNG in the private bucket. */
export async function uploadSignature(supabase, { canvas, reservationId, kind = 'signature' }) {
  const blob = await toBlob(canvas, 'image/png');
  if (!blob) throw new ImageError('ENCODE_FAILED', 'Signature illisible.');
  const path = `${reservationId}/${kind}-${Date.now().toString(36)}.png`;
  const { error } = await supabase.storage.from('inspections').upload(path, blob, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw new ImageError('UPLOAD_FAILED', error.message);
  return path;
}
