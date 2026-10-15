// ============================================================================
// 太空霧氣 / Space fog
// ----------------------------------------------------------------------------
// 一層種子化的雲，散在**世界座標**裡，畫在 sigma 的框化→視窗對應上。純邏輯，與 DOM
// 無關；實際的繪製在 `SpaceFog.tsx`。
//
// A seeded cloud layer scattered across **world** coordinates, drawn through sigma's
// framed → viewport mapping. Pure logic, no DOM; `SpaceFog.tsx` draws it.
//
// ── 它畫在「地圖之下、銀河之上」/ It paints UNDER the map and OVER the galaxy ──
// `SpaceFog` 是 `SpaceGalaxy` **之後**、`SigmaMap` **之前**的兄弟節點，所以它在銀河
// 上面、在道路／節點／領地填色**下面**。DOM 順序是「銀河 → 霧 → 塵埃 → 地圖」。
//
// `SpaceFog` is a sibling rendered **after** `SpaceGalaxy` and **before** `SigmaMap`, so
// it sits over the galaxy and *under* the roads, nodes and territory fills. The order is
// galaxy → fog → dust → map.
//
// 它**不會**蓋到 HUD：`GameGraph` 是 `<main>` 的**第一個**子節點，而每一個 HUD 元素
// （回合時間軸、右欄、框角）都是**後面**的兄弟節點，所以它們畫在這張 canvas 之上。
//
// It does **not** cover the chrome: `GameGraph` is `<main>`'s *first* child, and every HUD
// element is a *later* sibling, so they all paint above this canvas.
//
// ── 為什麼它會**緩慢**漂移 / Why it drifts slowly ──
// 與銀河同一個做法（平移 → 旋轉 → 貼上烘焙好的圖），只是慢得多：20 分鐘一圈。所以雲層
// 是「活的」，但一場遊戲裡看起來是深度而不是在轉。
//
// The same shape as the galaxy — translate → rotate → blit — only far slower (20 minutes a
// turn), so the cloud is alive but reads as depth rather than as something spinning.
//
// ── 為什麼沒有縮放淡出 / Why there is no zoom fade ──
// 它現在是**背景**，不是蓋在地圖上的霧——畫在地圖之下，所以拉近時道路與節點仍然在它
// 之上，沒有理由要讓它消失。
//
// It is now a **backdrop**, not a haze over the map: painted under the map, so roads and
// nodes always sit above it and there is no reason for it to vanish as you zoom in.
// ============================================================================

import { createRng } from '@/lib/rng';
import { CONFIG } from '@/lib/gameConfig';

/** 一整圈 / A full turn */
const TAU = Math.PI * 2;

/** 霧氣所需的參數 / The parameters the fog needs */
export interface FogOptions {
  seed: string;
  count: number;
  /** 色塊半徑（世界座標）/ patch radius in world units */
  radius: number;
  /** 每個色塊的密度範圍 / the per-patch density range */
  densityMin: number;
  densityMax: number;
  alpha: number;
  colors: string[];
  /** 自轉一整圈的秒數；<= 0 表示不轉 / seconds per full turn; <= 0 disables rotation */
  rotatePeriodSec: number;
}

/** 一團霧氣 / One fog patch */
export interface FogBlob {
  x: number;
  y: number;
  r: number;
  alpha: number;
  color: number;
}

/** 用 CONFIG 建立參數 / Build the fog options from CONFIG */
export function fogOptions(): FogOptions {
  return {
    seed: CONFIG.SPACE_FOG_SEED,
    count: CONFIG.SPACE_FOG_COUNT,
    radius: CONFIG.SPACE_FOG_RADIUS,
    densityMin: CONFIG.SPACE_FOG_DENSITY_MIN,
    densityMax: CONFIG.SPACE_FOG_DENSITY_MAX,
    alpha: CONFIG.SPACE_FOG_ALPHA,
    colors: CONFIG.SPACE_FOG_COLORS,
    rotatePeriodSec: CONFIG.SPACE_FOG_ROTATE_PERIOD_SEC,
  };
}

/**
 * 建立霧氣 / Build the fog.
 *
 * 「隨機」是**種子的**：同一個種子永遠得到同一團霧，重新掛載不會讓整層跳動。這是全專案的
 * 慣例（星點與名字生成都如此）。
 *
 * "Random" means **seeded**: the same seed always yields the same fog, so a remount
 * cannot make the layer jump. That is the project-wide convention.
 *
 * 色塊均勻撒在整個世界座標裡，而不是集中在圓心——霧是散在路徑上的雲層，不是核心的光暈。
 *
 * The patches spread evenly across world space rather than clustering at the centre: the
 * fog is a cloud layer scattered along your path, not a halo around the core.
 *
 * @param options - 霧氣參數 / the fog options
 * @returns 幾何 / the geometry
 */
export function fogLayout(options: FogOptions): FogBlob[] {
  const rng = createRng(`${options.seed}:layout`);
  const blobs: FogBlob[] = [];
  for (let i = 0; i < options.count; i += 1) {
    // 每個色塊抽一個**密度**，而密度同時決定它的 alpha 與半徑：濃的地方又白又大，稀的
    // 地方又暗又小。若分開抽，這兩件事會互相打架（出現又大又透明的色塊），看起來像 bug。
    //
    // Each patch draws one **density**, and that drives both its alpha and its radius: a
    // dense patch is both brighter and larger. Drawing them separately lets them fight —
    // a big transparent patch, which reads as a bug.
    const density = options.densityMin + rng.float(0, 1) * (options.densityMax - options.densityMin);
    blobs.push({
      x: rng.float(0, 1),
      y: rng.float(0, 1),
      // 半徑跟著密度走，用平方讓稀疏處收得更快、濃密處更突出 /
      // Radius follows density, squared so thin areas collapse faster and dense ones stand out
      r: options.radius * (0.5 + 1.1 * density * density),
      alpha: options.alpha * density,
      color: Math.min(
        options.colors.length - 1,
        Math.floor(rng.float(0, options.colors.length)),
      ),
    });
  }
  return blobs;
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
 * @param options - 霧氣參數 / the fog options
 * @returns 弧度 / radians
 */
export function fogRotateAt(seconds: number, options: FogOptions): number {
  if (options.rotatePeriodSec <= 0) return 0;
  const turns = (seconds / options.rotatePeriodSec) % 1;
  return (turns < 0 ? turns + 1 : turns) * TAU;
}