// ============================================================================
// 背景銀河 / Background galaxy
// ----------------------------------------------------------------------------
// 一整顆緩慢自轉的星雲銀河，畫在地圖底下：**深處的核、星雲與星點**。**純邏輯，與 DOM
// 無關**：這個模組只回傳資料與純計算，實際的繪製在 `SpaceGalaxy.tsx`。
//
// A slowly rotating nebula galaxy behind the map: the core, nebula patches and stars in
// the distance. **Pure logic, no DOM**: this module returns data and pure calculations
// only; `SpaceGalaxy.tsx` draws it.
//
// 霧氣是**另一層**（`spaceFog.ts` / `SpaceFog.tsx`），畫在銀河之上、地圖之下。
// The fog is a **separate layer** (`spaceFog.ts` / `SpaceFog.tsx`), painted over the
// galaxy and under the map.
//
// ── 為什麼位置與縮放「完全交給 sigma」/ Why placement is sigma's job, entirely ──
// 這一層不再有自己的視差，也不再夾縮放。定位走的是 `framedPlacement()`（見
// `spaceShared.ts`），那裡呼叫 sigma 自己的 `framedGraphToViewport()`，所以銀河真的
// 躺在**世界座標**裡，而不是螢幕座標裡。
//
// **這是修一個真實的 bug。** 手寫的 `centre + (camera.x − 0.5) × k` 方向是反的：
// sigma 在 `camera.x` 變大時讓世界內容往**左**移，而那個式子讓背景往**右**移，於是背景
// 與地圖**反向**漂移，平移時看起來「不跟著地圖走」。
//
// This layer has no parallax and no zoom clamp of its own. Placement goes through
// `framedPlacement()`, which calls sigma's own `framedGraphToViewport()`, so the galaxy
// genuinely sits in **world** coordinates.
//
// **That fixed a real bug.** The hand-rolled `centre + (camera.x − 0.5) × k` had the wrong
// sign: sigma moves world content *left* as camera.x rises, while that expression moved
// the backdrop *right*, so it drifted against the map.
//
// ── 為什麼需要「拉近淡出」/ Why the zoom-in fade is load-bearing ──
// 精確跟隨 sigma 代表縮放是真正的 `1 / ratio`。而 sigma 的 ratio 跨 0.05..3（60 倍），
// 銀河在 ratio 0.05 時會比視窗大約九倍——整片畫面被糊成一層暖色薄膜，道路的對比就沒了。
// 所以 ratio 低於 `SPACE_GALAXY_FADE_RATIO` 之後銀河淡出。
//
// Following sigma exactly means scale really is `1 / ratio`. Sigma's ratio spans
// 0.05..3 (60×), so at 0.05 the galaxy is roughly nine times the viewport: the frame
// becomes a flat warm film and the roads lose their contrast. Below
// `SPACE_GALAXY_FADE_RATIO` the galaxy therefore fades out.
//
// ── 為什麼整層「完全不用噪聲」/ Why this layer uses no noise at all ──
// 它**曾經**有褐色塵帶，紋理靠 Simplex 噪聲擾動半徑。塵帶拿掉後噪聲沒有任何用途，
// 所以 `three` 的 SimplexNoise 已從這個模組移除。整層只是種子化的幾何。
//
// It **used** to carry brown dust lanes whose texture came from wobbling the radius with
// Simplex noise. With the lanes gone the noise had no remaining purpose, so `three`'s
// SimplexNoise is no longer imported. The layer is seeded geometry.
//
// 拿掉塵帶的代價要講清楚：**塵帶是唯一的螺旋結構**。沒有它，這是一團柔軟發光的星雲而不是
// 可辨認的螺旋——這是刻意取捨，結構與移動交給上層的流場塵埃。
//
// Removing the lanes has a cost worth stating: they were the galaxy's only spiral
// structure. Without them this reads as a soft glowing star cloud, not a spiral — a
// deliberate trade, since the flow-field layer above now supplies the structure.
//
// 注意座標：星點都在**世界座標**裡描述（中心 (0.5, 0.5)、半徑 `RADIUS_FRACTION`），
// 所以它們會隨地圖一起平移與縮放。
//
// Note the coordinates: stars are described in **world** coordinates — centre (0.5, 0.5),
// extent `RADIUS_FRACTION` — so they pan and zoom with the map.
// ============================================================================

import { createRng } from '@/lib/rng';
import { CONFIG } from '@/lib/gameConfig';
import { FRAMED_CENTRE } from '@/lib/spaceShared';

/** 一整圈 / A full turn */
const TAU = Math.PI * 2;

