// ============================================================================
// 彩色流動塵埃 / Flow-field dust
// ----------------------------------------------------------------------------
// 粒子沿著 Simplex noise 場移動，形成絲帶、渦流與空洞。純邏輯在
// `src/lib/spaceFlow.ts`，這裡只負責畫與迴圈。
//
// Particles move along a Simplex noise field, forming ribbons, vortices and
// voids. The pure logic lives in `src/lib/spaceFlow.ts`; this file only draws and
// owns the loop.
//
// 刻意與樣板不同的三處 / Three deliberate departures from the sample:
//
// 1. **不用半透明填色來做拖尾。** 樣板每幀 `fillRect('rgba(5,6,10,0.08)')`，
//    那需要一個**不透明**底色才能淡出。本頁的底是漸層加兩團星雲，半透明疊加會
//    把漸層抹成一片糊，而且會不斷累積。改成每顆粒子自己淡入淡出。
//    **No translucent fill for the trails.** The sample's per-frame
//    `fillRect('rgba(5,6,10,0.08)')` needs an *opaque* backdrop to fade against.
//    This page's base is a gradient plus two nebula washes, so accumulating
//    translucent fills would smear it and never fully clear. Each particle fades
//    on its own instead.
//
// 2. **`lighter` 混合模式不用。** 疊加會讓絲帶交叉處變亮，讀起來像發光——但底下的
//    地圖也是亮的，那會直接吃掉道路的對比。
//    **`lighter` blending is not used.** Additive overlap makes crossings glow,
//    which reads as light — but the map underneath is already light, and that
//    would eat the roads' contrast.
//
// 3. **顏色穩定，不隨時間漂移**（見 `particleHue`）。加上漂移會讓藍紫慢慢轉成夕陽。
//    **Colours are stable and do not drift with time** (see `particleHue`).
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { CONFIG } from '@/lib/gameConfig';
import {
  buildFlowStyles,
  createFlowField,
  flowAngle,
  lifeFade,
  noiseClimb,
  particleHueIndex,
  spawnParticle,
  type FlowParticle,
} from '@/lib/spaceFlow';

/** 硬上限：設定可調低，絕不超過 / Hard cap: the setting may be lowered, never exceeded */
const PARTICLE_HARD_CAP = 1000;

export interface SpaceFlowProps {
  /** 額外 class / extra class */
  className?: string;
  /**
   * 鏡頭位置的 ref（框化座標）。粒子會依 `SPACE_FLOW_PARALLAX` 的比例跟著移動，所以塵埃
   * 浮在地圖上方而不是黏在上面。
   *
   * 刻意用 **ref 而不是數值 prop**：相機每幀都在動，數值 prop 會讓這個元件每幀重新
   * 渲染，而它只需要在動畫迴圈裡查���一次位置。
   *
   * Deliberately a **ref rather than numeric props**: the camera moves every frame, so
   * numeric props would re-render this component every frame when all it needs is to
   * read the position inside the animation loop.
   */
  cameraRef?: React.RefObject<{ x: number; y: number }>;
}

