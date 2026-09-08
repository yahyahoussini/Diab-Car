import ComingSoon from '@/components/admin/ComingSoon';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ComingSoon title="Blocs" description="Sortir une voiture de la disponibilité pour maintenance, nettoyage ou transfert. Le refus d'un bloc qui chevauche une réservation confirmée est déjà appliqué par la base." prompt="PROMPT 12" alternative="changez le statut de l'unité depuis la flotte." />;
}
