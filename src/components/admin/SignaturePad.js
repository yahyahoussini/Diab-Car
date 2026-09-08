'use client';

import { useCallback, useRef } from 'react';

/**
 * The customer's signature on a départ / retour checklist (plan 7.1).
 *
 * A finger on a phone at the counter, a mouse on the office laptop: one
 * pointer API covers both, with `setPointerCapture` so a stroke that leaves
 * the canvas is still drawn instead of stopping mid-letter.
 *
 * The canvas element itself is the interface with the parent. The checklist
 * owns the ref and uploads the PNG at submit time through
 * `uploadSignature()`, so the operator presses ONE button and either the whole
 * départ is recorded — signature included — or none of it is. A pad that
 * uploaded on its own would leave orphan PNGs in the bucket every time a
 * checklist was abandoned.
 *
 * Colours come out of the element's own computed style (`text-text` on
 * `bg-surface-1`), never a literal: rule 2, and it means the stored PNG is ink
 * on a background that the token system guarantees is a contrast pair, in
 * whichever theme the counter happens to be using.
 *
 * There is no animation here, so `prefers-reduced-motion` has nothing to turn
 * off — the stroke follows the finger and that is all.
 */

/* Fixed backing-store size, scaled by CSS. Pointer coordinates are mapped
   through the bounding rect, so no resize handling and no DPR arithmetic is
   needed — and the exported PNG is the same 600×200 whatever the screen. */
const W = 600;
const H = 200;

function prime(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = getComputedStyle(canvas).backgroundColor || 'transparent';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export default function SignaturePad({ canvasRef, signed = false, onSignedChange, label = 'Signature du client', hint, disabled = false }) {
  const drawingRef = useRef(false);
  const lastRef = useRef(null);

  /* Stable, so a parent re-render (every keystroke in the checklist) does not
     detach the canvas and wipe a signature already given. */
  const attach = useCallback(
    (node) => {
      canvasRef.current = node;
      if (node) prime(node);
    },
    [canvasRef],
  );

  const at = (canvas, event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const pen = (canvas) => {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  };

  const down = (event) => {
    if (disabled || event.button > 0) return;
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const p = at(canvas, event);
    lastRef.current = p;
    /* A tap with no movement is still a mark — some people "sign" with a dot. */
    const ctx = pen(canvas);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (!signed) onSignedChange?.(true);
  };

  const move = (event) => {
    if (!drawingRef.current) return;
    const canvas = event.currentTarget;
    const p = at(canvas, event);
    const from = lastRef.current || p;
    const ctx = pen(canvas);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const up = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) prime(canvas);
    drawingRef.current = false;
    lastRef.current = null;
    onSignedChange?.(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !signed}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-2 hover:text-text disabled:opacity-40"
        >
          Effacer
        </button>
      </div>

      <canvas
        ref={attach}
        width={W}
        height={H}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={label}
        className="mt-2 h-40 w-full touch-none select-none rounded-lg border border-border-strong bg-surface-1 text-text"
      />

      <p className="mt-1 text-xs text-text-muted">
        {signed ? 'Signature saisie.' : 'Faites signer le client avec le doigt ou la souris.'}
        {hint ? ` ${hint}` : ''}
      </p>
    </div>
  );
}
