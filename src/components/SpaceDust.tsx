// ============================================================================
// 太空塵埃背景 / Space dust background
// ----------------------------------------------------------------------------
// 一層緩慢飄動的塵埃，墊在地圖下面。氛圍，不是主角：地圖上的圓點與道路才是
// 資訊，所以顆粒刻意小、暗、慢、少——如果使用者第一眼注意到粒子，就是做太強了。
//
// A slowly drifting dust layer beneath the map. Atmosphere, not the protagonist:
// the dots and roads on the map are the information, so the particles are
// deliberately small, dim, slow and few. If a user notices the dust first, it is
// too strong.
//
// 三件事是刻意的，而且是踩過坑之後的結論 / Three things here are deliberate, and
// each is the result of a mistake first:
// 1. **顏色字串不再每幀重建**。樣板提案在迴圈內對每顆粒子組一次
//    `rgba(${A}, ${B}, ${C}, ${d})`，300 顆就是每幀 300 個新字串。這裡把不透明度
//    量化成有限幾階並預先建好字串，再依閃爍挑一階——每幀零配置。
//    **Colour strings are not rebuilt per frame.** The sample proposal composed a
//    fresh `rgba(...)` per particle per frame — 300 allocations a frame. Opacity
//    is quantised into a few steps whose strings are built once, so the frame loop
//    allocates nothing.
// 2. **可見性閘門是強制的**，不是可選的。沒有它，背景分頁就是一個滿載的核心。
//    **The visibility gate is mandatory**, not optional: without it a background
//    tab burns a core.
// 3. **`Math.random` 只在建立時呼叫**，之後位置由時間推進。粒子的初始位置若每次
//    重繪都重抽，整層會「跳一下」。
//    **`Math.random` is only called at construction**, positions then advance with
//    time. Re-rolling initial positions on every repaint makes the whole layer
//    jump.
//
// 它是 Canvas 2D 而非 WebGL shader：300 顆圓點在 2D 上開銷可忽略，換來的是一個
// 不需要維護著色器與其丟失處理的元件。
//
// It is Canvas 2D rather than a WebGL shader: 300 arcs cost nothing in 2D, and in
// exchange there is no shader to maintain and no context-loss handling to get
// wrong.
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { CONFIG } from '@/lib/gameConfig';

/** 硬上限：設定可以調低，但絕不超過這個數 / Hard cap: the setting may be lowered, never exceeded */
const PARTICLE_HARD_CAP = 800;

/** 單顆粒子 / one particle */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** 量化後的不透明度索引 / quantised opacity index */
  shade: number;
  phase: number;
}

export interface SpaceDustProps {
  /** 額外 class / extra class */
  className?: string;
}

