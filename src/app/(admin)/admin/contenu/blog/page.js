import Link from 'next/link';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { listPosts } from '@/lib/data';
import { removePost } from '@/lib/actions/content';
import { formatDate } from '@/lib/format';
import { AdminLink, PageTitle } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Blog' };

/**
 * The article list (plan 7.1).
 *
 * Writing happens in the editor at `/contenu/blog/[id]`; this page only has to
 * answer "what exists, what is live, what needs finishing" at a glance — hence
 * the status dot ahead of the title rather than a word in a column (plan 7.3).
 *
 * Deleting takes two screens on purpose, and both of them are plain links and
 * a form: `?supprimer=<id>` renders the confirmation, the form does the write.
 * That keeps the whole page a Server Component, and it means the confirmation
 * survives a reload — an operator who came back to the tab an hour later sees
 * the same question, not a half-finished gesture.
 */
export default async function BlogListPage({ searchParams }) {
  await requireAdmin();
  const base = await getAdminBase();
  const sp = await searchParams;

  const pendingId = typeof sp?.supprimer === 'string' ? sp.supprimer : '';
  const posts = await listPosts({ asStaff: true }).catch(() => []);
  const pending = posts.find((p) => p.id === pendingId) || null;

  return (
    <>
      <PageTitle
        title="Guide / Blog"
        description="Articles « réponse directe » : deux phrases qui répondent, puis des sections courtes avec des chiffres."
        actions={<AdminLink href={`${base}/contenu/blog/new`}>+ Nouvel article</AdminLink>}
      />

      {pendingId && !pending ? (
        <p role="status" className="mb-5 rounded-lg bg-success-soft px-4 py-3 text-sm font-medium text-success">
          Cet article n’est plus dans la liste.
        </p>
      ) : null}

      {pending ? (
        <div className="mb-5 rounded-lg border border-danger bg-danger-soft/20 p-4" data-testid="post-delete-confirm">
          <p className="text-sm text-text">
            Supprimer <span className="font-semibold">{pending.title?.fr || pending.slug}</span> ? L’article et ses quatre traductions
            disparaissent du site. Irréversible.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* The id is bound on the server, so the form carries no field a
                page could rewrite; removePost ignores the FormData React adds
                as its second argument. */}
            <form action={removePost.bind(null, { id: pending.id })}>
              <button type="submit" className="rounded-lg border border-danger px-4 py-2 text-sm font-semibold text-danger">
                Supprimer définitivement
              </button>
            </form>
            <Link href={`${base}/contenu/blog`} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
              Annuler
            </Link>
          </div>
        </div>
      ) : null}

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">
          Aucun article. Le premier utile est celui qui répond à la question que l’on vous pose le plus : documents, âge, permis.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm" data-testid="posts-table">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                <th scope="col" className="px-3 py-2 text-start font-semibold">Titre (FR)</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Adresse</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Publié le</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">Tags</th>
                <th scope="col" className="px-3 py-2 text-end font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => {
                const tags = Array.isArray(post.tags) ? post.tags : [];
                return (
                  <tr key={post.id} className="border-b border-border align-top transition-colors hover:bg-surface-2" data-post={post.id}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-baseline gap-2">
                        <span
                          aria-hidden="true"
                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${post.published ? 'bg-success' : 'bg-text-muted'}`}
                        />
                        <Link href={`${base}/contenu/blog/${post.id}`} className="font-semibold text-text hover:underline">
                          {post.title?.fr || <span className="text-warning">Sans titre en français</span>}
                        </Link>
                      </span>
                      <span className="ms-3.5 mt-0.5 block text-[11px] text-text-muted">{post.published ? 'Publié' : 'Brouillon'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-latin-sans text-xs text-text-muted">/blog/{post.slug}</span>
                    </td>
                    <td className="tnum px-3 py-2.5 text-xs text-text-2">{post.publishedAt ? formatDate(post.publishedAt, 'fr') : '—'}</td>
                    <td className="px-3 py-2.5">
                      {tags.length === 0 ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-2">
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <span className="flex justify-end gap-3">
                        <Link href={`${base}/contenu/blog/${post.id}`} className="text-xs font-semibold text-text-2 hover:text-text">
                          Modifier
                        </Link>
                        <Link
                          href={`${base}/contenu/blog?supprimer=${post.id}`}
                          className="text-xs font-semibold text-danger hover:underline"
                        >
                          Supprimer
                        </Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
