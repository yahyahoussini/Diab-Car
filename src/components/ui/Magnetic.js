'use client';

import { useRef } from 'react';
import * as m from 'motion/react-m';
import { useMotionValue, useSpring, useReducedMotion } from 'motion/react';

/** Magnetic hover for a primary CTA — desktop pointers only, ≤ 8px travel. */
export default function Magnetic({ children, strength = 0.25, className }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });
  const reduce = useReducedMotion();

  function onMove(e) {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    x.set(Math.max(-8, Math.min(8, dx * strength)));
    y.set(Math.max(-8, Math.min(8, dy * strength)));
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <m.div ref={ref} className={className} style={{ x: sx, y: sy, display: 'inline-block' }} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </m.div>
  );
}
