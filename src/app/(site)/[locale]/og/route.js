import { renderOg } from '@/lib/og';
import { CAR_IMAGES } from '@/lib/constants';

export const revalidate = 86400;

/**
 * Branded Open Graph card: /{locale}/og?title=…&subtitle=…&kicker=…&car=suv&price=…
 * Used by every page's metadata (localizedMetadata) so shares on WhatsApp,
 * Facebook, LinkedIn and X always show a designed card.
 */
export async function GET(request, { params }) {
  const { locale } = await params;
  const sp = request.nextUrl.searchParams;
  const clip = (v, n) => (v || '').toString().slice(0, n);
  const car = sp.get('car');
  const image = await renderOg({
    locale,
    title: clip(sp.get('title'), 90) || 'Diab Car',
    subtitle: clip(sp.get('subtitle'), 140),
    kicker: clip(sp.get('kicker'), 60) || 'diabcar.ma',
    car: CAR_IMAGES.includes(car) ? car : 'suv-premium',
    price: clip(sp.get('price'), 30),
  });
  image.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
  return image;
}
