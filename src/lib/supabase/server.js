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

/**
 * Service-role client. Bypasses RLS entirely, so it is reachable from exactly
 * one place: the CRON_SECRET-protected sweeper at /api/cron/expire-holds,
 * whose RPC (`expire_holds`) is granted to service_role and nobody else.
 *
 * Returns null when the key is absent rather than falling back to the anon
 * client — a silent downgrade would make the sweep look like it ran when it
 * quietly did nothing. The caller reports the failure instead.
 *
 * Never import this into anything that renders.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createBaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
