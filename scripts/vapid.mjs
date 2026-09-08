#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* scripts/vapid.mjs — generate a VAPID key pair for Web Push.         */
/*                                                                     */
/* Run once. The public key is safe to ship to the browser (it is what  */
/* subscribes a device); the private key is server-only and signs the   */
/* JWT that authorises each push.                                       */
/*                                                                     */
/* Uses Web Crypto rather than the `web-push` package, for the same     */
/* reason the sender does: the runtime is Cloudflare Workers, where     */
/* Node-only crypto is not available (CLAUDE.md rule 9). Generating     */
/* with the same primitives the sender uses also means the keys are     */
/* provably the right shape — P-256, raw/pkcs8, base64url.              */
/*                                                                     */
/* Usage:  node scripts/vapid.mjs                                       */
/* ------------------------------------------------------------------ */

import { webcrypto } from 'node:crypto';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

/* The public key travels as the raw 65-byte uncompressed point (0x04 || X || Y):
   that is exactly what PushManager.subscribe() expects as
   applicationServerKey. */
const publicRaw = await webcrypto.subtle.exportKey('raw', pair.publicKey);

/* The private key is kept as PKCS#8 so it can be re-imported with
   importKey('pkcs8', …) in the Worker without any conversion step. */
const privatePkcs8 = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);

console.log(`
  Diab Car — VAPID keys
  ----------------------------------------------------------------
  Add these to .env.local (never commit them), and set the same
  values in the host's environment when you deploy.

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${b64url(publicRaw)}
VAPID_PRIVATE_KEY=${b64url(privatePkcs8)}
VAPID_SUBJECT=mailto:diabcar@gmail.com

  The public key is not a secret — the browser needs it to subscribe.
  The private key is: anyone holding it can push to every subscribed
  device. If it leaks, generate a new pair and every device simply
  re-subscribes on its next visit.
`);