/** 一顆銀河所需的參數 / The parameters a galaxy needs */
export interface GalaxyOptions {
  /** 種子，讓整顆銀河可重現 / seed, so the galaxy is reproducible */
  seed: string;
  /** 圓盤半徑（世界座標，1 = 整個世界寬度的一半）/ disc radius in world units */
  radiusFraction: number;
  /** 核的半徑（圓盤半徑的比例）/ core radius, as a fraction of the disc */
  coreRadius: number;
  /** 核亮度上限 / core alpha ceiling */
  coreAlpha: number;
  /** 盤面的中段亮度 / mid-disc alpha */
  midAlpha: number;
  /** 核的顏色 / core colour */
  colorCore: string;
  /** 盤面中段的顏色 / mid-disc colour */
  colorMid: string;
  /** 星雲色塊數量 / number of nebula blobs */
  nebulaBlobs: number;
  /** 星雲色塊半徑（圓盤半徑的比例）/ blob radius, fraction of the disc */
  nebulaRadius: number;
  /** 星雲不透明度上限 / nebula alpha ceiling */
  nebulaAlpha: number;
  /** 星雲顏色 / nebula colours */
  nebulaColors: string[];
  /** 星點數量 / number of stars */
  starCount: number;
  starMinSize: number;
  starMaxSize: number;
  /** 星點不透明度上限 / star alpha ceiling */
  starAlpha: number;
  /** 星點顏色 / star colours */
  starColors: string[];
  /** 自轉一整圈的秒數；<= 0 表示不轉 / seconds per full turn; <= 0 disables */
  rotatePeriodSec: number;
  /** ratio 低於此值銀河開始變淡 / below this ratio the galaxy starts to dim */
  fadeRatio: number;
  /** 淡出的下限：銀河永遠不會完全消失 / the fade floor; the galaxy never fully disappears */
  fadeMin: number;
}

/** 用 CONFIG 建立參數 / Build the options from CONFIG */
export function galaxyOptions(): GalaxyOptions {
  return {
    seed: CONFIG.SPACE_GALAXY_SEED,
    radiusFraction: CONFIG.SPACE_GALAXY_RADIUS_FRACTION,
    coreRadius: CONFIG.SPACE_GALAXY_CORE_RADIUS,
    coreAlpha: CONFIG.SPACE_GALAXY_CORE_ALPHA,
    midAlpha: CONFIG.SPACE_GALAXY_MID_ALPHA,
    colorCore: CONFIG.SPACE_GALAXY_COLOR_CORE,
    colorMid: CONFIG.SPACE_GALAXY_COLOR_MID,
    nebulaBlobs: CONFIG.SPACE_GALAXY_NEBULA_BLOBS,
    nebulaRadius: CONFIG.SPACE_GALAXY_NEBULA_RADIUS,
    nebulaAlpha: CONFIG.SPACE_GALAXY_NEBULA_ALPHA,
    nebulaColors: CONFIG.SPACE_GALAXY_NEBULA_COLORS,
    starCount: CONFIG.SPACE_GALAXY_STAR_COUNT,
    starMinSize: CONFIG.SPACE_GALAXY_STAR_MIN_SIZE,
    starMaxSize: CONFIG.SPACE_GALAXY_STAR_MAX_SIZE,
    starAlpha: CONFIG.SPACE_GALAXY_STAR_ALPHA,
    starColors: CONFIG.SPACE_GALAXY_STAR_COLORS,
    rotatePeriodSec: CONFIG.SPACE_GALAXY_ROTATE_PERIOD_SEC,
    fadeRatio: CONFIG.SPACE_GALAXY_FADE_RATIO,
    fadeMin: CONFIG.SPACE_GALAXY_FADE_MIN,
  };
}

/** 一顆星點 / One star speck */
export interface StarSpeck {
  x: number;
  y: number;
  size: number;
  alpha: number;
  /** 顏色索引，不是顏色本身 / colour index, not the colour */
  color: number;
}

/** 一團星雲 / One nebula blob */
export interface NebulaBlob {
  x: number;
  y: number;
  r: number;
  alpha: number;
  color: number;
}

/** 一整顆銀河的幾何 / The galaxy's geometry, in world coordinates */
export interface GalaxyLayout {
  /** 核的半徑（世界座標）/ core radius in world units */
  coreRadius: number;
  stars: StarSpeck[];
  blobs: NebulaBlob[];
}

/**
 * 建立整顆銀河的幾何 / Build the galaxy's geometry.
 *
 * 星點的分佈用 `pow(u, STAR_BIAS)`，指數 > 1 會把樣本往圓心推，所以中心比外圍密
 * ——真實銀河就是如此，星族集中在核心。
 *
 * Stars use `pow(u, STAR_BIAS)`; an exponent above 1 pushes samples toward the centre,
 * so the core is denser than the rim — as in a real galaxy.
 *
 * 星雲色塊撒在圓盤半徑的 12%–82% 之間，避免整顆都被霧蓋住。
 *
 * Nebula blobs land between 12% and 82% of the disc radius, so the galaxy is never
 * uniformly fogged over.
 *
 * @param seed - 種子 / the seed
 * @param options - 銀河參數 / the galaxy options
 * @returns 幾何 / the geometry
 */
