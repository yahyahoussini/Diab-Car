'use client';

import { useActionState } from 'react';
import { saveSettings } from '@/lib/actions/admin';
import { LOCALES } from '@/lib/constants';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { Card, LOCALE_LABEL, Notice, SubmitButton } from '@/components/admin/ui';

const DAYS = [['mon', 'Lun'], ['tue', 'Mar'], ['wed', 'Mer'], ['thu', 'Jeu'], ['fri', 'Ven'], ['sat', 'Sam'], ['sun', 'Dim']];

export default function SettingsForm({ settings }) {
  const [state, action, pending] = useActionState(saveSettings, null);
  const s = settings;
  const main = (s.hours || [])[0] || { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], opens: '08:00', closes: '20:00' };
  return (
    <form action={action} className="space-y-5">
      {state?.ok ? <Notice>Paramètres enregistrés — le site est régénéré.</Notice> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Identité (NAP — doit être identique sur Google Business Profile)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom commercial" htmlFor="name">
              <Input id="name" name="name" defaultValue={s.name} />
            </Field>
            <Field label="Raison sociale" htmlFor="legalName">
              <Input id="legalName" name="legalName" defaultValue={s.legalName} />
            </Field>
            <Field label="Adresse" htmlFor="addressLine" className="sm:col-span-2">
              <Input id="addressLine" name="addressLine" defaultValue={s.addressLine} />
            </Field>
            <Field label="Ville" htmlFor="city">
              <Input id="city" name="city" defaultValue={s.city} />
            </Field>
            <Field label="Code postal" htmlFor="postalCode">
              <Input id="postalCode" name="postalCode" defaultValue={s.postalCode} className="font-latin-sans" />
            </Field>
            <Field label="Latitude" htmlFor="lat">
              <Input id="lat" name="lat" type="number" step="0.000001" defaultValue={s.lat} className="font-latin-sans" />
            </Field>
            <Field label="Longitude" htmlFor="lng">
              <Input id="lng" name="lng" type="number" step="0.000001" defaultValue={s.lng} className="font-latin-sans" />
            </Field>
            <Field label="Lien Google Maps (itinéraire)" htmlFor="googleMapsUrl" className="sm:col-span-2">
              <Input id="googleMapsUrl" name="googleMapsUrl" defaultValue={s.googleMapsUrl} className="font-latin-sans" />
            </Field>
            <Field label="Lien Google Business Profile (avis)" htmlFor="gbpUrl" className="sm:col-span-2" hint="https://g.page/r/…/review">
              <Input id="gbpUrl" name="gbpUrl" defaultValue={s.gbpUrl} className="font-latin-sans" />
            </Field>
          </div>
        </Card>

        <Card title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone principal (E.164)" htmlFor="phonePrimary">
              <Input id="phonePrimary" name="phonePrimary" defaultValue={s.phonePrimary} className="font-latin-sans" placeholder="+2126…" />
            </Field>
            <Field label="WhatsApp (E.164)" htmlFor="whatsapp">
              <Input id="whatsapp" name="whatsapp" defaultValue={s.whatsapp} className="font-latin-sans" />
            </Field>
            <Field label="Téléphone secondaire" htmlFor="phoneSecondary">
              <Input id="phoneSecondary" name="phoneSecondary" defaultValue={s.phoneSecondary} className="font-latin-sans" />
            </Field>
            <Field label="Fixe" htmlFor="phoneLandline">
              <Input id="phoneLandline" name="phoneLandline" defaultValue={s.phoneLandline} className="font-latin-sans" />
            </Field>
            <Field label="E-mail" htmlFor="email" className="sm:col-span-2">
              <Input id="email" name="email" type="email" defaultValue={s.email} className="font-latin-sans" />
            </Field>
            <Field label="Facebook" htmlFor="facebookUrl" className="sm:col-span-2">
              <Input id="facebookUrl" name="facebookUrl" defaultValue={s.facebookUrl} className="font-latin-sans" />
            </Field>
            <Field label="Instagram" htmlFor="instagramUrl">
              <Input id="instagramUrl" name="instagramUrl" defaultValue={s.instagramUrl} className="font-latin-sans" />
            </Field>
            <Field label="TikTok" htmlFor="tiktokUrl">
              <Input id="tiktokUrl" name="tiktokUrl" defaultValue={s.tiktokUrl} className="font-latin-sans" />
            </Field>
          </div>
        </Card>

        <Card title="Horaires">
          <div className="flex flex-wrap gap-3">
            {DAYS.map(([k, label]) => (
              <Checkbox key={k} id={`open_${k}`} name={`open_${k}`} defaultChecked={main.days.includes(k)} label={label} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Ouverture" htmlFor="opens">
              <Input id="opens" name="opens" type="time" defaultValue={main.opens} />
            </Field>
            <Field label="Fermeture" htmlFor="closes">
              <Input id="closes" name="closes" type="time" defaultValue={main.closes} />
            </Field>
          </div>
          <div className="mt-4">
            <Checkbox id="airportService24h" name="airportService24h" defaultChecked={Boolean(s.airportService24h)} label="Livraison aéroport 24h/24" />
          </div>
        </Card>

        <Card title="Légal, conversion & intégrations">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="RC Casablanca" htmlFor="rc">
              <Input id="rc" name="rc" defaultValue={s.rc} className="font-latin-sans" />
            </Field>
            <Field label="ICE" htmlFor="ice">
              <Input id="ice" name="ice" defaultValue={s.ice} className="font-latin-sans" />
            </Field>
            <Field label="Capital (MAD)" htmlFor="capitalMad">
              <Input id="capitalMad" name="capitalMad" type="number" defaultValue={s.capitalMad} className="font-latin-sans" />
            </Field>
            <Field label="Année de création" htmlFor="foundedYear">
              <Input id="foundedYear" name="foundedYear" type="number" defaultValue={s.foundedYear} className="font-latin-sans" />
            </Field>
            <Field label="Taux EUR (MAD pour 1 €)" htmlFor="eurRate">
              <Input id="eurRate" name="eurRate" type="number" step="0.01" defaultValue={s.eurRate} className="font-latin-sans" />
            </Field>
            <Field label="Âge minimum par défaut" htmlFor="minAge">
              <Input id="minAge" name="minAge" type="number" defaultValue={s.minAge} className="font-latin-sans" />
            </Field>
            <Field label="Libération caution (jours)" htmlFor="depositReleaseDays">
              <Input id="depositReleaseDays" name="depositReleaseDays" type="number" defaultValue={s.depositReleaseDays} className="font-latin-sans" />
            </Field>
            <Field label="Google Analytics 4 (G-…)" htmlFor="gaId">
              <Input id="gaId" name="gaId" defaultValue={s.gaId} className="font-latin-sans" />
            </Field>
            <Field label="Clé IndexNow (Bing)" htmlFor="indexNowKey" className="sm:col-span-2" hint="32 caractères hexadécimaux, générée sur bing.com/indexnow">
              <Input id="indexNowKey" name="indexNowKey" defaultValue={s.indexNowKey} className="font-latin-sans" />
            </Field>
          </div>
        </Card>
      </div>

      <Card title="Slogan (schema.org description)">
        <div className="grid gap-4 sm:grid-cols-2">
          {LOCALES.map((l) => (
            <Field key={l} label={LOCALE_LABEL[l]} htmlFor={`tagline_${l}`}>
              <Input id={`tagline_${l}`} name={`tagline_${l}`} dir={l === 'ar' ? 'rtl' : 'ltr'} defaultValue={s.tagline?.[l] || ''} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer les paramètres'}</SubmitButton>
      </div>
    </form>
  );
}
