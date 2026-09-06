import Link from 'next/link';
import { db } from '@/lib/data';
import { LOCALES } from '@/lib/constants';
import { getAdminBase } from '@/lib/auth/server';
import { deleteFaq, saveFaq } from '@/lib/actions/admin';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { AdminLink, Card, LOCALE_LABEL, PageTitle, SubmitButton, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const CATS = { conditions: 'Conditions', payment: 'Paiement & caution', delivery: 'Livraison & restitution', insurance: 'Assurance', longterm: 'Longue durée', general: 'Général' };

export default async function FaqAdminPage({ searchParams }) {
  const { edit } = await searchParams;
  const base = await getAdminBase();
  const faqs = await (await db()).listFaqs({});
  const current = edit === 'new' ? {} : faqs.find((f) => f.id === edit);

  return (
    <>
      <PageTitle title="FAQ" description="Chaque réponse est un bloc « answer-first » repris par Google et les moteurs IA. 40 à 60 mots, factuel." actions={<AdminLink href={`${base}/contenu/faq?edit=new`}>+ Nouvelle question</AdminLink>} />

      {current ? (
        <Card title={current.id ? 'Modifier la question' : 'Nouvelle question'} className="mb-6">
          <form action={saveFaq} className="space-y-4">
            <input type="hidden" name="id" value={current.id || ''} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Catégorie" htmlFor="f-cat">
                <Select id="f-cat" name="category" defaultValue={current.category || 'general'}>
                  {Object.entries(CATS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ordre" htmlFor="f-order">
                <Input id="f-order" name="sortOrder" type="number" defaultValue={current.sortOrder ?? 100} className="font-latin-sans" />
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox id="f-pub" name="published" defaultChecked={current.published ?? true} label="Publiée" />
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {LOCALES.map((l) => (
                <div key={l} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">{LOCALE_LABEL[l]}</div>
                  <Input name={`question_${l}`} dir={l === 'ar' ? 'rtl' : 'ltr'} placeholder="Question" defaultValue={current.question?.[l] || ''} required={l === 'fr'} />
                  <Textarea name={`answer_${l}`} dir={l === 'ar' ? 'rtl' : 'ltr'} placeholder="Réponse (40–60 mots)" defaultValue={current.answer?.[l] || ''} required={l === 'fr'} />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <SubmitButton>Enregistrer</SubmitButton>
              <AdminLink href={`${base}/contenu/faq`} variant="secondary">
                Annuler
              </AdminLink>
            </div>
          </form>
        </Card>
      ) : null}

      <Table head={['Ordre', 'Question (FR)', 'Catégorie', 'Statut', '']}>
        {faqs.map((f) => (
          <tr key={f.id} className="hover:bg-surface-2/50">
            <td className="px-4 py-3 tnum text-text-muted">{f.sortOrder}</td>
            <td className="px-4 py-3 font-medium text-text">{f.question?.fr}</td>
            <td className="px-4 py-3 text-xs">{CATS[f.category] || f.category}</td>
            <td className="px-4 py-3 text-xs">{f.published ? 'Publiée' : 'Brouillon'}</td>
            <td className="px-4 py-3 text-end">
              <div className="flex justify-end gap-3">
                <Link href={`${base}/contenu/faq?edit=${f.id}`} className="text-xs font-semibold text-accent hover:underline">
                  Modifier
                </Link>
                <form action={deleteFaq}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="text-xs font-semibold text-danger hover:underline">
                    Supprimer
                  </button>
                </form>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