export function galaxyLayout(seed: string, options: GalaxyOptions): GalaxyLayout {
  const rng = createRng(`${seed}:layout`);
  const r = options.radiusFraction;

  // 指數 > 1 → 樣本往圓心集中 / exponent > 1 → samples concentrate at the centre
  const STAR_BIAS = 1.7;
  const stars: StarSpeck[] = [];
  for (let i = 0; i < options.starCount; i += 1) {
    const dist = Math.pow(rng.float(0, 1), STAR_BIAS) * r;
    const theta = rng.float(0, TAU);
    // 外圍的星略小、略暗，邊緣因此收得住 / Rim stars run smaller and dimmer, so the edge settles
    const rim = dist > r * 0.62 ? 0.8 : 1;
    stars.push({
      x: FRAMED_CENTRE + Math.cos(theta) * dist,
      y: FRAMED_CENTRE + Math.sin(theta) * dist,
      size: (options.starMinSize + rng.float(0, options.starMaxSize - options.starMinSize)) * rim,
      alpha: options.starAlpha * (0.35 + 0.65 * (1 - dist / r)) * rng.float(0.6, 1),
      color: Math.min(
        options.starColors.length - 1,
        Math.floor(rng.float(0, options.starColors.length)),
      ),
    });
  }

  const blobs: NebulaBlob[] = [];
  for (let i = 0; i < options.nebulaBlobs; i += 1) {
    const dist = rng.float(0.12, 0.82) * r;
    const theta = rng.float(0, TAU);
    blobs.push({
      x: FRAMED_CENTRE + Math.cos(theta) * dist,
      y: FRAMED_CENTRE + Math.sin(theta) * dist,
      r: options.nebulaRadius * rng.float(0.6, 1.25),
      alpha: options.nebulaAlpha * rng.float(0.5, 1),
      color: Math.min(
        options.nebulaColors.length - 1,
        Math.floor(rng.float(0, options.nebulaColors.length)),
      ),
    });
  }

  return { coreRadius: options.coreRadius * r, stars, blobs };
}

/**
 * 銀河的淡出倍率 / The galaxy's fade multiplier, 0..1.
 *
 * 銀河放在**世界**座標裡，所以它的大小是 `1 / ratio`；ratio 越低圓盤越大，拉到最近時會蓋住
 * 整個畫面。所以拉近時降低它的存在感——但**只降到 `fadeMin`，不會降到 0**。
 *
 * 為什麼保留下限：淡到 0 會讓畫面變成一片純黑深空，那看起來像壞掉而不是意圖。銀河應該永遠
 * 是背景的一部分。
 *
 * The galaxy lives in **world** space, so its size is `1 / ratio`: the lower the ratio the
 * larger the disc, and at maximum zoom-in it covers the whole frame. So it dims as you
 * zoom in — but **only down to `fadeMin`, never to 0**.
 *
 * Why a floor: fading to 0 leaves a pure-black frame, which reads as broken rather than
 * intended. The galaxy should always remain part of the background.
 *
 * @param ratio - sigma 的 ratio / sigma's camera ratio
 * @param options - 銀河參數 / the galaxy options
 * @returns 0..1 / 0..1
 */
export function galaxyFade(ratio: number, options: GalaxyOptions): number {
  if (!Number.isFinite(ratio)) return options.fadeMin;
  if (ratio >= options.fadeRatio) return 1;
  if (ratio <= 0) return options.fadeMin;
  const t = Math.max(0, Math.min(1, ratio / options.fadeRatio));
  return options.fadeMin + (1 - options.fadeMin) * t;
}

/**
 * 某一時刻的旋轉角度 / The rotation angle at a given moment.
 *
 * 取模成 0..2π，所以時間再久也不會累積成天文數字，浮點不會開始抖。
 *
 * Modulo 2π, so however long the page has been open the angle never grows into an
 * astronomical number and the float never starts to judder.
 *
 * @param seconds - 已經過的秒數 / elapsed seconds
 * @param options - 銀河參數 / the galaxy options
 * @returns 弧度 / radians
 */
export function rotateAt(seconds: number, options: GalaxyOptions): number {
  if (options.rotatePeriodSec <= 0) return 0;
  const turns = (seconds / options.rotatePeriodSec) % 1;
  return (turns < 0 ? turns + 1 : turns) * TAU;
}
