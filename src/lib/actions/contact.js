'use server';

import { z } from 'zod';
import { getSettings } from '@/lib/data';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().default(''),
  email: z.email().optional().or(z.literal('')),
  message: z.string().trim().min(5).max(2000),
  subject: z.string().max(120).optional().default('Contact'),
  locale: z.string().max(5).optional().default('fr'),
});

/** Contact / quote form → email (Resend) when configured, always logged. */
export async function submitContact(input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const d = parsed.data;
  console.info('[contact]', d.subject, d.name, d.phone, d.email);
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const settings = await getSettings();
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Diab Car <contact@diabcar.ma>',
        to: process.env.BOOKING_NOTIFY_EMAIL || settings?.email,
        replyTo: d.email || undefined,
        subject: `[Site] ${d.subject} — ${d.name}`,
        text: `Nom: ${d.name}\nTéléphone: ${d.phone}\nE-mail: ${d.email}\nLangue: ${d.locale}\n\n${d.message}`,
      });
    } catch (error) {
      console.error('[contact:email]', error);
    }
  }
  return { ok: true };
}
