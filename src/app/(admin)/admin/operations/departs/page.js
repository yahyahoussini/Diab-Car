import ComingSoon from '@/components/admin/ComingSoon';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ComingSoon title="Départs" description="Checklist de prise en charge : identité, documents, état des lieux, kilométrage, carburant, photos, signature." prompt="PROMPT 12" alternative="le tableau de bord liste les départs du jour." />;
}
