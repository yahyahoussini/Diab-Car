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

/**
 * The staff roles, most powerful first (plan 7.2).
 *
 * `driver` is Phase 3 but exists in the enum and here so policies written now
 * never have to change when it arrives.
 */
export const ROLES = ['owner', 'manager', 'agent', 'driver'];

/** Roles allowed to see or change money: prices, tiers, settings (plan 7.2). */
export const PRICING_ROLES = ['owner', 'manager'];

/**
 * The role carried by a Supabase session.
 *
 * `user_role` is the claim written by `custom_access_token_hook`
 * (supabase/migrations/0005) from `profiles.role`. It is the authority — the
 * same claim the RLS policies read — so the UI and the database can never
 * disagree about who someone is.
 *
 * The two fallbacks are compatibility, not policy: the starter shipped
 * `app_metadata.role === 'admin'`, and ADMIN_EMAILS is the break-glass list
 * for an account whose profile row has not been created yet. Both map to
 * `owner` because that is what "admin" meant before roles existed.
 */
export function roleFromClaims(claims) {
  if (!claims) return null;

  const claimed = claims.user_role;
  if (ROLES.includes(claimed)) return claimed;

  const legacy = claims.app_metadata?.role || claims.user_metadata?.role;
  if (legacy === 'admin') return 'owner';

  const email = (claims.email || '').toLowerCase();
  if (email && adminEmails().includes(email)) return 'owner';

  return null;
}

/** Is this Supabase user allowed into the admin at all? */
export function claimsAreAdmin(claims) {
  return roleFromClaims(claims) !== null;
}

/** Does this role clear one of `allowed`? */
export function roleAllows(role, allowed) {
  return Boolean(role) && allowed.includes(role);
}

/** Plan 7.2: an agent works reservations and checklists, never prices or settings. */
export function canManagePricing(role) {
  return roleAllows(role, PRICING_ROLES);
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
