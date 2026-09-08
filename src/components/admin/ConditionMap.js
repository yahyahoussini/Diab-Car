'use client';

import { useState } from 'react';
import InspectionPhotos from '@/components/admin/InspectionPhotos';

/**
 * The condition map — the drawing an operator taps to say where the damage is
 * (plan 7.1).
 *
 * It is an inline SVG top view, drawn here in paths and rects. No image and no
 * library: a picture would need a variant per vehicle shape and a library
 * would cost more kilobytes than the whole admin budget for one widget
 * (rule 9). What matters is that the nineteen zones are unambiguous, not that
 * the car is pretty.
 *
 * ACCESSIBILITY, and it is not decoration here: every zone is a real focusable
 * control with `role="button"`, Enter/Space, and a French `aria-label` naming
 * it. This runs on a phone, one-handed, at a counter, sometimes by somebody
 * using the keyboard on the office laptop. The zones are sized so the smallest
 * side is ≥ 32 units of a 200-wide viewBox — over 44 CSS pixels at every width
 * the container allows.
 *
 * Output (the parent assembles the payload):
 *   damages   [{ zone, type, severity, notes, photos }]
 *   condition { zones: { <zone>: { count, severity } } }   ← `conditionFromDamages`
 */

/* Keep in step with the ZONES list in src/lib/actions/operations.js — that copy
   exists because a 'use server' module cannot re-export a constant and a
   server module importing this file would get a client reference. */
export const ZONE_LABEL = {
  'pare-chocs-avant': 'Pare-chocs avant',
  capot: 'Capot',
  'aile-avant-gauche': 'Aile avant gauche',
  'aile-avant-droite': 'Aile avant droite',
  'roue-avant-gauche': 'Roue avant gauche',
  'roue-avant-droite': 'Roue avant droite',
  'pare-brise': 'Pare-brise',
  'porte-avant-gauche': 'Porte avant gauche',
  'porte-avant-droite': 'Porte avant droite',
  toit: 'Toit',
  'porte-arriere-gauche': 'Porte arrière gauche',
  'porte-arriere-droite': 'Porte arrière droite',
  coffre: 'Coffre',
  'aile-arriere-gauche': 'Aile arrière gauche',
  'aile-arriere-droite': 'Aile arrière droite',
  'roue-arriere-gauche': 'Roue arrière gauche',
  'roue-arriere-droite': 'Roue arrière droite',
  'pare-chocs-arriere': 'Pare-chocs arrière',
  interieur: 'Intérieur',
};

/* Geometry of the top view, nose up, in a 200 × 448 viewBox. */
const ZONES = [
  { id: 'pare-chocs-avant', x: 46, y: 8, w: 108, h: 32 },
  { id: 'aile-avant-gauche', x: 40, y: 44, w: 32, h: 62 },
  { id: 'capot', x: 74, y: 44, w: 52, h: 62 },
  { id: 'aile-avant-droite', x: 128, y: 44, w: 32, h: 62 },
  { id: 'roue-avant-gauche', x: 6, y: 52, w: 32, h: 56 },
  { id: 'roue-avant-droite', x: 162, y: 52, w: 32, h: 56 },
  { id: 'pare-brise', x: 46, y: 110, w: 108, h: 34 },
  { id: 'porte-avant-gauche', x: 40, y: 148, w: 32, h: 62 },
  { id: 'toit', x: 74, y: 148, w: 52, h: 128 },
  { id: 'porte-avant-droite', x: 128, y: 148, w: 32, h: 62 },
  { id: 'porte-arriere-gauche', x: 40, y: 214, w: 32, h: 62 },
  { id: 'porte-arriere-droite', x: 128, y: 214, w: 32, h: 62 },
  { id: 'aile-arriere-gauche', x: 40, y: 280, w: 32, h: 62 },
  { id: 'coffre', x: 74, y: 280, w: 52, h: 62 },
  { id: 'aile-arriere-droite', x: 128, y: 280, w: 32, h: 62 },
  { id: 'roue-arriere-gauche', x: 6, y: 286, w: 32, h: 56 },
  { id: 'roue-arriere-droite', x: 162, y: 286, w: 32, h: 56 },
  { id: 'pare-chocs-arriere', x: 46, y: 346, w: 108, h: 32 },
  /* The cabin has no top view. It gets its own bar under the car rather than a
     made-up rectangle inside it. */
  { id: 'interieur', x: 6, y: 392, w: 188, h: 44 },
];

