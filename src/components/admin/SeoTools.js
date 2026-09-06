'use client';

import { useState, useTransition } from 'react';
import { indexNowAll, revalidateAll } from '@/lib/actions/admin';
import { SubmitButton } from '@/components/admin/ui';

export default function SeoTools({ hasIndexNowKey }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SubmitButton type="button" variant="secondary" disabled={pending} onClick={() => start(async () => { await revalidateAll(); setMsg('Cache du site régénéré.'); })}>
        Régénérer le cache du site
      </SubmitButton>
      <SubmitButton type="button" disabled={pending || !hasIndexNowKey} onClick={() => start(async () => { const r = await indexNowAll(); setMsg(r.ok ? `IndexNow : ${r.count} URLs envoyées à Bing (statut ${r.status}).` : `IndexNow : échec (${r.error || r.status || 'clé manquante'}).`); })}>
        Ping IndexNow (Bing)
      </SubmitButton>
      {msg ? <span className="text-sm text-text-2">{msg}</span> : null}
    </div>
  );
}
