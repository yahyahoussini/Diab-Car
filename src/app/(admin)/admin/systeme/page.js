import { getAdminBase, requirePricingRole } from '@/lib/auth/server';
import { dataMode, getSystemMetrics } from '@/lib/data';
import SystemPanel from '@/components/admin/SystemPanel';
import { Notice, PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

/**
 * Observability of the free limits (plan 9.6).
 *
 * Owner and manager only. Not because the numbers are secret, but because this
 * is the page that says when the agency has to start paying for something —
 * the same reason Tarifs and Paramètres are gated (plan 7.2).
 */
export default async function SystemePage() {
  await requirePricingRole();
  const base = await getAdminBase();

  /* system_metrics() reads pg_class and storage.objects behind `is_staff()`.
     If it is refused or the migration has not been applied yet, the page still
     has to load and say why — a 500 on the page whose job is to warn you about
     the infrastructure would be a poor joke. */
  let metrics = null;
  let error = null;
  try {
    metrics = await getSystemMetrics();
    if (!metrics) error = 'EMPTY';
  } catch (err) {
    error = err?.code || err?.message || 'ERREUR';
  }

  return (
    <>
      <PageTitle
        title="Système"
        description="Ce que l’architecture gratuite consomme réellement : taille de la base, fichiers stockés, compteurs, sauvegarde. Les chiffres non lisibles depuis l’application sont nommés, pas devinés."
      />

      {error ? (
        <Notice tone="warning">
          Les mesures n’ont pas pu être lues{error === 'EMPTY' ? '' : ` (${error})`}.{' '}
          {dataMode() === 'supabase'
            ? 'Vérifiez que la migration 0012 est appliquée et que ce compte a bien un rôle staff.'
            : 'Aucune source de mesures en mode démo.'}
        </Notice>
      ) : (
        <SystemPanel metrics={metrics} base={base} />
      )}
    </>
  );
}
