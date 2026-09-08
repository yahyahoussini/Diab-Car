import ComingSoon from '@/components/admin/ComingSoon';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ComingSoon title="Retours" description="Checklist de restitution : kilométrage, carburant, dommages, photos, signature, puis passage automatique en nettoyage." prompt="PROMPT 12" alternative="le tableau de bord liste les retours du jour." />;
}