export const DAMAGE_TYPES = [
  { value: 'rayure', label: 'Rayure' },
  { value: 'bosse', label: 'Bosse' },
  { value: 'eclat', label: 'Éclat' },
  { value: 'fissure', label: 'Fissure' },
  { value: 'manquant', label: 'Manquant' },
  { value: 'sale', label: 'Sale' },
  { value: 'autre', label: 'Autre' },
];

export const SEVERITIES = [
  { value: 'mineur', label: 'Mineur' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'majeur', label: 'Majeur' },
];

const SEVERITY_RANK = { mineur: 1, moyen: 2, majeur: 3 };

/** The map's summary, stored beside the event so a dossier can redraw the car. */
export function conditionFromDamages(damages = []) {
  const zones = {};
  for (const d of damages) {
    const current = zones[d.zone];
    if (!current) {
      zones[d.zone] = { count: 1, severity: d.severity };
    } else {
      current.count += 1;
      /* A zone is as bad as its worst mark, not its latest one. */
      if (SEVERITY_RANK[d.severity] > SEVERITY_RANK[current.severity]) current.severity = d.severity;
    }
  }
  return { zones };
}

const emptyDraft = () => ({ type: 'rayure', severity: 'mineur', notes: '', photos: [] });

export default function ConditionMap({ damages = [], onChange, reservationId, kind = 'inspection', storage = true, title = 'État des lieux', hint }) {
  const [zone, setZone] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  /* Bumped after each save so the photo picker for the next damage starts
     empty — a remount is the honest way to reset a component that owns files. */
  const [draftKey, setDraftKey] = useState(0);

  const countFor = (id) => damages.filter((d) => d.zone === id).length;

  const open = (id) => {
    setZone(id);
    setDraft(emptyDraft());
    setDraftKey((k) => k + 1);
  };

  const close = () => {
    setZone(null);
    setDraft(emptyDraft());
  };

  const add = () => {
    if (!zone) return;
    onChange?.([
      ...damages,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        zone,
        type: draft.type,
        severity: draft.severity,
        notes: draft.notes.trim(),
        photos: draft.photos,
      },
    ]);
    setDraft(emptyDraft());
    setDraftKey((k) => k + 1);
  };

  const remove = (id) => onChange?.(damages.filter((d) => d.id !== id));

  const zoneDamages = zone ? damages.filter((d) => d.zone === zone) : [];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{title}</span>
        <span className="tnum text-xs text-text-muted">
          {damages.length === 0 ? 'aucun dommage' : `${damages.length} dommage${damages.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <p className="mt-1 text-xs text-text-muted">
        Vue de dessus, l’avant en haut. Touchez une zone pour y noter un dommage.
        {hint ? ` ${hint}` : ''}
      </p>

      <div className="mt-3 grid gap-5 md:grid-cols-2">
        <div className="mx-auto w-full max-w-[340px]">
          <svg viewBox="0 0 200 448" className="w-full" role="group" aria-label="Carte d’état du véhicule, vue de dessus">
            {/* Silhouette behind the zones — decoration, never a target. */}
            <g pointerEvents="none" className="fill-surface-1 stroke-border">
              <rect x="36" y="4" width="128" height="378" rx="30" strokeWidth="1.5" />
              <path d="M60 122 L140 122 L150 140 L50 140 Z" className="fill-surface-2 stroke-border" strokeWidth="1" />
              <path d="M50 300 L150 300 L140 318 L60 318 Z" className="fill-surface-2 stroke-border" strokeWidth="1" />
            </g>

            {ZONES.map((z) => {
              const count = countFor(z.id);
              const selected = zone === z.id;
              return (
                <g
                  key={z.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={count > 0}
                  aria-label={`${ZONE_LABEL[z.id]} — ${count === 0 ? 'aucun dommage' : `${count} dommage${count > 1 ? 's' : ''}`}`}
                  onClick={() => open(z.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      open(z.id);
                    }
                  }}
                  className="cursor-pointer focus-visible:[&>rect]:stroke-text"
                >
                  <title>{ZONE_LABEL[z.id]}</title>
                  <rect
                    x={z.x}
                    y={z.y}
                    width={z.w}
                    height={z.h}
                    rx="5"
                    strokeWidth={selected ? 3 : 1.5}
                    className={
                      count > 0
                        ? 'fill-warning-soft stroke-warning hover:fill-warning-soft'
                        : selected
                          ? 'fill-surface-3 stroke-text'
                          : 'fill-surface-2 stroke-border hover:fill-surface-3'
                    }
                  />
                  {count > 0 ? (
                    <text
                      x={z.x + z.w / 2}
                      y={z.y + z.h / 2 + 5}
                      textAnchor="middle"
                      pointerEvents="none"
                      className="fill-warning text-[14px] font-semibold"
                    >
                      {count}
                    </text>
                  ) : null}
                  {z.id === 'interieur' ? (
                    <text x={z.x + z.w / 2} y={z.y + 28} textAnchor="middle" pointerEvents="none" className="fill-text-muted text-[13px]">
                      Intérieur
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ---- the zone form, under the map on a phone, beside it on a laptop ---- */}
        <div>
          {zone ? (
            <div className="rounded-lg border border-border bg-surface-1 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-text">{ZONE_LABEL[zone]}</h3>
                <button type="button" onClick={close} className="text-xs font-semibold text-text-muted hover:text-text">
                  Fermer
                </button>
              </div>

              {zoneDamages.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {zoneDamages.map((d) => (
                    <li key={d.id} className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2 text-xs">
                      <span className="text-text-2">
                        {DAMAGE_TYPES.find((t) => t.value === d.type)?.label || d.type} · {SEVERITIES.find((s) => s.value === d.severity)?.label || d.severity}
                        {d.notes ? ` · ${d.notes}` : ''}
                        {d.photos.length ? ` · ${d.photos.length} photo(s)` : ''}
                      </span>
                      <button type="button" onClick={() => remove(d.id)} className="shrink-0 font-semibold text-text-muted hover:text-red-signal">
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-text-muted">Type</span>
                  <select
                    value={draft.type}
                    onChange={(event) => setDraft((d) => ({ ...d, type: event.target.value }))}
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
                  >
                    {DAMAGE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="mb-1 block text-xs text-text-muted">Gravité</span>
                  <div className="flex gap-2" role="radiogroup" aria-label="Gravité du dommage">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={draft.severity === s.value}
                        onClick={() => setDraft((d) => ({ ...d, severity: s.value }))}
                        className={`min-h-11 flex-1 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                          draft.severity === s.value ? 'border-warning bg-warning-soft text-warning' : 'border-border text-text-2 hover:text-text'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs text-text-muted">Notes</span>
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
                    rows={2}
                    maxLength={500}
                    placeholder="Rayure de 10 cm sous la poignée…"
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
                  />
                </label>

                <InspectionPhotos
                  key={`${zone}-${draftKey}`}
                  reservationId={reservationId}
                  kind={`${kind}-${zone}`}
                  storage={storage}
                  max={4}
                  compact
                  label="Photos du dommage"
                  onChange={(photos) => setDraft((d) => ({ ...d, photos }))}
                />

                <button
                  type="button"
                  onClick={add}
                  className="min-h-11 rounded-full border border-border-strong px-4 text-sm font-semibold text-text"
                >
                  Ajouter ce dommage
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-1 p-4">
              <p className="text-sm text-text-2">Aucune zone sélectionnée.</p>
              <p className="mt-1 text-xs text-text-muted">
                Touchez une zone de la carte pour décrire un dommage. Les zones marquées en ambre en portent déjà un.
              </p>
            </div>
          )}

          {damages.length > 0 ? (
            <div className="mt-4">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Relevé</span>
              <ul className="mt-2 space-y-1">
                {damages.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-text-2">
                      <span className="font-semibold text-text">{ZONE_LABEL[d.zone] || d.zone}</span>
                      {' — '}
                      {DAMAGE_TYPES.find((t) => t.value === d.type)?.label || d.type} · {SEVERITIES.find((s) => s.value === d.severity)?.label || d.severity}
                      {d.photos.length ? ` · ${d.photos.length} photo(s)` : ''}
                    </span>
                    <button type="button" onClick={() => remove(d.id)} className="shrink-0 font-semibold text-text-muted hover:text-red-signal">
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
