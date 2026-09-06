'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, claimsAreAdmin, createDemoToken, demoPassword, isSupabaseConfigured } from '@/lib/auth/session';
import { getAdminBase } from '@/lib/auth/server';

const secure = process.env.NODE_ENV === 'production';

export async function login(prevState, formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const base = await getAdminBase();
  const next = String(formData.get('next') || '') || `${base}/`;

  if (isSupabaseConfigured()) {
    const { createSessionClient } = await import('@/lib/supabase/server');
    const sb = await createSessionClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: 'Identifiants incorrects.' };
    const { data } = await sb.auth.getClaims();
    if (!claimsAreAdmin(data?.claims)) {
      await sb.auth.signOut();
      return { error: 'Ce compte n’a pas le rôle administrateur.' };
    }
    redirect(next);
  }

  // Demo mode: single shared password, HMAC-signed cookie.
  if (!email || password !== demoPassword()) return { error: 'Identifiants incorrects (mode démo : mot de passe « diabcar-demo »).' };
  const token = await createDemoToken(email, 7);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 7 * 86400 });
  redirect(next);
}

export async function logout() {
  const base = await getAdminBase();
  if (isSupabaseConfigured()) {
    const { createSessionClient } = await import('@/lib/supabase/server');
    const sb = await createSessionClient();
    await sb.auth.signOut();
  } else {
    const store = await cookies();
    store.delete(ADMIN_COOKIE);
  }
  redirect(`${base}/login`);
}
