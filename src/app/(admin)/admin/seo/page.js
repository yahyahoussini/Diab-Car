import { db } from '@/lib/data';
import { SITE_URL } from '@/lib/seo';
import SeoTools from '@/components/admin/SeoTools';
import { Card, PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const CHECKS = [
  ['Google Business Profile créé et vérifié (vidéo), catégorie « Agence de location de voitures », NAP identique au site', 'https://business.google.com/'],
  ['Google Search Console : propriété diabcar.ma vérifiée, sitemap.xml soumis', 'https://search.google.com/search-console'],
  ['Bing Webmaster Tools : import depuis Search Console + rapport « AI Performance » (Copilot)', 'https://www.bing.com/webmasters'],
  ['Bing Places for Business : fiche créée (alimente Copilot pour les requêtes locales)', 'https://www.bingplaces.com/'],
  ['Apple Business Connect : fiche créée (Apple Maps, Siri)', 'https://businessconnect.apple.com/'],
  ['Telecontact.ma, Kompass.ma, Charika.ma : fiche revendiquée, RC/ICE/adresse identiques', 'https://www.telecontact.ma/'],
  ['Avito Pro : boutique « location de voitures Casablanca » avec lien vers diabcar.ma', 'https://www.avito.ma/'],
  ['Facebook + Instagram : lien vers le site, adresse et horaires identiques', ''],
  ['Avis Google : lien de demande d’avis envoyé sur WhatsApp après chaque restitution (objectif 4,7★ / 150 avis)', ''],
  ['Rich Results Test : AutoRental, Product/Car, FAQPage, BreadcrumbList validés', 'https://search.google.com/test/rich-results'],
  ['PageSpeed Insights : LCP < 2,5 s, INP < 200 ms, CLS < 0,1 sur mobile', 'https://pagespeed.web.dev/'],
  ['Photos réelles de la flotte + de l’agence (remplacer les illustrations)', ''],
];

export default async function SeoPage() {
  const s = await (await db()).getSettingsAdmin();
  const links = [
    ['Sitemap (hreflang ×4)', `${SITE_URL}/sitemap.xml`],
    ['robots.txt (moteurs IA autorisés)', `${SITE_URL}/robots.txt`],
    ['llms.txt (carte du site pour les assistants IA)', `${SITE_URL}/llms.txt`],
    ['Manifest PWA', `${SITE_URL}/manifest.webmanifest`],
    ['Clé IndexNow', `${SITE_URL}/api/indexnow-key`],
    ['Santé / keep-alive', `${SITE_URL}/api/health`],
  ];
  return (
    <>
      <PageTitle title="SEO & moteurs IA" description="Outils de diffusion et checklist des actions hors site qui font la différence à Casablanca." />
      <Card title="Actions" className="mb-5">
        <SeoTools hasIndexNowKey={Boolean(s.indexNowKey || process.env.INDEXNOW_KEY)} />
        {!s.indexNowKey && !process.env.INDEXNOW_KEY ? <p className="mt-3 text-xs text-text-muted">Ajoutez une clé IndexNow dans Paramètres pour activer le ping Bing.</p> : null}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Fichiers techniques">
          <ul className="space-y-2 text-sm">
            {links.map(([label, href]) => (
              <li key={href} className="flex items-center justify-between gap-3">
                <span className="text-text-2">{label}</span>
                <a href={href} target="_blank" rel="noopener noreferrer" className="font-latin-sans text-xs text-accent hover:underline">
                  {href.replace(SITE_URL, '')}
                </a>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Checklist hors site (à cocher dans le plan SEO)">
          <ol className="space-y-2 text-sm">
            {CHECKS.map(([label, href], i) => (
              <li key={i} className="flex gap-3">
                <span className="font-latin-sans text-text-muted">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-text-2">
                  {label}
                  {href ? (
                    <>
                      {' '}
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        ↗
                      </a>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
