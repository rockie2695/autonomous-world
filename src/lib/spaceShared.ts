// ============================================================================
// 太空背景共用 / Space backdrop shared primitives
// ----------------------------------------------------------------------------
// 銀河與霧氣共用的小工具：定位（呼叫 sigma 的對應）與 canvas 色字串。這個模組不 import
// sigma，也不碰 DOM。
//
// Small shared primitives for the galaxy and the fog: placement (which calls sigma's
// own mapping) and canvas colour strings. This module imports neither sigma nor the DOM.
//
// ── 為什麼「不可」自行推導 / Why this must not be derived by hand ──
// sigma 的對應是 `screen = (framed − camera.position) × scale + centre`，所以
// `camera.x` 變大時**世界內容往左**移。而手寫的 `centre + (camera.x − 0.5) × k`
// 會讓背景往**右**移——背景於是與地圖**反向**漂移，看起來「不跟著地圖走」。
//
// Sigma's mapping is `screen = (framed − camera.position) × scale + centre`, so
// raising `camera.x` moves world content **left**. The hand-rolled
// `centre + (camera.x − 0.5) × k` moved the backdrop **right** — so it drifted
// *against* the map and read as "not following it".
//
// mapper 是**引數**，所以這個模組不 import sigma，也因此可以用假的 mapper 測出方向
// 是否正確（見 `spaceGalaxy.test.ts`）。
//
// The mapper is a **parameter**, so this module does not import sigma — which is
// also what lets a stub prove the sign (see `spaceGalaxy.test.ts`).
// ============================================================================

/**
 * 框化座標 → 視窗像素 / Framed coordinates → viewport pixels.
 *
 * 就是 sigma 的 `framedGraphToViewport`。本模組只宣告它的形狀。
 *
 * This is sigma's `framedGraphToViewport`; this module only declares its shape.
 */
export type FramedMapper = (p: { x: number; y: number }) => { x: number; y: number };

/** 世界座標裡的中心 / The centre in world coordinates */
export const FRAMED_CENTRE = 0.5;

/** 銀河在螢幕上的位置與大小 / Where the galaxy lands on screen. */
export interface FramedPlacement {
  /** 螢幕 x（像素）/ screen x, in pixels */
  cx: number;
  /** 螢幕 y（像素）/ screen y, in pixels */
  cy: number;
  /** 每個世界單位等於多少像素，已乘上要求的半徑比例 / pixels per world unit, times the requested radius */
  pxPerUnit: number;
}

/**
 * 把一個世界物體放到螢幕上 / Place a world object on screen.
 *
 * 中心直接取自 sigma 的對應；大小則是「世界單位一格等於多少螢幕像素」，量法是把兩個相鄰的
 * 框化點映射出來量距離。**不從 camera.x / y / ratio 推導**——那正是方向弄反的來源。
 *
 * The centre comes straight from sigma's mapping, and the size is "how many viewport
 * pixels is one world unit", measured by mapping two adjacent framed points. It is
 * **not** derived from camera.x / y / ratio — that is where the sign went wrong.
 *
 * 兩軸都量，並取**較大**的那個：sigma 的正規化讓「較大軸」恰為 1，所以較小軸每單位的
 * 像素數比較多，取小的那個會讓物體在某些視窗比例下變大。
 *
 * Both axes are measured and the **larger** is used: sigma's normalisation makes the
 * *larger* axis exactly 1, so the smaller axis has more pixels per unit, and taking
 * the smaller would inflate the object at some viewport aspects.
 *
 * @param mapper - sigma 的框化→視窗對應 / sigma's framed → viewport mapping
 * @param radiusFraction - 半徑（世界座標）/ the radius in world units
 * @returns 中心與每世界單位的像素數 / the centre, and pixels per world unit
 */
export function framedPlacement(mapper: FramedMapper, radiusFraction: number): FramedPlacement {
  const centre = mapper({ x: FRAMED_CENTRE, y: FRAMED_CENTRE });
  const origin = mapper({ x: 0, y: 0 });
  const unitX = mapper({ x: 1, y: 0 });
  const unitY = mapper({ x: 0, y: 1 });
  const pxPerUnit = Math.max(
    Math.hypot(unitX.x - origin.x, unitX.y - origin.y),
    Math.hypot(unitY.x - origin.x, unitY.y - origin.y),
  );
  return {
    cx: centre.x,
    cy: centre.y,
    // `1e-6` 而不是 0：倍率為 0 會讓 drawImage 縮到零、整層看不見，而退化情形應該
    // 寧可畫得極小也不要崩潰 /
    // `1e-6` rather than 0: a zero scale collapses drawImage and hides the layer, and a
    // degenerate case should draw something tiny rather than break.
    pxPerUnit: Math.max(pxPerUnit, 1e-6) * radiusFraction,
  };
}

/** 解析 `#rgb` / `#rrggbb` / Parse `#rgb` / `#rrggbb` */
export function parseHex(value: string): { r: number; g: number; b: number } | null {
  const text = value.trim();
  if (!text.startsWith('#')) return null;
  const hex = text.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (full.length !== 6) return null;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * 帶上 alpha 的 `rgba()` / `rgba()` with an alpha.
 *
 * 預先建好、整層共用——漸層的色標每幀只會用到固定的幾個，所以「每幀零配置」仍然成立。
 * 這是「為什麼不用 `hsla()`」的理由：config 存的是 `#rrggbb`，而銀河與霧氣都需要對它
 * 乘上一個來自 config 的 alpha。
 *
 * Pre-built and shared by the whole layer: a gradient's stops are always the same
 * handful, so "a frame allocates nothing" still holds. This is also why the layers do
 * not just use `hsla()`: config stores `#rrggbb`, and both layers need to multiply it
 * by an alpha that also comes from config.
 *
 * @param hex - `#rgb` 或 `#rrggbb` / the colour
 * @param alpha - 0..1 / the alpha
 * @returns `rgba()` 字串；解析失敗就原樣回傳 / an `rgba()` string, or the input
 */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (rgb === null) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** 線性內插 / Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}