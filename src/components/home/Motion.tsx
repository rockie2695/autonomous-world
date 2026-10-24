'use client';

// ============================================================================
// Scroll motion primitives — 深空科幻首頁 / Deep Space Sci-Fi Homepage
// ============================================================================
// Reveal   — fade + rise on first view, staggerable via `delay`.
// Parallax — layered scroll translation; transform/opacity only.
// Both collapse to static blocks when prefers-reduced-motion is set.
// ============================================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

// ─── 靜態偵測（SSR 安全）/ Reduced-motion detection (SSR safe) ───────────────

/**
 * prefers-reduced-motion 的偵測不能在第一筆渲染就分歧：伺服器上 matchMedia
 * 不存在，直接用 useReducedMotion 分支會讓 SSR 畫 motion.div、客戶端畫靜態
 * div——hydration 屬性不匹配，主控台噴錯讓靜態使用者每次進站都撞一次。
 * 這裡用確定性的偵測：第一筆渲染兩端一致（一律動畫分支），掛載後才讀設定、
 * 立刻換成靜態塊——需要靜態的人不再撞 hydration 錯誤；入口動畫最多先跑一幀
 * 才落定，靜態使用者看到的仍是即時到位的內容。
 * prefs-reduced-motion cannot branch on the first render: matchMedia does not
 * exist on the server, so branching straight on useReducedMotion makes the SSR
 * pass paint a motion.div while a static client paints a plain div — attributes
 * mismatch at hydration, and every static-motion user gets a console error and
 * a mismatch warning on entry. This is the deterministic detector: the first
 * render matches on both sides (always the animated branch), the preference is
 * read after mount and swaps to the static block immediately — no hydration
 * error; the entrance animation may run one frame before it settles.
 */
function useStillness(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return still;
}

/** Reveal / Parallax / 任何首頁動效元件共用的靜態偵測：hydration 安全
    The stillness detector shared by Reveal / Parallax / any motion component on
    this page: hydration-safe */
export { useStillness };

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
  const reduce = useStillness();

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
  const reduce = useStillness();
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
