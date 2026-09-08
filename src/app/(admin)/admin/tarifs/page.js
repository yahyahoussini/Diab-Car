import Link from 'next/link';
import { getAdminBase, requirePricingRole } from '@/lib/auth/server';
import { getSettingsAdmin, listExtras, listLocations, listSeasons } from '@/lib/data';
import { todayISO } from '@/lib/format';
import { PageTitle } from '@/components/admin/ui';
import PricingEditor from '@/components/admin/PricingEditor';
import LocationsEditor from '@/components/admin/LocationsEditor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tarifs' };

export default async function PricingPage() {
  /* Plan 7.2: an agent works reservations and checklists, never money. Hiding
     the nav link is courtesy — this is the guard, and it also catches the
     typed URL. */
  await requirePricingRole();

  const [base, settings, seasons, extras, locations] = await Promise.all([
    getAdminBase(),
    getSettingsAdmin(),
    listSeasons(),
    listExtras(),
    /* `all: true` — a place switched off has to stay visible here, or it can
       never be switched back on. */
    listLocations({ all: true }),
  ]);

  /* The clock is read ONCE, here, and passed down as a string. A client
     component that called new Date() while rendering would be a React
     Compiler error and a hydration mismatch at the same time. */
  const today = todayISO();

  return (
    <>
      <PageTitle
        title="Tarifs"
        description="Saisons, paliers de remise, options, cautions, lieux et frais. Tout ce qui est ici est repris dans chaque devis du site."
      />

      <p className="mb-6 max-w-3xl text-sm text-text-2">
        Chaque enregistrement de cette page exige un <strong className="font-semibold text-text">motif</strong> : il est écrit dans le{' '}
        <Link href={`${base}/journal`} className="font-semibold text-text underline underline-offset-2 hover:text-red-signal">
          Journal
        </Link>{' '}
        avec l’avant / après et votre nom, dans la même transaction que la modification. La base refuse un motif vide.
      </p>

      <PricingEditor settings={settings} seasons={seasons} extras={extras} today={today} />
      <LocationsEditor locations={locations} settings={settings} />
    </>
  );
}
