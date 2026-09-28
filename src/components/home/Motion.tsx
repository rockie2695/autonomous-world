'use client';

// ============================================================================
// Scroll motion primitives — 深空科幻首頁 / Deep Space Sci-Fi Homepage
// ============================================================================
// Reveal   — fade + rise on first view, staggerable via `delay`.
// Parallax — layered scroll translation; transform/opacity only.
// Both collapse to static blocks when prefers-reduced-motion is set.
// ============================================================================

import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

// ─── Reveal ─────────────────────────────────────────────────────────────────

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** seconds, 30–50ms steps read best between siblings */
  delay?: number;
  /** rise distance in px */
  y?: number;
};

export function Reveal({ children, className, delay = 0, y = 28 }: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// ─── Parallax ───────────────────────────────────────────────────────────────

type ParallaxProps = {
  children: ReactNode;
  className?: string;
  /** travel distance in px across the element's scroll range */
  offset?: number;
};

export function Parallax({ children, className, offset = 64 }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);

  if (reduce) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}
