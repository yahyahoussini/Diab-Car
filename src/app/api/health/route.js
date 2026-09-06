import { dataMode, getSettings } from '@/lib/data';

/** Uptime / keep-alive endpoint (also keeps a free Supabase project from pausing). */
export async function GET() {
  try {
    const s = await getSettings();
    return Response.json({ ok: true, mode: dataMode(), business: s?.name || null, time: new Date().toISOString() });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
