'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { holdVehicle as holdRpc, releaseVehicleHold as releaseRpc } from '@/lib/data';

/**
 * Hold / release actions for the funnel (plan 6.3).
 *
 * A hold is a 10-minute claim on one car of a model while the customer fills
 * in their details. It is not a booking, and it is deliberately short: Diab Car
 * has 36 cars, so a hold that outlived the visitor would take real stock off
 * the site.
 *
 * The session token is a httpOnly cookie, never anything the client sends.
 * `release_hold` requires it, so one visitor cannot cancel another's hold by
 * guessing a uuid — and because it is httpOnly, page JavaScript cannot read or
 * forge it either.
 */

const SESSION_COOKIE = 'dc_hold_session';

async function sessionToken() {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing && existing.length >= 8) return existing;

  const token = crypto.randomUUID();
  try {
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60, // an hour is far longer than any funnel
    });
  } catch {
    /* Called from a Server Component render: the cookie cannot be set there.
       The token is still returned so the hold works for this request. */
  }
  return token;
}

const holdSchema = z.object({
  vehicleId: z.string().min(1),
  startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'not a date'),
  endAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'not a date'),
});

/**
 * Claim a car for 10 minutes.
 * @returns {Promise<{ok:true, hold:object, unitsFree:number}|{ok:false, error:string, alternatives?:object[], nextAvailableAt?:string|null}>}
 */
export async function holdVehicle(input) {
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
  if (Date.parse(d.endAt) <= Date.parse(d.startAt)) return { ok: false, error: 'BAD_DATES' };

  const token = await sessionToken();

  try {
    /* Postgres decides. A SOLD_OUT answer arrives with up to three
       alternatives already chosen (same category, free, cheapest first), so
       the UI never has to make a second round trip to be useful. */
    return await holdRpc({ vehicleId: d.vehicleId, startAt: d.startAt, endAt: d.endAt, sessionToken: token });
  } catch {
    return { ok: false, error: 'server' };
  }
}

const releaseSchema = z.object({ holdId: z.string().min(1) });

/** Give the car back — on abandon, on going back a step, or on timeout. */
export async function releaseHold(input) {
  const parsed = releaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  /* No token means this browser never held anything. Nothing to release, and
     certainly not someone else's hold. */
  if (!token) return { ok: false, error: 'no_session' };

  try {
    return await releaseRpc({ holdId: parsed.data.holdId, sessionToken: token });
  } catch {
    return { ok: false, error: 'server' };
  }
}
