import { db } from '@/lib/data';
import { getAdminBase } from '@/lib/auth/server';
import { formatDate } from '@/lib/format';
import { AdminLink, PageTitle, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function BlogAdminPage() {
  const base = await getAdminBase();
  const posts = await (await db()).listPosts({});
  return (
    <>
      <PageTitle title="Guide / Blog" description="Articles « réponse directe » qui alimentent Google, Bing Copilot, ChatGPT et Perplexity." actions={<AdminLink href={`${base}/contenu/blog/new`}>+ Nouvel article</AdminLink>} />
      <Table head={['Titre (FR)', 'Slug', 'Publié le', 'Statut', '']}>
        {posts.map((p) => (
          <tr key={p.id} className="hover:bg-surface-2/50">
            <td className="px-4 py-3 font-medium text-text">{p.title?.fr}</td>
            <td className="px-4 py-3 font-latin-sans text-xs text-text-muted">/{p.slug}</td>
            <td className="px-4 py-3 text-xs">{formatDate(p.publishedAt)}</td>
            <td className="px-4 py-3 text-xs">{p.published ? 'Publié' : 'Brouillon'}</td>
            <td className="px-4 py-3 text-end">
              <AdminLink href={`${base}/contenu/blog/${p.id}`} variant="secondary" className="h-8 px-3 text-xs">
                Modifier
              </AdminLink>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
