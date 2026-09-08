import ComingSoon from '@/components/admin/ComingSoon';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <ComingSoon title="Calendrier" description="Un Gantt horizontal par unité (jour, semaine, mois), avec déplacement des dates par glisser-déposer et vérification des conflits avant enregistrement." prompt="PROMPT 11" alternative="la liste des réservations montre les mêmes dates." />;
}
