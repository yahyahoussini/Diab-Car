import { requireAdmin } from '@/lib/auth/server';

/**
 * A placeholder for a section the navigation already lists but that has not
 * been built yet.
 *
 * It exists because the alternative is worse: the shell links to every section
 * of plan 3, and a link that 404s teaches an operator that the admin is broken.
 * Saying "not yet, here is what it will do, here is where to go meanwhile" is
 * the same honesty the public site applies to unverified facts (rule 11).
 *
 * Delete the route file when the real page lands.
 */
export default async function ComingSoon({ title, description, prompt, alternative }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      <div className="mt-6 rounded-lg border border-border bg-surface-1 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Pas encore disponible</p>
        <p className="mt-3 text-sm text-text-2">{description}</p>
        {prompt ? <p className="mt-3 text-xs text-text-muted">Prévu : {prompt}.</p> : null}
        {alternative ? <p className="mt-4 text-sm text-text-2">En attendant : {alternative}</p> : null}
      </div>
    </div>
  );
}