export function SpaceDust({ className }: SpaceDustProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 在 effect 開頭收斂成有型別的非 null 變數：下面的迴圈是 hoisted function
    // declaration，TypeScript 不會把 null 收斂帶進去 /
    // Narrow to a typed non-null local at the top: the loop below is a hoisted
    // function declaration, so TypeScript does not carry the narrowing in
    const maybeCtx = canvas.getContext('2d');
    if (maybeCtx === null) return;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, CONFIG.SPACE_DPR_CAP);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 尺寸變了，粒子必須重新均勻鋪滿，否則會聚在一角。`seed` 是 hoisted
      // function declaration，所以這裡引用得到它；真正的限制是 `particles` 這個
      // `const` —— 它必須已經初始化，也就是 `resize()` 不能在宣告之前呼叫。
      //
      // On resize the particles are re-spread, or they bunch into one corner.
      // `seed` is a hoisted function declaration so it is reachable here; the real
      // constraint is the `const particles`, which must already be initialised —
      // i.e. `resize()` must not be called before that declaration.
      seed();
    };

    // ── 不透明度量化 / Opacity quantisation ───────────────────────────────────
    // 8 階就夠了：塵埃本來就幾乎看不出差別，而 300 顆 × 60fps 的字串配置是實實在在
    // 的 GC 壓力。
    //
    // 8 steps is plenty: the dust is barely distinguishable step to step, while
    // 300 strings per frame is real GC pressure.
    const SHADES = 8;
    const shadeStrings: string[] = [];
    for (let i = 0; i < SHADES; i += 1) {
      const t = i / (SHADES - 1);
      const alpha =
        CONFIG.SPACE_PARTICLE_MIN_ALPHA +
        (CONFIG.SPACE_PARTICLE_MAX_ALPHA - CONFIG.SPACE_PARTICLE_MIN_ALPHA) * t;
      // 字串只建一次，之後永遠重用 /
      // Built once, reused forever
      shadeStrings.push(`rgba(${CONFIG.SPACE_PARTICLE_RGB}, ${alpha.toFixed(3)})`);
    }

    const count = Math.min(CONFIG.SPACE_PARTICLE_COUNT, PARTICLE_HARD_CAP);
    const particles: Particle[] = [];

    function seed() {
      particles.length = 0;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        // 速度再開根號，讓快慢分布比較均勻，否則幾乎全部都慢到看不出在動 /
        // Take a square root of the speed roll so the spread is even; otherwise
        // nearly every particle is too slow to read as moving
        const speed = Math.sqrt(Math.random()) * CONFIG.SPACE_PARTICLE_MAX_SPEED;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size:
            CONFIG.SPACE_PARTICLE_MIN_SIZE +
            Math.random() * (CONFIG.SPACE_PARTICLE_MAX_SIZE - CONFIG.SPACE_PARTICLE_MIN_SIZE),
          shade: Math.floor(Math.random() * SHADES),
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    // `resize()` 必須在 `seed` 與 `particles` 都就緒之後才呼叫。
    // `resize` 會重新播種，所以它一開始不能在這裡跑：`const particles` 還在
    // temporal dead zone，會拋 `Cannot access 'particles' before initialization`。
    //
    // `resize()` must be called only once `seed` and `particles` both exist. It
    // re-seeds, so calling it up here hits the temporal dead zone on
    // `const particles` and throws
    // "Cannot access 'particles' before initialization".
    resize();

    // ── 可見性 / Visibility ─────────────────────────────────────────────────
    // 專案規則：動畫迴圈必須在離開視窗與分頁隱藏時暫停 /
    // Project rule: an animation loop must pause off-viewport and when hidden
    let inView = true;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    const onVisibilityChange = () => {
      if (document.hidden) drawFrame(0);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;

    /** 畫一格；`dt` 為 0 表示只畫不動 / One frame; `dt` of 0 draws without advancing */
    function drawFrame(dt: number) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        if (dt > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // 邊界環繞 / wrap at the edges
          if (p.x < 0) p.x += width;
          if (p.x > width) p.x -= width;
          if (p.y < 0) p.y += height;
          if (p.y > height) p.y -= height;
          p.phase += CONFIG.SPACE_PARTICLE_TWINKLE * dt;
        }
        // 閃爍：在兩階之間來回，不會超出量化範圍，所以不重建字串 /
        // Twinkle between two steps, so it never leaves the quantised range and
        // never rebuilds a string
        const twinkle = Math.sin(p.phase) > 0 ? p.shade : Math.max(0, p.shade - 1);
        ctx.fillStyle = shadeStrings[twinkle] ?? shadeStrings[0] ?? '';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 16.667;
      last = now;
      if (!inView || document.hidden || reduced) return;
      drawFrame(dt);
    };

    const onMotionChange = (event: MediaQueryListEvent) => {
      reduced = event.matches;
      if (reduced) {
        cancelAnimationFrame(raf);
        raf = 0;
        drawFrame(0);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    drawFrame(0);
    if (!reduced) raf = requestAnimationFrame(loop);

    // 第一次繪製已經在上面做過（`resize()` 之後、`drawFrame(0)` 那行），這裡只掛
    // 觀察器。/
    // The first paint already happened above (after `resize()`); only the observer
    // is attached here.
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery.removeEventListener('change', onMotionChange);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      // canvas 是替換元素，absolute inset-0 不會自動撐滿（會停在 300×150）；
      // w-full h-full 是必要的 /
      // A canvas is a replaced element: absolute inset-0 alone leaves it at its
      // intrinsic 300×150, so w-full h-full is required
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}