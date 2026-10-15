// ============================================================================
// 背景銀河 / Background galaxy
// ----------------------------------------------------------------------------
// 一整顆緩慢自轉的星雲銀河，畫在地圖底下：中央一團柔軟的暖核、幾團低飽和的星雲、
// 一片往圓心集中的星點。幾何與純計算在 `src/lib/spaceGalaxy.ts`，這裡只負責烘焙、
// 繪製與迴圈。
//
// A slowly rotating nebula galaxy behind the map: a soft warm core, a few
// desaturated nebula patches, and a star field concentrating toward the centre. The
// geometry and pure maths live in `src/lib/spaceGalaxy.ts`; this file bakes, draws and
// owns the loop.
//
// 霧氣是**另一層**（`SpaceFog.tsx`），畫在銀河之上、地圖之下；結構與移動則由
// `SpaceFlow.tsx` 提供。
// The fog is a **separate layer** (`SpaceFog.tsx`) painted over the galaxy and under the
// map; structure and motion come from `SpaceFlow.tsx`.
//
// ── 位置與縮放完全交給 sigma / Placement is sigma's job, entirely ──
// 這一層**不從** `camera.x / y / ratio` 推導位置，而是呼叫 sigma 自己的
// `framedGraphToViewport()`（經由 `framedPlacement`），所以銀河真的躺在**世界座標**裡，
// 會跟著地圖一起平移與縮放。
//
// **這修掉了一個真實的 bug**：手寫的 `centre + (camera.x − 0.5) × k` 方向是反的
// （sigma 在 camera.x 變大時讓世界內容往左），背景於是與地圖反向漂移。
//
// This layer does **not** derive placement from camera.x / y / ratio. It calls sigma's
// own `framedGraphToViewport()` (via `framedPlacement`), so the galaxy genuinely sits in
// **world** coordinates and pans and zooms with the map.
//
// **That fixes a real bug**: the hand-rolled `centre + (camera.x − 0.5) × k` had the
// wrong sign, so the backdrop drifted against the map.
//
// ── 為什麼整顆「烤一次、再整張旋轉」/ Why the galaxy is baked, then rotated ──
// 整顆銀河在 resize 時一次烤進離屏 canvas，之後每幀只做一次帶旋轉的 `drawImage`：
//
//   * 每幀成本 = 一次 drawImage，與星點數量無關；
//   * **整層不使用任何噪聲**（Simplex 原本只為了擾動塵帶，塵帶拿掉後就沒有用途了）；
//   * 旋轉圓盤時**不會露出邊角**——圓盤是內切圓，而圓形對旋轉不變，所以旋轉整張
//     正方形影像後，那個圓盤的位置完全不會變，只有內部的結構在轉。
//
// The galaxy is baked into one offscreen canvas on resize and every frame is a single
// rotated `drawImage`:
//
//   * a frame costs one drawImage, independent of the star count;
//   * **the layer uses no noise at all** (Simplex existed only to wobble the dust lanes);
//   * rotating the disc never exposes a corner: the disc is an inscribed circle, and a
//     circle is invariant under rotation, so only its interior turns.
//
// ── 與樣板不同的兩處 / Two deliberate departures from the sample ──
//
// 1. **不用半透明填色做任何淡出。** 樣板每幀 `fillRect('rgba(...,0.08)')`，那需要一個
//    **不透明**底色才能淡出。本頁的底是漸層加星雲，半透明疊加會把它抹糊。淡化全部
//    發生在**烘焙**時（色標自帶 alpha），執行時不做累積。
//    **No translucent fill anywhere.** All fading happens at **bake** time, in the
//    gradient stops — a frame never accumulates anything.
//
// 2. **`lighter` 混合模式不用。** 疊加會讓星點交叉處變亮，但底下的地圖本來就亮，那會
//    直接吃掉道路的對比。
//    **`lighter` blending is not used.** That would eat the roads' contrast.
//
// 圓盤外是透明的，讓上層的 `bg-ds-space` 與 `bg-ds-space-nebula` 透出來。銀河是**世界**
// 裡的物體，所以平移時它會真的滑出畫面——那是正確的錨定，而不是缺陷。
//
// Outside the disc the canvas is transparent, so `bg-ds-space` and `bg-ds-space-nebula`
// show through. The galaxy is a **world** object, so panning genuinely slides it off
// frame — correct anchoring, not a defect.
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { CONFIG } from '@/lib/gameConfig';
import { framedPlacement, withAlpha, type FramedMapper } from '@/lib/spaceShared';
import { galaxyFade, galaxyLayout, galaxyOptions, rotateAt, type GalaxyOptions } from '@/lib/spaceGalaxy';

