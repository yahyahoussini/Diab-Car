import { notFound } from 'next/navigation';
import { db } from '@/lib/data';
import { getAdminBase } from '@/lib/auth/server';
import { deletePost } from '@/lib/actions/admin';
import PostForm from '@/components/admin/PostForm';
import { AdminLink, PageTitle, SubmitButton } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function PostEditPage({ params, searchParams }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const base = await getAdminBase();
  const isNew = id === 'new';
  const post = isNew ? {} : await (await db()).getPostById(id);
  if (!post) notFound();
  return (
    <>
      <PageTitle
        title={isNew ? 'Nouvel article' : post.title?.fr}
        description={isNew ? 'Structure recommandée : réponse en 2 phrases, puis ## sections courtes avec chiffres.' : `/${post.slug}`}
        actions={
          <>
            <AdminLink href={`${base}/contenu/blog`} variant="secondary">
              ← Articles
            </AdminLink>
            {!isNew ? (
              <form action={deletePost}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton variant="danger">Supprimer</SubmitButton>
              </form>
            ) : null}
          </>
        }
      />
      <PostForm post={post} saved={saved === '1'} />
    </>
  );
}
