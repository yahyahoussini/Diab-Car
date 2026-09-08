import { requirePricingRole } from '@/lib/auth/server';
import { dataMode, getSettingsAdmin } from '@/lib/data';
import SettingsEditor from '@/components/admin/SettingsEditor';
import { PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  /* Plan 7.2: an agent may work reservations and checklists, never prices or
     settings. Hiding the nav link is courtesy; this is the guard that survives
     someone typing the URL. */
  await requirePricingRole();

  /* The FULL row, not the public view: the admin has to see an unverified
     rating in order to verify it, and `public_settings` deliberately nulls it. */
  const settings = await getSettingsAdmin();

  return (
    <>
      <PageTitle
        title="Paramètres"
        description="Ce que le site affirme sur Diab Car : identité, horaires, mentions légales, chiffres vérifiés, délais d’exploitation. Chaque section s’enregistre seule, avec un motif conservé au journal."
      />
      <SettingsEditor settings={settings} mode={dataMode()} />
    </>
  );
}
