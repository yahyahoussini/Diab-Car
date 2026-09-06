import { db } from '@/lib/data';
import { deleteReview, saveReview } from '@/lib/actions/admin';
import { formatDate } from '@/lib/format';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, PageTitle, SubmitButton, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function ReviewsAdminPage() {
  const d = await db();
  const [reviews, vehicles] = await Promise.all([d.listReviews({}), d.listVehicles({})]);
  return (
    <>
      <PageTitle title="Avis clients" description="Copiez ici vos vrais avis Google (nom, note, texte). Les avis « exemple » du thème sont à supprimer une fois les vrais avis en place." />
      <Card title="Ajouter un avis" className="mb-6">
        <form action={saveReview} className="grid gap-3 sm:grid-cols-6">
          <Field label="Nom affiché" htmlFor="r-name" className="sm:col-span-2">
            <Input id="r-name" name="authorName" required placeholder="Yassine B." />
          </Field>
          <Field label="Note" htmlFor="r-rating">
            <Select id="r-rating" name="rating" defaultValue="5">
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} ★
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Langue" htmlFor="r-lang">
            <Select id="r-lang" name="lang" defaultValue="fr">
              {['fr', 'en', 'ar', 'es'].map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" htmlFor="r-source">
            <Select id="r-source" name="source" defaultValue="google">
              <option value="google">Google</option>
              <option value="website">Site</option>
              <option value="facebook">Facebook</option>
            </Select>
          </Field>
          <Field label="Véhicule (optionnel)" htmlFor="r-vehicle">
            <Select id="r-vehicle" name="vehicleId" defaultValue="">
              <option value="">—</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Texte de l’avis" htmlFor="r-text" className="sm:col-span-5">
            <Textarea id="r-text" name="text" required className="min-h-20" />
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <Checkbox id="r-pub" name="published" defaultChecked label="Publié" />
            <SubmitButton>Ajouter</SubmitButton>
          </div>
        </form>
      </Card>
      <Table head={['Auteur', 'Note', 'Langue', 'Texte', 'Date', 'Statut', '']}>
        {reviews.map((r) => (
          <tr key={r.id} className="hover:bg-surface-2/50">
            <td className="px-4 py-3 font-medium text-text">{r.authorName}</td>
            <td className="px-4 py-3 text-accent">{'★'.repeat(r.rating)}</td>
            <td className="px-4 py-3 text-xs">{r.lang?.toUpperCase()}</td>
            <td className="max-w-md px-4 py-3 text-xs text-text-2" dir={r.lang === 'ar' ? 'rtl' : 'ltr'}>
              {r.text}
            </td>
            <td className="px-4 py-3 text-xs">{formatDate(r.createdAt)}</td>
            <td className="px-4 py-3 text-xs">
              {r.published ? 'Publié' : 'Masqué'}
              {r.isSample ? <span className="ms-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">EXEMPLE</span> : null}
            </td>
            <td className="px-4 py-3 text-end">
              <form action={deleteReview}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="text-xs font-semibold text-danger hover:underline">
                  Supprimer
                </button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
