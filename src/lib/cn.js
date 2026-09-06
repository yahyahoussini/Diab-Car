/** Tiny className joiner (no dependency). */
export function cn(...parts) {
  return parts
    .flat()
    .filter((p) => typeof p === 'string' && p.trim().length > 0)
    .join(' ');
}
