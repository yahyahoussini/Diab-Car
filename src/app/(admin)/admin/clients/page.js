import ComingSoon from '@/components/admin/ComingSoon';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ComingSoon title="Clients" description="Fiche client : coordonnées, historique de locations, notes." prompt="PROMPT 12" alternative="les coordonnées figurent sur chaque réservation." />;
}
