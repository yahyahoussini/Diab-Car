import { getSettings } from '@/lib/data';

/** Serves the IndexNow key (keyLocation) so engines can verify ownership. */
export async function GET() {
  const s = await getSettings();
  const key = s?.indexNowKey || process.env.INDEXNOW_KEY || '';
  if (!key) return new Response('IndexNow key not configured', { status: 404 });
  return new Response(key, { headers: { 'Content-Type': 'text/plain' } });
}
