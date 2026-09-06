import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { supabaseKey } from '@/lib/auth/session';

/**
 * Refreshes the Supabase session inside the proxy and returns the response to
 * send plus the verified JWT claims (or null). Follows the official
 * @supabase/ssr pattern: cookies set by the auth client are copied onto the
 * outgoing response so tokens rotate without logging the admin out.
 */
export async function updateSession(request, makeResponse) {
  let response = makeResponse(request);
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = makeResponse(request);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let claims = null;
  try {
    const { data } = await supabase.auth.getClaims();
    claims = data?.claims ?? null;
  } catch {
    claims = null;
  }
  return { response, claims, NextResponse };
}
