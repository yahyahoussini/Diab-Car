import { cookies, headers } from 'next/headers';
import { ADMIN_COOKIE, claimsAreAdmin, isSupabaseConfigured, verifyDemoToken } from '@/lib/auth/session';

/** Base path for admin links: '' on admin.diabcar.ma, '/admin' on localhost. */
export async function getAdminBase() {
  const h = await headers();
  const base = h.get('x-admin-base');
  return base === null ? '/admin' : base;
}

/** Current admin session ({ email, mode }) or null. Works in RSC and Server Actions. */
export async function getAdminSession() {
  if (isSupabaseConfigured()) {
    const { createSessionClient } = await import('@/lib/supabase/server');
    const sb = await createSessionClient();
    const { data } = await sb.auth.getClaims();
    const claims = data?.claims;
    return claimsAreAdmin(claims) ? { email: claims.email, mode: 'supabase' } : null;
  }
  const store = await cookies();
  return verifyDemoToken(store.get(ADMIN_COOKIE)?.value);
}

/** Throws when the caller is not an authenticated admin (use in every Server Action). */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}
