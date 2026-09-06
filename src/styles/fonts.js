import localFont from 'next/font/local';

/**
 * Self-hosted variable fonts (no Google Fonts round-trip, no build-time fetch).
 * Latin: Fraunces (display) + Manrope (text). Arabic: Noto Kufi Arabic (display)
 * + IBM Plex Sans Arabic (text). Arabic files are not preloaded – browsers only
 * download them when an <html lang="ar"> page actually renders Arabic text.
 */
export const fontDisplay = localFont({
  src: [
    { path: '../assets/fonts/fraunces-latin-wght.woff2', weight: '100 900', style: 'normal' },
    { path: '../assets/fonts/fraunces-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-display-latin',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const fontSans = localFont({
  src: [{ path: '../assets/fonts/manrope-latin-wght.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-sans-latin',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const fontArabicDisplay = localFont({
  src: [{ path: '../assets/fonts/noto-kufi-arabic-wght.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-display-arabic',
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
  variable: '--font-sans-arabic',
  display: 'swap',
  preload: false,
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
});

export const fontClassNames = [fontDisplay.variable, fontSans.variable, fontArabicDisplay.variable, fontArabicSans.variable].join(' ');
