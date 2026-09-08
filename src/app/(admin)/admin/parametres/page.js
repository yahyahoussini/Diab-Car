import { requirePricingRole } from '@/lib/auth/server';
import { db } from '@/lib/data';
import SettingsForm from '@/components/admin/SettingsForm';
import { PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  /* Plan 7.2: an agent may work reservations and checklists, never prices
     or settings. Hiding the nav link is courtesy; this is the guard. */
  await requirePricingRole();
  const settings = await (await db()).getSettingsAdmin();
  return (
    <>
      <PageTitle title="Paramètres" description="Identité, contact, horaires, intégrations. Ces données alimentent le pied de page, les pages légales et le balisage schema.org." />
      <SettingsForm settings={settings} />
    </>
  );
}
