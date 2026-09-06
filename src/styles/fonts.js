import localFont from 'next/font/local';

/**
 * Self-hosted variable fonts (no Google Fonts round-trip, no build-time fetch).
 * Plan section 2.3: Archivo (display / wordmark / meta labels) + Manrope
 * (body, UI, tabular numerals) for Latin; Noto Kufi Arabic + IBM Plex Sans
 * Arabic for Arabic. The Arabic faces are never preloaded — browsers only
 * fetch them when an <html lang="ar"> page actually renders Arabic text.
 *
 * The CSS variables declared here are consumed once in src/styles/globals.css,
 * which resolves them into a --font-heading / --font-body pair that :lang(ar)
 * swaps wholesale.
 */

/**
 * Archivo Variable, wdth 62–125 + wght 100–900, from
 * @fontsource-variable/archivo (files/archivo-latin-wdth-normal.woff2).
 * Used at wdth 112 for display sizes and wdth 125 for the wordmark and meta
 * labels. Only the `latin` subset is vendored: fr / en / es all live inside
 * U+0000–00FF, and this two-axis file is 90 kB, which is already the single
 * biggest item in the LCP budget (CLAUDE.md rule 7). The `latin-ext` cut is
 * vendored alongside it for the day a locale needs it, but it is not wired in.
 */
export const fontDisplay = localFont({
  src: [{ path: '../assets/fonts/archivo-latin-wdth.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
  adjustFontFallback: false,
});

export const fontSans = localFont({
  src: [{ path: '../assets/fonts/manrope-latin-wght.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const fontArabicDisplay = localFont({
  src: [{ path: '../assets/fonts/noto-kufi-arabic-wght.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-arabic-display',
  display: 'swap',
  preload: false,
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
});

export const fontArabicSans = localFont({
  src: [
    { path: '../assets/fonts/ibm-plex-sans-arabic-400.woff2', weight: '400', style: 'normal' },
    { path: '../assets/fonts/ibm-plex-sans-arabic-500.woff2', weight: '500', style: 'normal' },
    { path: '../assets/fonts/ibm-plex-sans-arabic-600.woff2', weight: '600', style: 'normal' },
    { path: '../assets/fonts/ibm-plex-sans-arabic-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-arabic-sans',
  display: 'swap',
  preload: false,
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
});

export const fontClassNames = [fontDisplay.variable, fontSans.variable, fontArabicDisplay.variable, fontArabicSans.variable].join(' ');
