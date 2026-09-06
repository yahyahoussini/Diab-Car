'use client';

import { useActionState } from 'react';
import { saveVehicle } from '@/lib/actions/admin';
import { CAR_IMAGES, CATEGORIES, FEATURES, FUELS, LOCALES, TRANSMISSIONS } from '@/lib/constants';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, LOCALE_LABEL, Notice, SubmitButton } from '@/components/admin/ui';

const CAT = { economy: 'Citadine', compact: 'Compacte', sedan: 'Berline', suv: 'SUV & 4x4', premium: 'Premium', luxury: 'Luxe', van: 'Van & minibus' };
const FEAT = { ac: 'Climatisation', bluetooth: 'Bluetooth', apple_carplay: 'CarPlay / Android Auto', usb: 'USB', camera: 'Caméra de recul', cruise: 'Régulateur', led: 'Phares LED', parking_sensors: 'Capteurs de stationnement', isofix: 'ISOFIX', leather: 'Cuir', sunroof: 'Toit panoramique', '4wd': 'Intégrale', hybrid: 'Hybride', massage: 'Sièges massants', sport: 'Châssis sport', gps: 'GPS' };

export default function VehicleForm({ vehicle = {}, saved = false }) {
  const [state, action, pending] = useActionState(saveVehicle, null);
  const v = vehicle;
  return (
    <form action={action} className="space-y-5">
      {saved ? <Notice>Véhicule enregistré.</Notice> : null}
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="id" value={v.id || ''} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Identité" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Marque" htmlFor="brand">
              <Input id="brand" name="brand" required defaultValue={v.brand} />
            </Field>
            <Field label="Modèle" htmlFor="model">
              <Input id="model" name="model" required defaultValue={v.model} />
            </Field>
            <Field label="Année" htmlFor="year">
              <Input id="year" name="year" type="number" required defaultValue={v.year || new Date().getFullYear()} />
            </Field>
            <Field label="Slug (URL)" htmlFor="slug" hint="vide = auto">
              <Input id="slug" name="slug" defaultValue={v.slug} className="font-latin-sans" />
            </Field>
            <Field label="Catégorie" htmlFor="category">
              <Select id="category" name="category" defaultValue={v.category || 'economy'}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CAT[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Illustration" htmlFor="image" hint="si aucune photo">
              <Select id="image" name="image" defaultValue={v.image || 'berline'}>
                {CAR_IMAGES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Boîte" htmlFor="transmission">
              <Select id="transmission" name="transmission" defaultValue={v.transmission || 'manual'}>
                {TRANSMISSIONS.map((c) => (
                  <option key={c} value={c}>
                    {c === 'manual' ? 'Manuelle' : 'Automatique'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Carburant" htmlFor="fuel">
              <Select id="fuel" name="fuel" defaultValue={v.fuel || 'diesel'}>
                {FUELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Places" htmlFor="seats">
              <Input id="seats" name="seats" type="number" defaultValue={v.seats || 5} />
            </Field>
            <Field label="Portes" htmlFor="doors">
              <Input id="doors" name="doors" type="number" defaultValue={v.doors || 5} />
            </Field>
            <Field label="Bagages" htmlFor="luggage">
              <Input id="luggage" name="luggage" type="number" defaultValue={v.luggage || 2} />
            </Field>
            <Field label="Ordre d’affichage" htmlFor="sortOrder">
              <Input id="sortOrder" name="sortOrder" type="number" defaultValue={v.sortOrder ?? 100} />
            </Field>
          </div>
        </Card>

        <Card title="Tarif & conditions">
          <div className="grid gap-4">
            <Field label="Prix par jour (MAD)" htmlFor="pricePerDay">
              <Input id="pricePerDay" name="pricePerDay" type="number" required defaultValue={v.pricePerDay} className="font-latin-sans" />
            </Field>
            <Field label="Caution (MAD)" htmlFor="deposit">
              <Input id="deposit" name="deposit" type="number" required defaultValue={v.deposit} className="font-latin-sans" />
            </Field>
            <Field label="Km / jour" htmlFor="mileageLimit" hint="0 = illimité">
              <Input id="mileageLimit" name="mileageLimit" type="number" defaultValue={v.mileageLimit || 0} className="font-latin-sans" />
            </Field>
            <Field label="Âge minimum" htmlFor="minAge">
              <Input id="minAge" name="minAge" type="number" defaultValue={v.minAge || 21} className="font-latin-sans" />
            </Field>
            <Checkbox id="published" name="published" defaultChecked={Boolean(v.published)} label="Publié sur le site" />
            <Checkbox id="featured" name="featured" defaultChecked={Boolean(v.featured)} label="Mis en avant (accueil)" />
          </div>
        </Card>
      </div>

      <Card title="Photos" >
        <Field label="URLs des photos (une par ligne)" htmlFor="images" hint="Supabase Storage, Cloudinary… la première est l’image principale">
          <Textarea id="images" name="images" defaultValue={(v.images || []).join('\n')} className="font-latin-sans text-sm" />
        </Field>
      </Card>

      <Card title="Équipements">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Checkbox key={f} id={`feature_${f}`} name={`feature_${f}`} defaultChecked={(v.features || []).includes(f)} label={FEAT[f]} />
          ))}
        </div>
      </Card>

      <Card title="Description (4 langues)">
        <div className="grid gap-4 lg:grid-cols-2">
          {LOCALES.map((l) => (
            <Field key={l} label={LOCALE_LABEL[l]} htmlFor={`description_${l}`}>
              <Textarea id={`description_${l}`} name={`description_${l}`} dir={l === 'ar' ? 'rtl' : 'ltr'} defaultValue={v.description?.[l] || ''} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <SubmitButton disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</SubmitButton>
      </div>
    </form>
  );
}
