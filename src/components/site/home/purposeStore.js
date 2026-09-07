'use client';

import { useSyncExternalStore } from 'react';

/**
 * Which "purpose" tile is active (plan 4.3 §2). A module-level store rather
 * than context: the tiles and the fleet grid are siblings, not nested, and
 * this keeps the whole feature to ~20 lines with no provider in the tree.
 *
 * The server snapshot is always null, so the prerendered HTML shows the
 * unfiltered fleet and hydration cannot mismatch.
 */

let current = null;
const listeners = new Set();

export function setPurpose(key) {
  current = current === key ? null : key;
  listeners.forEach((fn) => fn());
}

export function getPurpose() {
  return current;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** @returns {string|null} the active purpose key */
export function usePurpose() {
  return useSyncExternalStore(subscribe, getPurpose, () => null);
}
