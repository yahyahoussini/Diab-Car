export default function manifest() {
  return {
    name: 'Diab Car — Location de voitures Casablanca',
    short_name: 'Diab Car',
    description: 'Location de voitures à Casablanca et aéroport Mohammed V. Prix tout inclus, caution transparente.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#080808',
    lang: 'fr',
    // The real mark, white on brand red, generated from public/brand/badge-icon.png.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
