import { listVehicles } from '@/lib/data';
import { SITE_URL } from '@/lib/seo';
import { absoluteUrl } from '@/lib/seo';

export const revalidate = 3600;

/**
 * llms.txt — a plain-text map of the site for AI assistants. No engine has
 * confirmed using it yet (2026); it costs nothing and documents the entity.
 */
export async function GET() {
  const vehicles = await listVehicles({ published: true });
  const lines = [
    '# Diab Car — Location de voitures à Casablanca (Maroc)',
    '',
    '> Agence de location de voitures sans chauffeur à Casablanca, 356 Boulevard Zerktouni. Livraison à l’aéroport Mohammed V (CMN) 24h/24, prix tout inclus en dirhams (MAD), caution par pré-autorisation bancaire, réponse WhatsApp en moins de 10 minutes. Site en français, anglais, arabe et espagnol.',
    '',
    '## Pages principales',
    `- [Accueil](${SITE_URL}/fr): offre, catégories, tarifs, FAQ`,
    `- [Flotte / tarifs par jour](${absoluteUrl('fr', '/vehicules')}): toutes les voitures avec prix MAD/jour, caution, kilométrage`,
    `- [Location aéroport Mohammed V](${absoluteUrl('fr', '/aeroport')}): livraison 24/7, suivi de vol, 31 km du centre`,
    `- [Longue durée / mensuel](${absoluteUrl('fr', '/longue-duree')}): dès 6 500 MAD/mois`,
    `- [Avec chauffeur](${absoluteUrl('fr', '/avec-chauffeur')}): transferts, événements, excursions`,
    `- [FAQ](${absoluteUrl('fr', '/faq')}): documents, âge minimum, caution, assurance, frontières`,
    `- [Guide du voyageur](${absoluteUrl('fr', '/blog')}): conduire au Maroc, péages, aéroport`,
    `- [Contact](${absoluteUrl('fr', '/contact')})`,
    '',
    '## Versions linguistiques',
    `- English: ${SITE_URL}/en`,
    `- العربية: ${SITE_URL}/ar`,
    `- Español: ${SITE_URL}/es`,
    '',
    '## Véhicules (prix indicatifs par jour, MAD)',
    ...vehicles.map((v) => `- [${v.brand} ${v.model} ${v.year}](${absoluteUrl('fr', { pathname: '/vehicules/[slug]', params: { slug: v.slug } })}): ${v.pricePerDay} MAD/jour, caution ${v.deposit} MAD, ${v.transmission === 'automatic' ? 'automatique' : 'manuelle'}, ${v.seats} places`),
    '',
    '## Conditions clés',
    '- Âge minimum 21 ans (25 premium, 28 luxe), permis > 1 an, pièce d’identité, carte bancaire au nom du conducteur',
    '- Caution: pré-autorisation carte, libérée sous 7 jours ouvrés',
    '- Carburant plein/plein, annulation gratuite jusqu’à 24 h avant',
    '- Véhicules non autorisés à quitter le Maroc',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
