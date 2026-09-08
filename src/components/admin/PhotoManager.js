'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removePhoto, reorderPhotos, savePhoto } from '@/lib/actions/fleet';
import { ImageError, removeVehiclePhotoFiles, uploadVehiclePhoto } from '@/lib/images/browser';
import { createBrowserSupabase } from '@/lib/supabase/client';

/**
 * The per-car gallery (plan 7.1, 2.5) — the owner's own requirement: add,
 * replace, remove and reorder photos per angle without a single code change.
 *
 * The work happens HERE, in the operator's tab: the file is decoded, resized
 * on a canvas into the five widths, encoded as WebP with a JPEG fallback and a
 * 24 px blur, and pushed straight into the `vehicles` bucket. The server only
 * ever writes the index row that points at those bytes (rule 9 forbids a
 * native image module at runtime, and a per-request image service is not free
 * on Workers). It is slower for one photo and free forever, which is the right
 * trade for a job done a few times a month.
 *
 * Progress is per FILE and honest: it counts variants actually uploaded, not a
 * fake timer, because a 12-variant upload on agency wifi is long enough that a
 * frozen button reads as a broken page.
 */

const ANGLES = [
  { value: 'front', label: 'Avant ¾', alt: { fr: 'vue avant', en: 'front view', ar: 'منظر أمامي', es: 'vista frontal' } },
  { value: 'side', label: 'Profil', alt: { fr: 'vue de profil', en: 'side view', ar: 'منظر جانبي', es: 'vista lateral' } },
  { value: 'rear', label: 'Arrière ¾', alt: { fr: 'vue arrière', en: 'rear view', ar: 'منظر خلفي', es: 'vista trasera' } },
  { value: 'interior', label: 'Intérieur', alt: { fr: 'intérieur', en: 'interior', ar: 'المقصورة الداخلية', es: 'interior' } },
  { value: 'dash', label: 'Tableau de bord', alt: { fr: 'tableau de bord', en: 'dashboard', ar: 'لوحة القيادة', es: 'salpicadero' } },
];

const IMAGE_ERROR = {
  NO_FILE: 'Aucun fichier sélectionné.',
  NOT_IMAGE: 'Ce fichier n’est pas une image.',
  TOO_LARGE: 'Image trop lourde : 25 Mo maximum.',
  DECODE_FAILED: 'Image illisible — réexportez-la en JPEG ou PNG.',
  ENCODE_FAILED: 'Le navigateur n’a pas pu encoder l’image.',
  UPLOAD_FAILED: 'Le stockage a refusé l’envoi — vérifiez la connexion, puis réessayez.',
  DELETE_FAILED: 'Les fichiers n’ont pas pu être retirés du stockage.',
};

