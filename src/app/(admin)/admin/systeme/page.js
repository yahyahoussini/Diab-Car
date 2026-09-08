import ComingSoon from '@/components/admin/ComingSoon';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ComingSoon title="Système" description="Limites gratuites (base, stockage, requêtes, e-mails), dernière sauvegarde, et activation des notifications push sur ce téléphone." prompt="PROMPT 10 (push) et PROMPT 16" alternative="l'état de la flotte est sur le tableau de bord." />;
}