export interface SpaceGalaxyProps {
  /** 額外 class / extra class */
  className?: string;
  /**
   * 鏡頭狀態（框化座標）與 sigma 自己的框化→視窗對應。
   *
   * **兩者都要**：`framedGraphToViewport` 負責位置與縮放（正確方向），而 `ratio` 只用來
   * 驅動銀河的縮放淡出——它是單調遞減的，不需要任何換算。
   *
   * **Both are needed**: the mapping handles position and scale (with the correct sign),
   * while `ratio` only drives the zoom fade — it is monotonic, so it needs no conversion.
   *
   * 刻意用 **ref**：相機每幀都在動，數值 prop 會讓這個元件每幀重新渲染。
   *
   * Deliberately refs: the camera moves every frame, so numeric props would re-render
   * this component every frame.
   */
  cameraRef?: React.RefObject<{ x: number; y: number; ratio: number }>;
  /** sigma 的框化→視窗對應，由 `SigmaMap` 的 `onControlsReady` 提供 */
  mapperRef?: React.RefObject<FramedMapper | null>;
}

export function SpaceGalaxy({ className, cameraRef, mapperRef }: SpaceGalaxyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<{ x: number; y: number; ratio: number }>({
    x: 0.5,
    y: 0.5,
    ratio: CONFIG.MAP_FIT_PADDING,
  });
  const camera = cameraRef ?? fallbackRef;
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

    const options: GalaxyOptions = galaxyOptions();
    const layout = galaxyLayout(options.seed, options);

    let width = 0;
    let height = 0;
    let dpr = 1;
    /** 已經過的秒數，與 rAF 的時間無關，所以背景分頁回來不會跳 */
    let elapsed = 0;

    /** 離屏畫布與它的 2D context / the offscreen canvas and its 2D context */
    let baked: HTMLCanvasElement | null = null;
    let bakedCtx: CanvasRenderingContext2D | null = null;

    /**
     * 預先建好的填色字串 / The layer's pre-built fill strings.
     *
     * 漸層的色標永遠是這幾個，所以整層只建一次；每幀一次 `drawImage` 完全不會碰到
     * 字串，也就不會有配置。
     */
    const coreStops = [
      withAlpha(options.colorCore, options.coreAlpha),
      withAlpha(options.colorCore, options.coreAlpha * 0.55),
      withAlpha(options.colorMid, options.midAlpha),
      withAlpha(options.colorMid, 0),
    ];
    const nebulaColors = options.nebulaColors.map((c) => withAlpha(c, options.nebulaAlpha));
    const starColors = options.starColors.map((c) => withAlpha(c, options.starAlpha));

    /**
     * 把整顆銀河烤進離屏畫布 / Bake the galaxy into the offscreen canvas.
     *
     * 以**世界座標**的圓盤半徑（1 個世界單位）定義，所以它會隨地圖一起縮放——烘焙解析度
     * 只需保證「還看得見的最大尺寸」是銳利的，也就是銀河淡出之前那一刻。
     *
     * Defined against one **world unit**, so it scales with the map; the bake only has to
     * stay sharp at the largest size still visible, which is where the zoom fade takes
     * over.
     *
     * 順序是由大到小：核 → 星雲 → 星點。星點放最後，否則會被半透明星雲蓋掉而變模糊，
     * 而模糊正是這層最不能有的毛病，因為底下是道路。
     *
     * Order is largest-first: core → nebula → stars. Stars go last or the translucent
     * nebula covers them and blurs them, and blur is the one thing this layer can least
     * afford because roads sit under it.
     */
    function bake(radiusPx: number) {
      if (bakedCtx === null) return;
      const size = Math.max(2, Math.ceil(radiusPx * 2));
      bakedCtx.setTransform(1, 0, 0, 1, 0, 0);
      bakedCtx.clearRect(0, 0, size, size);
      bakedCtx.save();
      bakedCtx.translate(size / 2, size / 2);

      // ── 核 / the core ──
      const coreR = Math.max(1, layout.coreRadius * radiusPx);
      const coreGradient = bakedCtx.createRadialGradient(0, 0, 0, 0, 0, coreR);
      coreGradient.addColorStop(0, coreStops[0] ?? 'transparent');
      coreGradient.addColorStop(0.32, coreStops[1] ?? 'transparent');
      coreGradient.addColorStop(0.62, coreStops[2] ?? 'transparent');
      coreGradient.addColorStop(1, coreStops[3] ?? 'transparent');
      bakedCtx.fillStyle = coreGradient;
      bakedCtx.beginPath();
      bakedCtx.arc(0, 0, coreR, 0, Math.PI * 2);
      bakedCtx.fill();

      // ── 星雲 / nebula ──
      for (const blob of layout.blobs) {
        const bx = (blob.x - 0.5) * radiusPx;
        const by = (blob.y - 0.5) * radiusPx;
        const br = Math.max(1, blob.r * radiusPx);
        const grad = bakedCtx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0, nebulaColors[blob.color] ?? nebulaColors[0] ?? 'transparent');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bakedCtx.globalAlpha = blob.alpha / Math.max(options.nebulaAlpha, 1e-6);
        bakedCtx.fillStyle = grad;
        bakedCtx.beginPath();
        bakedCtx.arc(bx, by, br, 0, Math.PI * 2);
        bakedCtx.fill();
      }
      bakedCtx.globalAlpha = 1;

      // ── 星點 / stars ──
      for (const star of layout.stars) {
        const sx = (star.x - 0.5) * radiusPx;
        const sy = (star.y - 0.5) * radiusPx;
        // 星點按「離中心的距離」淡出邊緣，否則圓盤邊緣會出現一條突兀的截斷線。
        // `StarSpeck` 存的是 x/y，所以距離要算出來。/
        // Stars fade toward the rim, or the disc's edge shows as an abrupt cut.
        // `StarSpeck` stores x/y, so the radius has to be derived.
        const dist = Math.hypot(star.x - 0.5, star.y - 0.5);
        const fade = 1 - Math.pow(Math.min(1, dist / options.radiusFraction), 3);
        if (fade <= 0.02) continue;
        bakedCtx.globalAlpha = star.alpha * fade;
        bakedCtx.fillStyle = starColors[star.color] ?? starColors[0] ?? '#ffffff';
        bakedCtx.beginPath();
        bakedCtx.arc(sx, sy, star.size, 0, Math.PI * 2);
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

      // 烘焙解析度取「還看得見的最大半徑」：銀河在 `fadeRatio` 之前是完整的，那時圓盤
      // 可能比視窗還大，所以以該比例下的實際像素半徑烘焙，並且**離屏不套 DPR**（繪製時
      // 再乘），避免 4K 螢幕上糊掉。
      //
      // The bake is sized for the largest radius still visible: the galaxy is at full
      // strength down to `fadeRatio`, where the disc can exceed the viewport. The
      // offscreen does **not** apply DPR — the draw multiplies it — so it cannot go
      // soft on a 4K display.
      const place = framedPlacement(resolveMapper(), options.radiusFraction);
      const bakeRadius = clampInt(
        Math.max(place.pxPerUnit, Math.min(width, height) / Math.max(options.fadeRatio, 1e-6)),
        8,
        4096,
      );
      baked = document.createElement('canvas');
      baked.width = bakeRadius * 2;
      baked.height = bakeRadius * 2;
      bakedCtx = baked.getContext('2d');
      bake(bakeRadius);
    }

    /**
     * 畫一格；`dt` 是以 60fps 為單位的幀數，0 表示只畫不轉。
     *
     * 旋轉時間是**累加**出來的，而不是直接讀時鐘：暫停時（離開視窗、分頁隱藏）不累加，
     * 所以回到分頁時銀河是從原處繼續，而不是突然轉一大圈。
     *
     * The rotation clock is **accumulated** rather than read from a wall clock: while
     * paused (off-viewport, hidden tab) it does not advance, so returning to the tab
     * resumes from where it was instead of spinning forward.
     */
    function drawFrame(dt: number) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (baked === null) return;
      if (dt > 0) elapsed += dt / 60;

      // 拉近淡出：銀河在**世界**座標裡，所以它真的是 `1 / ratio`，拉到最近時圓盤會比視窗
      // 還大，變成一層暖色薄膜而吃掉道路對比 /
      // The zoom-in fade: the galaxy lives in **world** space, so its size really is
      // `1 / ratio`, and at maximum zoom-in the disc would exceed the viewport and
      // flatten into a film that costs the roads their contrast
      const alpha = galaxyFade(camera.current.ratio, options);
      if (alpha <= 0.01) return;

      // 位置與大小完全來自 sigma 的對應：銀河是**世界**裡的物體，跟地圖一起平移縮放 /
      // Position and size come entirely from sigma's mapping: the galaxy is a **world**
      // object, so it pans and zooms with the map
      const place = framedPlacement(resolveMapper(), options.radiusFraction);
      ctx.globalAlpha = alpha;
      ctx.translate(place.cx, place.cy);
      ctx.rotate(rotateAt(elapsed, options));
      ctx.drawImage(baked, -place.pxPerUnit, -place.pxPerUnit, place.pxPerUnit * 2, place.pxPerUnit * 2);
      ctx.globalAlpha = 1;
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

    const onVisibilityChange = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // 以 60fps 為基準正規化，換螢幕不會改變速度；並夾住上限，避免分頁恢復時
      // 一步跳過整段時間 /
      // Normalised against 60fps so a different refresh rate does not change the speed,
      // and clamped so returning to the tab cannot skip a whole span
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