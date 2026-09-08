'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { uploadInspectionPhoto } from '@/lib/images/browser';

/**
 * The photo evidence on a départ / retour checklist (plan 7.1).
 *
 * Straight from the phone camera into the PRIVATE `inspections` bucket, one
 * file at a time, resized in the browser first (`@/lib/images/browser`) — an
 * agency wifi upload of eight 8-megapixel photos is a checklist nobody
 * finishes.
 *
 * Two rules the counter taught us:
 *  - the thumbnail comes from the local File, not from the bucket, so a photo
 *    appears the instant it is taken and never waits on a round trip;
 *  - every state is written out. "Envoi 2/5", "envoyée", "échec — réessayer".
 *    A frozen button is how an operator ends up taking the same photo twice
 *    or, worse, handing over the keys with no photo at all.
 *
 * A failed file stays on screen with its error and is NOT counted in the paths
 * reported to the parent: the checklist must never claim evidence it does not
 * have.
 */
export default function InspectionPhotos({
  reservationId,
  kind = 'photo',
  storage = true,
  onChange,
  max = 12,
  label = 'Photos',
  hint,
  compact = false,
}) {
  /* One entry per file the operator picked: {key, url, status, path, message} */
  const [items, setItems] = useState([]);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);

  /* The paths already accepted by Storage. Kept in a ref, not derived from
     `items` inside the upload loop, because the loop is async and a `useState`
     read in it would be a snapshot from before the previous file finished. */
  const pathsRef = useRef([]);
  const urlsRef = useRef(new Set());
  const busyRef = useRef(false);

  /* Object URLs are the only thing here that leaks if the operator walks away
     mid-checklist. Removal revokes immediately; this releases the rest. */
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const report = () => onChange?.([...pathsRef.current]);

  const pick = async (event) => {
    const files = Array.from(event.target.files || []);
    /* Cleared so picking the very same file again still fires a change. */
    event.target.value = '';
    if (files.length === 0 || busyRef.current) return;

    setNotice(null);
    const room = Math.max(0, max - items.filter((i) => i.status !== 'error').length);
    const chosen = files.slice(0, room);
    if (files.length > chosen.length) {
      setNotice(`${max} photos au maximum : ${files.length - chosen.length} fichier(s) ignoré(s).`);
    }
    if (chosen.length === 0) return;

    const staged = chosen.map((file, i) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.add(url);
      return {
        key: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        url,
        file,
        status: storage ? 'pending' : 'local',
        path: null,
        message: null,
      };
    });
    setItems((prev) => [...prev, ...staged]);

    /* Demo mode has no bucket. The photos stay visible on the device and the
       payload carries none — saying so is better than a silent no-op. */
    if (!storage) return;

    busyRef.current = true;
    setProgress({ done: 0, total: staged.length });
    const supabase = createBrowserSupabase();

    let done = 0;
    for (const item of staged) {
      try {
        const path = await uploadInspectionPhoto(supabase, { file: item.file, reservationId, kind });
        pathsRef.current = [...pathsRef.current, path];
        setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'done', path, file: null } : i)));
        report();
      } catch (err) {
        const message = err?.message || 'Envoi impossible.';
        setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'error', message, file: null } : i)));
      }
      done += 1;
      setProgress({ done, total: staged.length });
    }

    busyRef.current = false;
    setProgress(null);
  };

  /* Disabled while an upload is in flight (see the button), so this always
     reads a settled entry and the side effects stay out of the updater. */
  const remove = (key) => {
    const target = items.find((i) => i.key === key);
    if (!target) return;
    URL.revokeObjectURL(target.url);
    urlsRef.current.delete(target.url);
    if (target.path) {
      pathsRef.current = pathsRef.current.filter((p) => p !== target.path);
      report();
    }
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const inputId = `photos-${kind}`;
  const sent = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          {label}
        </label>
        <span className="tnum text-xs text-text-muted">
          {items.length}/{max}
          {storage && sent ? ` · ${sent} envoyée${sent > 1 ? 's' : ''}` : ''}
        </span>
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={pick}
        disabled={items.length >= max}
        className="mt-2 block w-full cursor-pointer rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-2 file:me-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-text disabled:opacity-50"
      />

      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
      {!storage ? (
        <p className="mt-1 text-xs text-text-muted">Mode démo : les photos restent sur cet appareil, rien n’est envoyé.</p>
      ) : null}

      {progress ? (
        <div className="mt-3" role="status" aria-live="polite">
          <p className="tnum text-xs text-text-2">
            Envoi {progress.done}/{progress.total}…
          </p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-text-2" style={{ inlineSize: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {notice ? <p className="mt-2 text-xs text-warning">{notice}</p> : null}
      {failed ? (
        <p className="mt-2 text-xs text-red-signal">
          {failed} photo(s) non envoyée(s). Supprimez-les et reprenez-les — elles ne comptent pas comme preuve.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Aucune photo pour l’instant.</p>
      ) : (
        <ul className={`mt-3 flex flex-wrap gap-2 ${compact ? '' : 'gap-3'}`}>
          {items.map((item, index) => (
            <li key={item.key} className="relative">
              {/* Blob URL from the File the operator just took — next/image
                  cannot serve one, and there is nothing to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`Photo ${index + 1}`}
                className={`rounded-lg border border-border object-cover ${compact ? 'h-16 w-16' : 'h-20 w-20'} ${item.status === 'error' ? 'opacity-40' : ''}`}
              />
              <button
                type="button"
                onClick={() => remove(item.key)}
                disabled={Boolean(progress)}
                aria-label={`Supprimer la photo ${index + 1}`}
                className="absolute -top-2 -end-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-1 text-sm font-bold text-text-2 hover:text-text disabled:opacity-40"
              >
                ×
              </button>
              <span className="mt-1 block text-center text-[10px] text-text-muted">
                {item.status === 'done' ? 'envoyée' : item.status === 'error' ? 'échec' : item.status === 'local' ? 'locale' : 'en attente'}
              </span>
              {item.message ? <span className="block max-w-20 text-center text-[10px] text-red-signal">{item.message}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
