import { requirePricingRole } from '@/lib/auth/server';
import { db } from '@/lib/data';
import { LOCALES } from '@/lib/constants';
import { deleteExtra, deleteSeason, saveExtra, saveSeason, saveTiers } from '@/lib/actions/admin';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Card, LOCALE_LABEL, Notice, PageTitle, SubmitButton, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function PricingPage({ searchParams }) {
  /* Plan 7.2: an agent may work reservations and checklists, never prices
     or settings. Hiding the nav link is courtesy; this is the guard. */
  await requirePricingRole();
  const { saved } = await searchParams;
  const d = await db();
  const [settings, seasons, extras] = await Promise.all([d.getSettings(), d.listSeasons(), d.listExtras()]);
  const tiers = settings.pricingTiers || [];

  return (
    <>
      <PageTitle title="Tarifs & saisons" description="Multiplicateurs saisonniers, remises longue durée, options et frais de livraison." />
      {saved ? <Notice>Paramètres tarifaires enregistrés.</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Remises longue durée & frais">
          <form action={saveTiers} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="contents">
                  <Field label={`Palier ${i + 1} — à partir de (jours)`} htmlFor={`minDays_${i}`}>
                    <Input id={`minDays_${i}`} name={`minDays_${i}`} type="number" defaultValue={tiers[i]?.minDays ?? ''} className="font-latin-sans" />
                  </Field>
                  <Field label="Remise (%)" htmlFor={`discountPct_${i}`}>
                    <Input id={`discountPct_${i}`} name={`discountPct_${i}`} type="number" defaultValue={tiers[i]?.discountPct ?? ''} className="font-latin-sans" />
                  </Field>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Livraison aéroport (MAD)" htmlFor="airportDeliveryFee">
                <Input id="airportDeliveryFee" name="airportDeliveryFee" type="number" defaultValue={settings.airportDeliveryFee ?? 0} className="font-latin-sans" />
              </Field>
              <Field label="Livraison ville (MAD)" htmlFor="cityDeliveryFee">
                <Input id="cityDeliveryFee" name="cityDeliveryFee" type="number" defaultValue={settings.cityDeliveryFee ?? 0} className="font-latin-sans" />
              </Field>
              <Field label="Aller simple (MAD)" htmlFor="oneWayFee">
                <Input id="oneWayFee" name="oneWayFee" type="number" defaultValue={settings.oneWayFee ?? 0} className="font-latin-sans" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['economy', 'suv', 'premium'].map((k) => (
                <Field key={k} label={`Mensuel dès — ${k}`} htmlFor={`monthly_${k}`}>
                  <Input id={`monthly_${k}`} name={`monthly_${k}`} type="number" defaultValue={settings.monthlyFrom?.[k] ?? ''} className="font-latin-sans" />
                </Field>
              ))}
            </div>
            <SubmitButton>Enregistrer</SubmitButton>
          </form>
        </Card>

        <Card title="Saisons (multiplicateur du prix / jour)">
          <Table head={['Saison', 'Du', 'Au', '×', 'Active', '']} className="mb-4">
            {seasons.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2 font-latin-sans text-xs">{s.startDate}</td>
                <td className="px-4 py-2 font-latin-sans text-xs">{s.endDate}</td>
                <td className="px-4 py-2 tnum">{s.multiplier}</td>
                <td className="px-4 py-2">{s.active ? 'Oui' : 'Non'}</td>
                <td className="px-4 py-2 text-end">
                  <form action={deleteSeason}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-xs font-semibold text-danger hover:underline">
                      Supprimer
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
          <form action={saveSeason} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Nom" htmlFor="s-name" className="col-span-2">
              <Input id="s-name" name="name" required placeholder="Été / MRE" />
            </Field>
            <Field label="Du" htmlFor="s-start">
              <Input id="s-start" name="startDate" type="date" required />
            </Field>
            <Field label="Au" htmlFor="s-end">
              <Input id="s-end" name="endDate" type="date" required />
            </Field>
            <Field label="× multiplicateur" htmlFor="s-mult">
              <Input id="s-mult" name="multiplier" type="number" step="0.05" defaultValue="1.2" className="font-latin-sans" />
            </Field>
            <input type="hidden" name="active" value="on" />
            <div className="col-span-2 sm:col-span-5">
              <SubmitButton variant="secondary">+ Ajouter la saison</SubmitButton>
            </div>
          </form>
        </Card>
      </div>

      <Card title="Options (extras)" className="mt-5">
        <Table head={['Clé', 'Nom (FR)', 'Type', 'Prix', 'Active', '']} className="mb-4">
          {extras.map((x) => (
            <tr key={x.id}>
              <td className="px-4 py-2 font-latin-sans text-xs">{x.key}</td>
              <td className="px-4 py-2">{x.name?.fr}</td>
              <td className="px-4 py-2 text-xs">{x.type === 'per_day' ? 'par jour' : 'forfait'}</td>
              <td className="px-4 py-2 tnum">{x.price} MAD</td>
              <td className="px-4 py-2">{x.active ? 'Oui' : 'Non'}</td>
              <td className="px-4 py-2 text-end">
                <form action={deleteExtra}>
                  <input type="hidden" name="id" value={x.id} />
                  <button type="submit" className="text-xs font-semibold text-danger hover:underline">
                    Supprimer
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
        <form action={saveExtra} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Clé" htmlFor="x-key">
            <Input id="x-key" name="key" required placeholder="child_seat" className="font-latin-sans" />
          </Field>
          <Field label="Type" htmlFor="x-type">
            <Select id="x-type" name="type" defaultValue="per_day">
              <option value="per_day">Par jour</option>
              <option value="flat">Forfait</option>
            </Select>
          </Field>
          <Field label="Prix (MAD)" htmlFor="x-price">
            <Input id="x-price" name="price" type="number" required className="font-latin-sans" />
          </Field>
          {LOCALES.map((l) => (
            <Field key={l} label={`Nom ${LOCALE_LABEL[l]}`} htmlFor={`x-name-${l}`} className={l === 'fr' ? 'sm:col-span-3 lg:col-span-3' : ''}>
              <Input id={`x-name-${l}`} name={`name_${l}`} dir={l === 'ar' ? 'rtl' : 'ltr'} required={l === 'fr'} />
            </Field>
          ))}
          <div className="flex items-end">
            <Checkbox id="x-active" name="active" defaultChecked label="Active" />
          </div>
          <div className="sm:col-span-3 lg:col-span-6">
            <SubmitButton variant="secondary">+ Ajouter l’option</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
