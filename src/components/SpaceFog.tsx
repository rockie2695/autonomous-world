// ============================================================================
// 太空霧氣 / Space fog
// ----------------------------------------------------------------------------
// 一層種子化的**暖色星雲**，散在**世界座標**裡，畫在地圖**之下**、銀河**之上**。純邏輯在
// `src/lib/spaceFog.ts`，這裡只負責烘焙、繪製與迴圈。
//
// A seeded **warm** nebula scattered across **world** coordinates, painted *under* the map and
// *over* the galaxy. The pure logic lives in `src/lib/spaceFog.ts`; this file bakes, draws and
// owns the loop.
//
// ── 為什麼這一層在 SigmaMap **之前**/ Why this layer comes BEFORE SigmaMap ──
// 它現在是深處的背景，而不是蓋在地圖上的霧：畫在地圖之下，所以道路與節點在它之上，不會被
// 它蒙住。DOM 順序是「銀河 → 霧 → 流場塵埃 → 地圖」。
//
// It is now a deep backdrop rather than a haze over the map: painted *under* the map, so the
// roads and nodes sit on top of it and are never veiled by it. The order is galaxy → fog → dust →
// map.
//
// 它**不會**蓋到 HUD：`GameGraph` 是 `<main>` 的**第一個**子節點（`page.tsx`），而每一個 HUD
// 元素——回合時間軸、右欄、框角——都是**後面**的兄弟節點。
//
// It does **not** cover the chrome: `GameGraph` is `<main>`'s *first* child, and every HUD
// element — the round timeline, the side rail, the corner brackets — is a *later* sibling, so
// they all paint above this canvas.
//
// ── 它會**緩慢**漂移 / It drifts slowly ──
// 與銀河同一個做法：平移 → 旋轉 → 貼上烘焙好的圖，只是旋轉慢得多（20 分鐘一圈）。所以雲層
// 是「活的」，但一場遊戲裡看起來是深度而不是在轉。
//
// The same shape as the galaxy — translate → rotate → blit — only far slower (20 minutes a
// turn), so the cloud is alive but reads as depth rather than as something spinning.
//
// ── 為什麼定位走 sigma 的對應 / Why placement goes through sigma ──
// 與銀河同一個理由：自行推導會把平移方向算反。見 `spaceShared.ts`。
//
// For the same reason as the galaxy: deriving it by hand gets the pan sign wrong. See
// `spaceShared.ts`.
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { CONFIG } from '@/lib/gameConfig';
import { framedPlacement, withAlpha, type FramedMapper } from '@/lib/spaceShared';
import { fogLayout, fogOptions, fogRotateAt, type FogOptions } from '@/lib/spaceFog';

export interface SpaceFogProps {
  /** 額外 class / extra class */
  className?: string;
  /**
   * sigma 自己的框化→視窗對應，由 `SigmaMap` 的 `onControlsReady` 提供。
   *
   * 霧現在**沒有縮放淡出**，所以不需要 `ratio`：位置與縮放全部來自這個對應。
   *
   * Sigma's own framed → viewport mapping, provided by `SigmaMap`'s `onControlsReady`.
   * The fog has **no zoom fade** now, so it does not need `ratio` at all: position and
   * scale come entirely from this mapping.
   *
   * 刻意用 **ref**：相機每幀都在動，數值 prop 會讓這個元件每幀重新渲染。
   *
   * Deliberately a ref: the camera moves every frame, so a numeric prop would re-render
   * this component every frame.
   */
  mapperRef?: React.RefObject<FramedMapper | null>;
}