export function SpaceFlow({ className, cameraRef }: SpaceFlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 父層沒給 ref 時（單獨使用這個元件）就用自己的，視差等於 0——也就是不跟著鏡頭走，
  // 但畫面仍然正確。
  // With no ref from the parent (component used on its own), fall back to a local one,
  // which means zero parallax: no camera following, but still correct.
  const fallbackRef = useRef({ x: 0.5, y: 0.5 });
  const camera = cameraRef ?? fallbackRef;

  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (maybeCanvas === null) return;
    // 標上型別是必要的：下面的 `resize` / `drawFrame` 都是 hoisted function
    // declaration，TypeScript 不會把 `!maybeCanvas` 的收斂帶進去，裡面用到的
    // `canvas` 就會被判定成可能為 null。/
    // The explicit annotation is required: `resize` and `drawFrame` below are
    // hoisted function declarations, so TypeScript does not carry the narrowing
    // into them and `canvas` is treated as possibly null inside.
    const canvas: HTMLCanvasElement = maybeCanvas;
    const maybeCtx = canvas.getContext('2d');
    if (maybeCtx === null) return;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const field = createFlowField(CONFIG.SPACE_FLOW_SEED);
    const count = Math.min(CONFIG.SPACE_FLOW_PARTICLE_COUNT, PARTICLE_HARD_CAP);

    let width = 0;
    let height = 0;
    let dpr = 1;
    /** 場時間，與 rAF 的時間無關，所以背景分頁回來不會跳 /
     *  Field time, independent of rAF, so returning from a hidden tab does not jump */
    let fieldTime = 0;

    /**
     * 色相是**量化**的，所以整層只需要 `hueSteps` 個填色字串，而不是每顆粒子一個。
     * 顏色跟著場走，所以字串不能預先綁在粒子上——必須依「目前的色階」取用。
     *
     * The hue is **quantised**, so the whole layer needs only `hueSteps` fill
     * strings rather than one per particle. The colour follows the field, so a
     * string cannot be bound to a particle; it is looked up by the current step.
     */
    const styles = buildFlowStyles(field.options);
    const particles: FlowParticle[] = [];

    /**
     * 依目前的尺寸重新播種 / Re-seed for the current size.
     *
     * 位置用 0..1 的比例存，所以換尺寸不需要重新抽樣——只是乘上新的寬高。這也是
     * 「粒子位置不放絕對像素」的原因：視窗改變大小時分布才不會擠在角落。
     *
     * Positions are stored as 0..1 ratios, so a resize needs no new samples — only
     * multiplying by the new width and height. That is why positions are not kept
     * in absolute pixels: the distribution does not bunch into a corner when the
     * window changes size.
     */
    function seed() {
      particles.length = 0;
      for (let i = 0; i < count; i += 1) {
        particles.push(spawnParticle(`${CONFIG.SPACE_FLOW_SEED}:${i}`, field.options, true));
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, CONFIG.SPACE_DPR_CAP);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // `seed()` 必须在 `particles` 初始化之后调用 / must run after `particles` exists
      seed();
    }

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
      // 分頁回來時重設時基準，讓時間不要一次跳過一大段 /
      // Reset the clock when the tab comes back so time does not jump forward
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;

    /**
     * 畫一格；`dt` 為 0 表示只畫不動 / One frame; `dt` of 0 draws without advancing.
     *
     * 這個函式**必須**在 `resize()` 之前宣告：`resize()` 會呼叫 `seed()`，而
     * `seed()` 需要 `particles` 已經初始化。`resize()` 本身在 effect 後段才呼叫，
     * 所以順序是安全的。
     *
     * This function **must** be declared before `resize()` is *called*, because
     * `resize()` seeds and seeding needs `particles` initialised. The call happens
     * later in the effect, so the ordering is safe.
     */
    function drawFrame(dt: number) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (dt > 0) fieldTime += dt;

      const parallaxX = (camera.current.x - 0.5) * CONFIG.SPACE_FLOW_PARALLAX;
      const parallaxY = (camera.current.y - 0.5) * CONFIG.SPACE_FLOW_PARALLAX;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const px = p.x * width;
        const py = p.y * height;

        if (dt > 0) {
          const angle = flowAngle(field.noise, px, py, fieldTime, field.options);
          let vx = Math.cos(angle);
          let vy = Math.sin(angle);
          // 群聚：朝噪聲高的方向輕輕拉一把。單純的流場只會拉出細線，因為場的等值
          // 線本來就是長條；加一個「往上坡走」的力道，粒子就會聚成團塊與渦流。
          //
          // Clumping: a gentle pull up the noise gradient. A plain flow field only makes
          // thin lines, because the field's level sets *are* long strips; adding a
          // "walk uphill" force makes the particles gather into blobs and vortices.
          const gradient = noiseClimb(field.noise, px, py, fieldTime, field.options);
          vx += gradient.dx * field.options.clump;
          vy += gradient.dy * field.options.clump;
          const mag = Math.hypot(vx, vy) || 1;
          p.x += ((vx / mag) * p.speed * dt * field.options.flowSpeed) / width;
          p.y += ((vy / mag) * p.speed * dt * field.options.flowSpeed) / height;
          p.life += dt;

          // 出界或走完一生就重生。重生位置是整個畫面的比例，所以分布維持均勻 /
          // Respawn when out of bounds or life is spent. The new position is a
          // fraction of the canvas, so the spread stays even
          if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05 || p.life > p.maxLife) {
            const fresh = spawnParticle(
              `${CONFIG.SPACE_FLOW_SEED}:${i}:${Math.round(fieldTime)}`,
              field.options,
              false,
            );
            // 只保留大小；**顏色不保留**——色相是從重生後的新位置算出來的，所以新
            // 生落在哪一片場，就立刻屬於那一帶的顏色。保留舊顏色反而會讓顏色與位置
            // 脫鉤，那就不是「跟著場走」了。
            //
            // Only the size is carried over. The **colour is not**: the hue is derived
            // from wherever the particle respawns, so it immediately belongs to that
            // region's colour. Carrying the old hue would decouple colour from
            // position, which is precisely what "follows the field" must not do.
            fresh.size = p.size;
            particles[i] = fresh;
            continue;
          }
        }

        const fade = lifeFade(p.life, p.maxLife, field.options.fadeFraction);
        if (fade <= 0) continue;
        // 顏色由**當下位置**的噪聲決定，所以相鄰的粒子會落在同一個色階上，一條絲帶
        // 因此是一片同色。字串依量化索引取用，每幀零配置。
        //
        // The colour comes from the noise at the **current** position, so
        // neighbouring particles land on the same step and one ribbon becomes a
        // band of a single colour. The string is looked up by quantised index, so a
        // frame allocates nothing.
        const step = particleHueIndex(field.noise, px, py, fieldTime, field.options);
        ctx.globalAlpha = CONFIG.SPACE_FLOW_MAX_ALPHA * fade;
        ctx.fillStyle = styles[step] ?? styles[0] ?? '';
        ctx.beginPath();
        ctx.arc(
          p.x * width - parallaxX * width,
          p.y * height - parallaxY * height,
          p.size,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // 以 60fps 為基準正規化，換螢幕不會改變速度；並夾住上限，避免分頁恢復時
      // 一步跳過整段時間 /
      // Normalised against 60fps so a different refresh rate does not change the
      // speed, and clamped so returning to the tab cannot skip a whole span
      const dt = Math.min((now - last) / 16.667, 2);
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

    // 必須在 particles / styles 都宣告之後才呼叫 /
    // Must be called only after `particles` and `styles` are declared
    resize();

    drawFrame(0);
    if (!reduced) raf = requestAnimationFrame(loop);

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
      // canvas 是替換元素，absolute inset-0 不會自動撐滿（會停在 300×150）/
      // A canvas is a replaced element: absolute inset-0 alone leaves it at its
      // intrinsic 300×150, so w-full h-full is required
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}