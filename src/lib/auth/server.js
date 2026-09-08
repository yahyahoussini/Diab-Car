import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, canManagePricing, claimsAreAdmin, isSupabaseConfigured, roleAllows, roleFromClaims, verifyDemoToken } from '@/lib/auth/session';

/** Base path for admin links: '' on admin.diabcar.ma, '/admin' on localhost. */
export async function getAdminBase() {
  const h = await headers();
  const base = h.get('x-admin-base');
  return base === null ? '/admin' : base;
}

/**
 * Current admin session, or null.
 *
 * `{ email, role, mode }` — the role comes from the `user_role` JWT claim that
 * `custom_access_token_hook` copies out of `profiles.role`, so the UI and the
 * RLS policies read the same authority and cannot disagree about who someone
 * is (plan 7.2).
 *
 * Demo mode has no roles to read, so it is `owner`: with no Supabase there is
 * no database to protect, and a demo that hid half its own navigation would
 * teach the wrong thing.
 */
export async function getAdminSession() {
  if (isSupabaseConfigured()) {
    const { createSessionClient } = await import('@/lib/supabase/server');
    const sb = await createSessionClient();
    const { data } = await sb.auth.getClaims();
    const claims = data?.claims;
    if (!claimsAreAdmin(claims)) return null;
    return { email: claims.email, role: roleFromClaims(claims), mode: 'supabase' };
  }

  const store = await cookies();
  const demo = await verifyDemoToken(store.get(ADMIN_COOKIE)?.value);
  return demo ? { ...demo, role: 'owner' } : null;
}

/** Throws when the caller is not an authenticated admin (use in every Server Action). */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

/**
 * Server Action guard: throws unless the caller holds one of `allowed`.
 *
 * Throwing rather than redirecting is deliberate here — an action has no page
 * to send anyone to, and a silent no-op would look like the write succeeded.
 *
 * @param {string[]} allowed
 */
export async function requireRole(allowed) {
  const session = await requireAdmin();
  if (!roleAllows(session.role, allowed)) throw new Error('FORBIDDEN');
  return session;
}

/**
 * Page guard: redirects to the dashboard when the role is not allowed.
 *
 * This is the SERVER-SIDE half of hiding a route. The navigation also omits
 * links an agent may not use, but navigation is a convenience — typing the URL
 * has to fail too, or the restriction is decoration (plan 7.2).
 *
 * @param {string[]} allowed
 */
export async function requirePageRole(allowed) {
  const session = await getAdminSession();
  const base = await getAdminBase();
  if (!session) redirect(`${base}/login`);
  if (!roleAllows(session.role, allowed)) redirect(`${base}/`);
  return session;
}

/** Convenience for the two money-touching areas: prices and settings. */
export async function requirePricingRole() {
  const session = await getAdminSession();
  const base = await getAdminBase();
  if (!session) redirect(`${base}/login`);
  if (!canManagePricing(session.role)) redirect(`${base}/`);
  return session;
}
