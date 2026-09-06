/**
 * Admin session helpers that run in both the proxy (Node runtime) and Server
 * Components / Server Actions. Two modes:
 *  - Supabase mode (NEXT_PUBLIC_SUPABASE_URL + key set): Supabase Auth JWT claims.
 *  - Demo mode (no Supabase): an HMAC-signed cookie, protected by ADMIN_DEMO_PASSWORD.
 */

export const ADMIN_COOKIE = 'dc_admin';
const DEFAULT_SECRET = 'diabcar-dev-secret-change-me';

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function supabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Is this Supabase user allowed into the admin? */
export function claimsAreAdmin(claims) {
  if (!claims) return false;
  const role = claims.app_metadata?.role || claims.user_metadata?.role;
  if (role === 'admin') return true;
  const email = (claims.email || '').toLowerCase();
  return email ? adminEmails().includes(email) : false;
}

function b64url(bytes) {
  const str = typeof bytes === 'string' ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  return atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function sign(payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(process.env.AUTH_SECRET || DEFAULT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return b64url(sig);
}

/** Demo mode: create a signed token valid for `days`. */
export async function createDemoToken(email, days = 7) {
  const payload = b64url(JSON.stringify({ email, exp: Date.now() + days * 86400 * 1000 }));
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

/** Demo mode: verify a token; returns { email } or null. */
export async function verifyDemoToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = await sign(payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(fromB64url(payload));
    if (!data.exp || data.exp < Date.now()) return null;
    return { email: data.email, mode: 'demo' };
  } catch {
    return null;
  }
}

export function demoPassword() {
  return process.env.ADMIN_DEMO_PASSWORD || 'diabcar-demo';
}
