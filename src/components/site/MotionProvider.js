'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';

/** Loads the minimal Motion feature set (~4.6 kB) and respects reduced motion. */
export default function MotionProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
