import { db } from '@/lib/data';
import SettingsForm from '@/components/admin/SettingsForm';
import { PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await (await db()).getSettingsAdmin();
  return (
    <>
      <PageTitle title="Paramètres" description="Identité, contact, horaires, intégrations. Ces données alimentent le pied de page, les pages légales et le balisage schema.org." />
      <SettingsForm settings={settings} />
    </>
  );
}
