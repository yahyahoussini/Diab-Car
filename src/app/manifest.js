export default function manifest() {
  return {
    name: 'Diab Car — Location de voitures Casablanca',
    short_name: 'Diab Car',
    description: 'Location de voitures à Casablanca et aéroport Mohammed V. Prix tout inclus, caution transparente.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0b09',
    theme_color: '#0c0b09',
    lang: 'fr',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