const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1/object/public/vehicles`;

/** The 480 px variant when the master was wide enough for one, else the smallest. */
function thumbUrl(photo) {
  const widths = photo.widths || [];
  const width = widths.includes(480) ? 480 : widths[0] || 480;
  const format = (photo.formats || ['webp'])[0];
  return `${STORAGE}/${photo.basePath}-${width}.${format}`;
}

const errorText = (err) => (err instanceof ImageError ? IMAGE_ERROR[err.code] || err.message : 'Envoi impossible — réessayez.');

export default function PhotoManager({ vehicleId, slug, vehicleLabel = '', photos = [], canUpload = false }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [angle, setAngle] = useState('front');
  /* Optimistic sort overrides, id → sort. Rendering reads
     `order[id] ?? photo.sort`, so when the refreshed server rows arrive the two
     agree and the override quietly stops mattering; a refusal drops it and the
     gallery snaps back to what the database says. */
  const [order, setOrder] = useState({});
  const [queue, setQueue] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  /* Queue keys, handed out in the change handler and never read while
     rendering: a clock or a random number would be an impure call in a
     component, and the file name alone is not unique across two picks. */
  const seq = useRef(0);

  const sortOf = (p) => (order[p.id] === undefined ? p.sort ?? 100 : order[p.id]);
  const ordered = [...photos].sort(
    (a, b) => sortOf(a) - sortOf(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  );
  const groups = ANGLES.map((a) => ({ ...a, items: ordered.filter((p) => p.angle === a.value) }));
  /* The card image on the site is simply the first row of the sorted set, and
     the angle order below puts "avant ¾" first — so this is the same photo the
     public catalogue will show, not a second rule that could disagree. */
  const cardPhoto = groups.find((g) => g.items.length > 0)?.items[0] || null;

  const altFor = (angleValue) => {
    const spec = ANGLES.find((a) => a.value === angleValue) || ANGLES[0];
    return Object.fromEntries(Object.entries(spec.alt).map(([locale, label]) => [locale, `${vehicleLabel} — ${label}`.trim()]));
  };

  const onPick = async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    /* Cleared straight away so the same file can be picked again after a
       failure — a file input will not re-fire change for an identical value. */
    input.value = '';
    if (files.length === 0) return;

    setError(null);
    setNotice(null);
    const supabase = createBrowserSupabase();
    const first = seq.current;
    seq.current += files.length;
    const entries = files.map((file, i) => ({
      key: `f${first + i}`,
      name: file.name,
      angle,
      pct: 0,
      state: 'upload',
      message: '',
    }));
    setQueue((q) => [...q, ...entries]);

    /* New photos go to the END of the whole set: an upload must never displace
       the card image the agency chose. Past the current MAXIMUM, not past the
       count — a gallery that has never been reordered still carries the
       default sort of 100 on every row. */
    let sort = ordered.reduce((max, p) => Math.max(max, sortOf(p)), 0) + 10;
    let added = 0;

    for (let i = 0; i < files.length; i += 1) {
      const { key } = entries[i];
      const patch = (fields) => setQueue((q) => q.map((e) => (e.key === key ? { ...e, ...fields } : e)));
      try {
        const row = await uploadVehiclePhoto(supabase, {
          file: files[i],
          slug,
          angle,
          vehicleId,
          onProgress: (done, total) => patch({ pct: Math.round((done / total) * 100) }),
        });
        patch({ pct: 100, state: 'save' });
        const saved = await savePhoto({ ...row, alt: altFor(angle), sort });
        if (saved?.ok) {
          added += 1;
          sort += 10;
          patch({ state: 'done', message: `${row.widths.length} largeur(s) · ${row.width}×${row.height}` });
        } else {
          patch({ state: 'error', message: saved?.message || 'Enregistrement refusé.' });
        }
      } catch (err) {
        patch({ state: 'error', message: errorText(err) });
      }
    }

    if (added > 0) {
      setNotice(`${added} photo(s) ajoutée(s).`);
      startTransition(() => router.refresh());
    }
  };

  const move = async (angleValue, index, delta) => {
    const group = groups.find((g) => g.value === angleValue);
    const items = [...(group?.items || [])];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];

    /* `sort` is ONE sequence for the whole vehicle, not one per angle. So the
       whole list is renumbered and sent, front group first — renumbering a
       single angle would collide with the others and scramble which photo the
       site treats as the card image. */
    const ids = groups.flatMap((g) => (g.value === angleValue ? items : g.items)).map((p) => p.id);
    const next = {};
    ids.forEach((id, i) => {
      next[id] = (i + 1) * 10;
    });
    setOrder(next);
    setError(null);
    setNotice(null);

    const result = await reorderPhotos({ vehicleId, ids });
    if (!result?.ok) {
      setOrder({});
      setError(result?.message || 'Ordre refusé.');
      return;
    }
    setNotice('Ordre enregistré.');
    startTransition(() => router.refresh());
  };

  const destroy = async (photo, label) => {
    if (!window.confirm(`Supprimer la photo « ${label} » ? Les fichiers seront retirés du stockage. Irréversible.`)) return;
    setBusyId(photo.id);
    setError(null);
    setNotice(null);

    const result = await removePhoto(photo.id);
    if (!result?.ok) {
      setBusyId(null);
      setError(result?.message || 'Suppression refusée.');
      return;
    }

    /* The row is the index, the bucket is the content. The row is already gone
       here, so a failure below leaves orphaned bytes — cheaper than a page
       pointing at a photo that no longer exists — and it is said out loud. */
    if (canUpload) {
      try {
        await removeVehiclePhotoFiles(createBrowserSupabase(), result);
      } catch (err) {
        setError(`Fiche supprimée, mais ${errorText(err).toLowerCase()}`);
      }
    }

    setBusyId(null);
    setNotice('Photo supprimée.');
    startTransition(() => router.refresh());
  };

  const pending = refreshing || busyId !== null;

  return (
    <section className="card p-5" data-testid="photo-manager">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-sans text-base font-semibold text-text">Photos</h2>
        <p className="text-xs text-text-muted">
          <span className="tnum">{photos.length}</span> photo(s) · la première photo « Avant ¾ » est l’image de la carte sur
          le site ; à défaut, la première de la liste.
        </p>
      </div>

      {canUpload ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2/40 p-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-text-2">Angle</span>
            <select
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="min-h-11 rounded-[var(--radius-input)] border border-border bg-surface-1 px-3 py-2 text-sm text-text"
              data-testid="photo-angle"
            >
              {ANGLES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-56 flex-1">
            <span className="mb-1.5 block text-[13px] font-semibold text-text-2">Fichiers</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onPick}
              data-testid="photo-input"
              className="w-full rounded-[var(--radius-input)] border border-border bg-surface-1 px-3 py-2 text-sm text-text file:me-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-text"
            />
          </label>
          <p className="w-full text-xs text-text-muted">
            Les variantes 480 → 2000 px sont fabriquées dans ce navigateur, puis envoyées. Master 3000 px, JPEG ou PNG,
            25 Mo maximum. Choisissez l’angle avant d’ouvrir le sélecteur.
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-[var(--radius-card)] border border-border bg-surface-2/40 p-4 text-sm text-text-2">
          Stockage Supabase non configuré (mode démo) : l’envoi de photos est désactivé. En production, les photos
          s’ajoutent ici, sans passer par le code.
        </p>
      )}

      {notice ? (
        <p role="status" className="mt-4 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="mt-4 space-y-2" data-testid="photo-queue">
          {queue.map((item) => (
            <li key={item.key} className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-latin-sans text-text">
                  {item.name}
                  <span className="text-text-muted"> · {ANGLES.find((a) => a.value === item.angle)?.label}</span>
                </span>
                <span className={item.state === 'error' ? 'text-danger' : item.state === 'done' ? 'text-success' : 'text-text-muted'}>
                  {item.state === 'upload' ? (
                    <>
                      Envoi <span className="tnum">{item.pct}</span> %
                    </>
                  ) : item.state === 'save' ? (
                    'Enregistrement…'
                  ) : (
                    item.message || (item.state === 'done' ? 'Ajoutée' : 'Échec')
                  )}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full ${item.state === 'error' ? 'bg-danger' : item.state === 'done' ? 'bg-success' : 'bg-text-2'}`}
                  style={{ inlineSize: `${item.state === 'error' ? 100 : item.pct}%` }}
                />
              </div>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setQueue([])}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-2 hover:text-text"
            >
              Effacer la liste
            </button>
          </li>
        </ul>
      ) : null}

      {photos.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          Aucune photo pour ce modèle. Le site affiche la silhouette de la catégorie en attendant.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <div key={group.value} data-angle={group.value}>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                {group.label} · <span className="tnum">{group.items.length}</span>
              </h3>
              {group.items.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">Aucune photo sous cet angle.</p>
              ) : (
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((photo, index) => {
                    const label = `${group.label} ${index + 1}`;
                    return (
                      <li key={photo.id} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-1" data-photo={photo.id}>
                        <div
                          className="aspect-[4/3] bg-surface-2 bg-cover bg-center"
                          style={photo.blur ? { backgroundImage: `url(${photo.blur})` } : undefined}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbUrl(photo)}
                            alt={`${vehicleLabel} — ${group.alt.fr}`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="space-y-2 p-3">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-semibold text-text">{label}</span>
                            {cardPhoto?.id === photo.id ? (
                              <span className="rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-semibold text-red-signal">
                                Image de la carte
                              </span>
                            ) : null}
                          </div>
                          <p className="tnum font-latin-sans text-xs text-text-muted">
                            {photo.width || '?'}×{photo.height || '?'} px · {(photo.widths || []).join(' · ') || '—'} ·{' '}
                            {(photo.formats || []).join(' + ')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => move(group.value, index, -1)}
                              disabled={index === 0 || pending}
                              aria-label={`Monter ${label}`}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-2 hover:text-text disabled:opacity-40"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => move(group.value, index, 1)}
                              disabled={index === group.items.length - 1 || pending}
                              aria-label={`Descendre ${label}`}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-2 hover:text-text disabled:opacity-40"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => destroy(photo, label)}
                              disabled={pending}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-2 hover:border-border-strong hover:text-text disabled:opacity-40"
                            >
                              {busyId === photo.id ? 'Suppression…' : 'Supprimer'}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
