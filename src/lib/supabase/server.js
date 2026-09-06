import { createServerClient } from '@supabase/ssr';
import { createClient as createBaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseKey } from '@/lib/auth/session';

/** Session-aware client for Server Components / Server Actions (RLS applies). */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by the proxy instead.
        }
      },
    },
  });
}

/** Anonymous client for public reads (published rows only, enforced by RLS). */
let publicClient;
export function createPublicClient() {
  if (!publicClient) {
    publicClient = createBaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return publicClient;
}