export function SpaceFog({ className, mapperRef }: SpaceFogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 沒有 sigma 的對應時退回一個螢幕不動的 stub，寧可畫錯位置也不要整層消失 /
  // Without sigma's mapping, fall back to a screen-fixed stub: wrong place beats gone.
  const fallbackMapper = useRef<FramedMapper>(() => ({ x: 0, y: 0 }));
  const mapperRefIn = mapperRef;
  /** 永遠回傳一個可用的 mapper / always yield a usable mapper */
  const resolveMapper = (): FramedMapper => mapperRefIn?.current ?? fallbackMapper.current;

  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (maybeCanvas === null) return;
    const canvas: HTMLCanvasElement = maybeCanvas;
    const maybeCtx = canvas.getContext('2d');
    if (maybeCtx === null) return;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const fog: FogOptions = fogOptions();
    const blobs = fogLayout(fog);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let elapsed = 0;
    /** 離屏畫布與它的 2D context / the offscreen canvas and its 2D context */
    let baked: HTMLCanvasElement | null = null;
    let bakedCtx: CanvasRenderingContext2D | null = null;

    /**
     * 預先建好的填色字串 / The pre-built fill strings.
     *
     * 色塊數量固定，所以整層只建一次；每幀一次 `drawImage` 完全不會碰到字串。
     *
     * The blob count is fixed, so the strings are built once; a frame is one
     * `drawImage` and never touches a string, so a frame allocates nothing.
     */
    const fogColors = fog.colors.map((c) => withAlpha(c, fog.alpha));

    /**
     * 把整團霧烤進離屏畫布 / Bake the whole fog into the offscreen canvas.
     *
     * 幾何以**世界座標**描述：一個世界單位等於 `size / 2` 像素，所以它會隨地圖一起縮放。
     *
     * The geometry is described in **world** coordinates — one world unit is `size / 2`
     * pixels — so it scales with the map.
     */
    function bake(radiusPx: number) {
      if (bakedCtx === null) return;
      const size = Math.max(2, Math.ceil(radiusPx * 2));
      bakedCtx.setTransform(1, 0, 0, 1, 0, 0);
      bakedCtx.clearRect(0, 0, size, size);
      bakedCtx.save();
      bakedCtx.translate(size / 2, size / 2);
      for (const blob of blobs) {
        // blob 的座標在 0..1，所以要位移半個世界單位才是以圓心為基準 /
        // The blobs sit in 0..1, so shift by half a world unit to centre on the disc
        const bx = (blob.x - 0.5) * radiusPx;
        const by = (blob.y - 0.5) * radiusPx;
        const br = Math.max(1, blob.r * radiusPx);
        const grad = bakedCtx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0, fogColors[blob.color] ?? fogColors[0] ?? 'transparent');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bakedCtx.globalAlpha = blob.alpha / Math.max(fog.alpha, 1e-6);
        bakedCtx.fillStyle = grad;
        bakedCtx.beginPath();
        bakedCtx.arc(bx, by, br, 0, Math.PI * 2);
        bakedCtx.fill();
      }
      bakedCtx.globalAlpha = 1;
      bakedCtx.restore();
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, CONFIG.SPACE_DPR_CAP);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 霧現在**一直可見**（沒有縮放淡出），所以最壞情形就是拉遠到世界單位最大時。以視窗
      // 短邊當半徑烘焙（拉遠時世界單位本來就大於視窗），並且離屏**不套 DPR**（繪製時再乘），
      // 4K 螢幕上才不會糊。
      //
      // The fog is now **always visible** (no zoom fade), so the worst case is simply the
      // largest world units, when zoomed out. Bake at the viewport's short edge and do
      // **not** apply DPR to the offscreen (the draw multiplies it), so it cannot go soft
      // on a 4K display.
      const bakeRadius = clampInt(Math.max(Math.min(width, height), 8), 8, 4096);
      baked = document.createElement('canvas');
      baked.width = bakeRadius * 2;
      baked.height = bakeRadius * 2;
      bakedCtx = baked.getContext('2d');
      bake(bakeRadius);
    }

    /**
     * 畫一格 / One frame.
     *
     * 與銀河同一個做法：平移 → 旋轉 → 貼上烘焙好的圖。旋轉很慢（20 分鐘一圈），
     * 所以雲層會**緩慢**漂移，而不是看起來在轉。
     *
     * The same shape as the galaxy: translate → rotate → blit. The rotation is slow (20
     * minutes a turn), so the cloud *drifts* rather than appearing to spin.
     */
    function drawFrame(dt: number) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (baked === null) return;
      if (dt > 0) elapsed += dt / 60;

      // 位置與大小完全來自 sigma 的對應：霧是散在世界裡的雲層，會跟地圖一起平移縮放 /
      // Position and size come entirely from sigma's mapping: the fog is a cloud
      // scattered through the world, so it pans and zooms with the map
      const place = framedPlacement(resolveMapper(), 1);
      ctx.translate(place.cx, place.cy);
      ctx.rotate(fogRotateAt(elapsed, fog));
      ctx.drawImage(
        baked,
        -place.pxPerUnit,
        -place.pxPerUnit,
        place.pxPerUnit * 2,
        place.pxPerUnit * 2,
      );
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── 可見性 / Visibility ─────────────────────────────────────────────────
    // 專案規則：動畫迴圈必須在離開視窗與分頁隱藏時暫停 /
    // Project rule: a loop must pause off-viewport and when hidden
    let inView = true;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const onVisibilityChange = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
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
      // 放掉離屏畫布，讓它可以被回收 /
      // Drop the offscreen canvas so it can be collected
      baked = null;
      bakedCtx = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      // `pointer-events-none` 保留：這一層現在畫在地圖**之下**，不再是攔截事件的原因，但
      // 維持一致，也避免日後搬動時忘記。
      //
      // `pointer-events-none` is kept: this layer now paints *under* the map, so it is no
      // longer what lets events through, but it stays for consistency and safety.
      //
      // canvas 是替換元素，absolute inset-0 不會自動撐滿（會停在 300×150）/
      // A canvas is a replaced element: absolute inset-0 alone leaves it at its
      // intrinsic 300×150, so w-full h-full is required
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}

/** 夾到整數範圍 / Clamp to an integer range */
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}