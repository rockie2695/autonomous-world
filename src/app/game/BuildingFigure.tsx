// ============================================================================
// 建築等距圖 — 地點彈窗裡 堡壘/市場/兵營 的逐級外觀 / Building Figure — the
// isometric per-level look of fortress / market / barracks in the place popup
// ============================================================================
// 純靜態 SVG，零動畫、零狀態：`level`（0–5）是唯一的參數，場景由**逐級增量**
// 組成——`base` 是 0 級就有的結構，`add[l]` 是升到第 l 級時**新長出來**的部分。
// 這讓「升級幽靈」免費到手：ghost = add[level + 1]，虛線畫出你花錢買到的東西。
//
// Pure static SVG, no animation, no state: `level` (0–5) is the only parameter,
// and a scene is built from **per-level increments** — `base` exists at level 0,
// `add[l]` is what **grows** when reaching level l. That makes the upgrade ghost
// free: ghost = add[level + 1], dashed — what the money actually buys.
//
// 投影是 2:1 等距（dimetric），明暗走四階法（top 受光 / left 中間 / right 最暗 /
// line 描邊），全部顏色讀 `@theme static` 的 `--color-ds-*-{hi,md,lo,line}`
// 材料代幣——這個檔案不寫死任何顏色。遮擋用「畫家排序」：按 (x+y) 由遠到近
// 排序（等距投影裡 x+y 越小越遠），同深度按 z，其餘保持宣告順序。
//
// Projection is 2:1 isometric (dimetric); shading is the four-tone method
// (lit top / mid left / dark right / outline), with every colour read from the
// `@theme static` material tokens — nothing hard-coded here. Occlusion is
// painter's order: back-to-front by (x+y) (smaller x+y is farther in iso),
// then by z, then author order.
// ============================================================================

'use client';

import { BUILDING_MAX_LEVEL, type BuildingKind } from '@/lib/placeEffects';
import { t } from '@/lib/i18n';

// ── 等距投影 / Isometric projection ───────────────────────────────────────

/** cos 30°：等距 x 軸的螢幕比例 / The iso x-axis screen factor */
const ISO_C = 0.866;
/** 每世界單位的像素數 / Pixels per world unit */
const SCALE = 4.6;
/** 地面 10×10，中心在 (5,5)；viewBox 100×68 / Ground 10×10 centred at (5,5) */
const OX = 50;
const OY = 20;

type Pt = readonly [number, number];

/** 世界座標 → SVG 座標 / World coordinates → SVG coordinates */
function proj(x: number, y: number, z: number): Pt {
  return [OX + (x - y) * ISO_C * SCALE, OY + (x + y) * 0.5 * SCALE - z * SCALE];
}

// ── 材料與明暗 / Materials and tones ──────────────────────────────────────

type Mat = 'stone' | 'wood' | 'cloth' | 'banner';

/** 四階色：hi 受光、md 左臉、lo 右臉、line 描邊 / Four tones per material */
const TONE: Record<Mat, { hi: string; md: string; lo: string; line: string }> = {
  stone: {
    hi: 'var(--color-ds-stone-hi)',
    md: 'var(--color-ds-stone-md)',
    lo: 'var(--color-ds-stone-lo)',
    line: 'var(--color-ds-stone-line)',
  },
  wood: {
    hi: 'var(--color-ds-wood-hi)',
    md: 'var(--color-ds-wood-md)',
    lo: 'var(--color-ds-wood-lo)',
    line: 'var(--color-ds-wood-line)',
  },
  cloth: {
    hi: 'var(--color-ds-cloth-hi)',
    md: 'var(--color-ds-cloth-md)',
    lo: 'var(--color-ds-cloth-lo)',
    line: 'var(--color-ds-cloth-line)',
  },
  banner: {
    hi: 'var(--color-ds-banner-hi)',
    md: 'var(--color-ds-banner-md)',
    lo: 'var(--color-ds-banner-lo)',
    line: 'var(--color-ds-banner-line)',
  },
};

// ── 圖元 / Primitives ─────────────────────────────────────────────────────

/**
 * 一個可繪製的體素。座標是**世界單位**（地面 10×10，z 向上），由場景資料宣告、
 * `facesOf()` 攤平成多邊形。`under` 是地面類平板：永遠最先畫（否則後畫的廣場
 * 地坪會蓋住先畫的攤位底部）。
 *
 * One drawable voxel. Coordinates are **world units** (ground 10×10, z up),
 * declared as scene data and flattened to polygons by `facesOf()`. `under`
 * marks a ground-level slab: painted first (otherwise a later plaza floor
 * would paint over the stall bases drawn earlier).
 */
type Prim =
  | { t: 'box'; x: number; y: number; w: number; d: number; h: number; z?: number; mat: Mat; under?: boolean }
  | { t: 'pyr'; x: number; y: number; w: number; d: number; h: number; z?: number; mat: Mat; under?: boolean }
  | { t: 'cyl'; x: number; y: number; r: number; h: number; z?: number; mat: Mat; under?: boolean }
  /** 立在 y=const 平面上的垂直小板（旗面、盾牌）/ A vertical plate on the y=const plane (banner cloth, shield boards) */
  | { t: 'plate'; x0: number; x1: number; y: number; z0: number; z1: number; mat: Mat; under?: boolean }
  /** 四個世界角落任意的平面四邊形（貼斜面的門）/ A quad through four world corners (doors painted onto slopes) */
  | { t: 'quad'; c: readonly [number, number, number][]; mat: Mat; under?: boolean }
  /** 旗桿 + 旗面（桿是細 box，旗面是 plate）/ A pole plus its cloth */
  | { t: 'flag'; x: number; y: number; z: number; h: number; mat: Mat; under?: boolean };

/** Prim 的排序鍵：畫家序（遠→近）/ Painter's-order key for a prim (far → near) */
function depthOf(p: Prim): number {
  const cx = 'x' in p ? p.x : p.t === 'quad' ? p.c.reduce((s, q) => s + q[0], 0) / p.c.length : (p.x0 + p.x1) / 2;
  const cy =
    'y' in p
      ? p.y
      : p.t === 'quad'
        ? p.c.reduce((s, q) => s + q[1], 0) / p.c.length
        : 0;
  const z0 = p.t === 'plate' ? p.z0 : p.t === 'quad' ? Math.min(...p.c.map((q) => q[2])) : (p.z ?? 0);
  return cx + cy + z0 * 1e-3;
}

type Face = { pts: Pt[]; fill: string; stroke: string };

/** 立方體：受光頂面 + 左臉（y=y1）+ 右臉（x=x1）/ Cuboid: lit top, left face, right face */
function boxFaces(p: Extract<Prim, { t: 'box' }>): Face[] {
  const z0 = p.z ?? 0;
  const z1 = z0 + p.h;
  const x0 = p.x - p.w / 2;
  const x1 = p.x + p.w / 2;
  const y0 = p.y - p.d / 2;
  const y1 = p.y + p.d / 2;
  const tone = TONE[p.mat];
  return [
    { pts: [proj(x0, y0, z1), proj(x1, y0, z1), proj(x1, y1, z1), proj(x0, y1, z1)], fill: tone.hi, stroke: tone.line },
    // y=y1 的臉朝左下，吃中間調 / The y=y1 face looks lower-left and takes the mid tone
    { pts: [proj(x0, y1, z1), proj(x1, y1, z1), proj(x1, y1, z0), proj(x0, y1, z0)], fill: tone.md, stroke: tone.line },
    // x=x1 的臉朝右下，吃最暗調 / The x=x1 face looks lower-right and takes the dark tone
    { pts: [proj(x1, y0, z1), proj(x1, y1, z1), proj(x1, y1, z0), proj(x1, y0, z0)], fill: tone.lo, stroke: tone.line },
  ];
}

/** 四角錐（屋頂、帳篷）：只畫看得見的兩個前面 / Pyramid (roofs, tents): the two visible front faces */
function pyrFaces(p: Extract<Prim, { t: 'pyr' }>): Face[] {
  const z0 = p.z ?? 0;
  const apex = proj(p.x, p.y, z0 + p.h);
  const right = proj(p.x + p.w / 2, p.y - p.d / 2, z0);
  const front = proj(p.x + p.w / 2, p.y + p.d / 2, z0);
  const left = proj(p.x - p.w / 2, p.y + p.d / 2, z0);
  const tone = TONE[p.mat];
  return [
    { pts: [apex, left, front], fill: tone.md, stroke: tone.line },
    { pts: [apex, front, right], fill: tone.lo, stroke: tone.line },
  ];
}

/** 圓柱（塔、桶、泉）／Cylinder (towers, barrels, fountains) */
function cylFaces(p: Extract<Prim, { t: 'cyl' }>): Face[] {
  const z0 = p.z ?? 0;
  const z1 = z0 + p.h;
  const tone = TONE[p.mat];
  // 圓周取樣：θ 從 135°（最左）經 45°（最前）到 −45°（最右）是看得見的前弧
  // Circle sampling: θ from 135° (leftmost) through 45° (front) to −45°
  // (rightmost) is the visible front arc
  const arc = (from: number, to: number, n: number, z: number): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const th = ((from + ((to - from) * i) / n) * Math.PI) / 180;
      return proj(p.x + p.r * Math.cos(th), p.y + p.r * Math.sin(th), z);
    });
  const frontTop = arc(135, -45, 12, z1);
  const frontBottom = arc(135, -45, 12, z0);
  // 右側四分之一弧是暗面 / The right quarter arc is the dark side
  const rightTop = arc(45, -45, 6, z1);
  const rightBottom = arc(45, -45, 6, z0);
  return [
    // 項圈（完整橢圓）/ The top disc (full ellipse)
    { pts: arc(135, 135 + 360, 16, z1), fill: tone.hi, stroke: tone.line },
    { pts: [...frontTop, ...frontBottom], fill: tone.md, stroke: tone.line },
    { pts: [...rightTop, ...rightBottom], fill: tone.lo, stroke: tone.line },
  ];
}

/** 垂直小板 / A vertical plate */
function plateFaces(p: Extract<Prim, { t: 'plate' }>): Face[] {
  const tone = TONE[p.mat];
  return [
    {
      pts: [proj(p.x0, p.y, p.z1), proj(p.x1, p.y, p.z1), proj(p.x1, p.y, p.z0), proj(p.x0, p.y, p.z0)],
      fill: tone.lo,
      stroke: tone.line,
    },
  ];
}

/** 斜面上的四邊形（門跟著屋面走，不會浮在空中）/ A quad on a slope (a door follows its roof plane) */
function quadFaces(p: Extract<Prim, { t: 'quad' }>): Face[] {
  const tone = TONE[p.mat];
  return [{ pts: p.c.map((q) => proj(q[0], q[1], q[2])), fill: tone.lo, stroke: tone.line }];
}

/** 旗：細桿 + 右飄的旗面 / A flag: thin pole plus cloth flying to the right */
function flagPrims(p: Extract<Prim, { t: 'flag' }>): Prim[] {
  return [
    { t: 'box', x: p.x, y: p.y, w: 0.14, d: 0.14, h: p.h, z: p.z, mat: 'wood' },
    { t: 'plate', x0: p.x, x1: p.x + 1.5, y: p.y + 0.08, z0: p.z + p.h - 0.95, z1: p.z + p.h - 0.15, mat: p.mat },
  ];
}

/** Prim → 多邊形面 / A prim flattened to its polygons */
function facesOf(p: Prim): Face[] {
  switch (p.t) {
    case 'box':
      return boxFaces(p);
    case 'pyr':
      return pyrFaces(p);
    case 'cyl':
      return cylFaces(p);
    case 'plate':
      return plateFaces(p);
    case 'quad':
      return quadFaces(p);
    case 'flag':
      return flagPrims(p).flatMap(facesOf);
  }
}

// ── 場景資料 / Scene data ─────────────────────────────────────────────────
// 座標約定：地面 10×10、中心 (5,5)、z 向上，單位 ≈ 一層樓。
// Coordinate convention: ground 10×10 centred at (5,5), z up, one unit ≈ a storey.

/**
 * 每種建築：`base` 是 0 級就有的結構；`add[l-1]` 是升到第 l 級時新長出來的部分。
 * 逐級**只加不減**——外觀單調生長，讀起來就是「這一級蓋了什麼」。
 *
 * Per kind: `base` exists at level 0; `add[l-1]` is what grows at level l.
 * Levels only **add** — the look grows monotonically, so each level reads as
 * "what was built here".
 */
const SCENES: Record<BuildingKind, { base: Prim[]; add: Prim[][] }> = {
  fortress: {
    // 0 級：土丘與四根木樁 / Level 0: an earthen mound and four stakes
    base: [
      { t: 'box', x: 5, y: 5, w: 7.6, d: 7.6, h: 1.1, mat: 'wood', under: true },
      { t: 'box', x: 1.8, y: 1.8, w: 0.5, d: 0.5, h: 2.0, z: 1.1, mat: 'wood' },
      { t: 'box', x: 8.2, y: 1.8, w: 0.5, d: 0.5, h: 2.0, z: 1.1, mat: 'wood' },
      { t: 'box', x: 8.2, y: 8.2, w: 0.5, d: 0.5, h: 2.0, z: 1.1, mat: 'wood' },
      { t: 'box', x: 1.8, y: 8.2, w: 0.5, d: 0.5, h: 2.0, z: 1.1, mat: 'wood' },
    ],
    add: [
      // 1 級：石牆圍一圈 / Level 1: a ring of stone wall
      [
        { t: 'box', x: 5, y: 1.35, w: 7.3, d: 0.7, h: 2.6, z: 1.1, mat: 'stone' },
        { t: 'box', x: 1.35, y: 5, w: 0.7, d: 7.3, h: 2.6, z: 1.1, mat: 'stone' },
        { t: 'box', x: 8.65, y: 5, w: 0.7, d: 7.3, h: 2.6, z: 1.1, mat: 'stone' },
        { t: 'box', x: 5, y: 8.65, w: 7.3, d: 0.7, h: 2.6, z: 1.1, mat: 'stone' },
      ],
      // 2 級：東北角樓 / Level 2: the north-east corner tower
      [
        { t: 'cyl', x: 8.2, y: 1.8, r: 1.05, h: 3.4, z: 1.1, mat: 'stone' },
        { t: 'pyr', x: 8.2, y: 1.8, w: 2.4, d: 2.4, h: 1.5, z: 4.5, mat: 'banner' },
      ],
      // 3 級：西南角樓 / Level 3: the south-west corner tower
      [
        { t: 'cyl', x: 1.8, y: 8.2, r: 1.05, h: 3.4, z: 1.1, mat: 'stone' },
        { t: 'pyr', x: 1.8, y: 8.2, w: 2.4, d: 2.4, h: 1.5, z: 4.5, mat: 'banner' },
      ],
      // 4 級：中央主樓 / Level 4: the central keep
      [
        { t: 'box', x: 5, y: 5, w: 3.6, d: 3.6, h: 3.2, z: 1.1, mat: 'stone' },
        { t: 'pyr', x: 5, y: 5, w: 4.2, d: 4.2, h: 1.7, z: 4.3, mat: 'banner' },
      ],
      // 5 級：另外兩座角樓與主樓旗 / Level 5: the two remaining towers and the keep's banner
      [
        { t: 'cyl', x: 8.2, y: 8.2, r: 1.05, h: 3.4, z: 1.1, mat: 'stone' },
        { t: 'pyr', x: 8.2, y: 8.2, w: 2.4, d: 2.4, h: 1.5, z: 4.5, mat: 'banner' },
        { t: 'cyl', x: 1.8, y: 1.8, r: 1.05, h: 3.4, z: 1.1, mat: 'stone' },
        { t: 'pyr', x: 1.8, y: 1.8, w: 2.4, d: 2.4, h: 1.5, z: 4.5, mat: 'banner' },
        { t: 'flag', x: 5, y: 5, z: 6.0, h: 1.6, mat: 'banner' },
      ],
    ],
  },
  market: {
    // 0 級：一個攤位（櫃台 + 布棚）/ Level 0: one stall (counter plus awning)
    base: [
      { t: 'box', x: 4.2, y: 4.6, w: 3.2, d: 1.8, h: 1.15, mat: 'wood' },
      { t: 'box', x: 2.9, y: 5.6, w: 0.22, d: 0.22, h: 2.3, mat: 'wood' },
      { t: 'box', x: 5.5, y: 3.6, w: 0.22, d: 0.22, h: 2.3, mat: 'wood' },
      { t: 'box', x: 4.2, y: 4.6, w: 3.8, d: 2.4, h: 0.22, z: 2.3, mat: 'cloth' },
    ],
    add: [
      // 1 級：貨箱與桶 / Level 1: crates and a barrel
      [
        { t: 'box', x: 6.6, y: 5.6, w: 0.95, d: 0.95, h: 0.95, mat: 'wood' },
        { t: 'box', x: 7.6, y: 5.0, w: 0.8, d: 0.8, h: 0.8, mat: 'wood' },
        { t: 'cyl', x: 6.2, y: 4.3, r: 0.5, h: 1.05, mat: 'wood' },
      ],
      // 2 級：第二個攤位（彩棚）/ Level 2: a second stall under a coloured awning
      [
        { t: 'box', x: 7.0, y: 7.6, w: 3.0, d: 1.7, h: 1.05, mat: 'wood' },
        { t: 'box', x: 5.8, y: 8.5, w: 0.22, d: 0.22, h: 2.2, mat: 'wood' },
        { t: 'box', x: 8.2, y: 6.7, w: 0.22, d: 0.22, h: 2.2, mat: 'wood' },
        { t: 'box', x: 7.0, y: 7.6, w: 3.6, d: 2.3, h: 0.22, z: 2.2, mat: 'banner' },
      ],
      // 3 級：有頂商街（後排長棚）/ Level 3: a covered row at the back
      [
        { t: 'box', x: 3.4, y: 2.35, w: 5.6, d: 2.1, h: 1.9, mat: 'wood' },
        { t: 'box', x: 1.0, y: 3.4, w: 0.2, d: 0.2, h: 1.9, mat: 'wood' },
        { t: 'box', x: 5.8, y: 3.4, w: 0.2, d: 0.2, h: 1.9, mat: 'wood' },
        { t: 'box', x: 3.4, y: 2.35, w: 6.2, d: 2.7, h: 0.24, z: 1.9, mat: 'cloth' },
      ],
      // 4 級：商街的二層與旗 / Level 4: the row's upper storey and banners
      [
        { t: 'box', x: 3.4, y: 2.35, w: 5.2, d: 1.9, h: 1.35, z: 2.14, mat: 'wood' },
        { t: 'flag', x: 2.2, y: 2.35, z: 3.49, h: 1.2, mat: 'banner' },
        { t: 'flag', x: 4.6, y: 2.35, z: 3.49, h: 1.2, mat: 'banner' },
      ],
      // 5 級：廣場與噴泉 / Level 5: the plaza and a fountain
      [
        { t: 'box', x: 5, y: 6.2, w: 9.4, d: 7.2, h: 0.28, mat: 'stone', under: true },
        { t: 'cyl', x: 5, y: 6.2, r: 1.5, h: 0.85, mat: 'stone' },
        { t: 'cyl', x: 5, y: 6.2, r: 1.15, h: 0.2, z: 0.85, mat: 'banner' },
      ],
    ],
  },
  barracks: {
    // 0 級：一頂帳篷與營火 / Level 0: a tent and a campfire
    base: [
      { t: 'pyr', x: 3.6, y: 4.2, w: 3.2, d: 3.2, h: 2.3, mat: 'cloth' },
      // 門：貼著帳篷前坡的四邊形（跟屋面同斜率，不會浮在空中）
      // The door: a quad on the tent's front slope (same gradient as the face,
      // so it never floats)
      {
        t: 'quad',
        c: [
          [3.32, 5.78, 0],
          [3.88, 5.78, 0],
          [3.88, 5.03, 1.08],
          [3.32, 5.03, 1.08],
        ],
        mat: 'wood',
      },
      { t: 'cyl', x: 6.4, y: 6.6, r: 0.45, h: 0.35, mat: 'wood' },
      { t: 'cyl', x: 6.4, y: 6.6, r: 0.28, h: 0.55, z: 0.3, mat: 'banner' },
    ],
    add: [
      // 1 級：第二頂小帳與兵器架 / Level 1: a second small tent and a weapon rack
      [
        { t: 'pyr', x: 6.8, y: 3.4, w: 2.4, d: 2.4, h: 1.8, mat: 'cloth' },
        { t: 'box', x: 1.8, y: 6.8, w: 1.6, d: 0.35, h: 1.2, mat: 'wood' },
        { t: 'box', x: 1.3, y: 6.8, w: 0.12, d: 0.12, h: 2.2, mat: 'wood' },
        { t: 'box', x: 2.3, y: 6.8, w: 0.12, d: 0.12, h: 2.2, mat: 'wood' },
      ],
      // 2 級：木屋 / Level 2: a wooden hut
      [
        { t: 'box', x: 5.0, y: 3.0, w: 3.4, d: 2.6, h: 1.7, mat: 'wood' },
        { t: 'pyr', x: 5.0, y: 3.0, w: 4.0, d: 3.2, h: 1.1, z: 1.7, mat: 'wood' },
      ],
      // 3 級：長兵營與旗 / Level 3: the long barracks and its banner
      [
        { t: 'box', x: 4.6, y: 6.8, w: 5.6, d: 2.6, h: 2.0, mat: 'wood' },
        { t: 'pyr', x: 4.6, y: 6.8, w: 6.2, d: 3.2, h: 1.2, z: 2.0, mat: 'wood' },
        { t: 'flag', x: 4.6, y: 6.8, z: 3.2, h: 1.5, mat: 'banner' },
      ],
      // 4 級：石牆與練習樁 / Level 4: a stone wall and a training dummy
      [
        { t: 'box', x: 5, y: 8.9, w: 8.0, d: 0.6, h: 1.6, mat: 'stone' },
        { t: 'box', x: 9.0, y: 5, w: 0.6, d: 7.6, h: 1.6, mat: 'stone' },
        { t: 'box', x: 1.0, y: 5, w: 0.6, d: 7.6, h: 1.6, mat: 'stone' },
        { t: 'cyl', x: 2.2, y: 2.2, r: 0.3, h: 1.5, mat: 'wood' },
        { t: 'plate', x0: 1.7, x1: 2.7, y: 2.2, z0: 0.9, z1: 1.35, mat: 'wood' },
      ],
      // 5 級：崗樓與演武場 / Level 5: a watchtower and the drill yard
      [
        { t: 'box', x: 6.0, y: 6.0, w: 4.4, d: 4.4, h: 0.24, mat: 'stone', under: true },
        { t: 'cyl', x: 8.3, y: 8.3, r: 0.9, h: 3.6, mat: 'stone' },
        { t: 'pyr', x: 8.3, y: 8.3, w: 2.1, d: 2.1, h: 1.2, z: 3.6, mat: 'banner' },
      ],
    ],
  },
};

// ── 純幾何組裝（匯出供測試）/ Pure assembly (exported for tests) ──────────

/** 取 clamp 過的場景 prim（base + 前 level 級的增量）/ The clamped scene's prims */
export function figurePrims(kind: BuildingKind, level: number): Prim[] {
  const scene = SCENES[kind];
  const lvl = Math.max(0, Math.min(BUILDING_MAX_LEVEL, Math.round(level)));
  const add = scene.add.slice(0, lvl).flat();
  // 畫家序：地面類最先，其餘遠→近（x+y 小者遠），同深度按 z，再按宣告順序
  // Painter's order: floor slabs first, then far→near (small x+y first),
  // then by z, then author order
  const under = scene.base.filter((p) => p.under === true).concat(add.filter((p) => p.under === true));
  const solid = [...scene.base, ...add].filter((p) => p.under !== true);
  solid.sort((a, b) => depthOf(a) - depthOf(b));
  return [...under, ...solid];
}

/** 升到 level+1 會新長出的 prim（升級幽靈）/ What grows at level+1 (the upgrade ghost) */
export function figureGhostPrims(kind: BuildingKind, level: number): Prim[] {
  if (level >= BUILDING_MAX_LEVEL) return [];
  const scene = SCENES[kind];
  const lvl = Math.max(0, Math.min(BUILDING_MAX_LEVEL - 1, Math.round(level)));
  return (scene.add[lvl] ?? []).filter((p) => p.under !== true);
}

function toFaces(prims: Prim[]): Face[] {
  return prims.flatMap(facesOf);
}

/** 這一級的多邊形面（匯出：元件渲染與測試共用同一份幾何）/ The level's faces (exported: the component and the tests share one geometry) */
export function figureFaces(kind: BuildingKind, level: number): Face[] {
  return toFaces(figurePrims(kind, level));
}

/** 升級幽靈的面 / The upgrade ghost's faces */
export function figureGhostFaces(kind: BuildingKind, level: number): Face[] {
  return toFaces(figureGhostPrims(kind, level));
}

// ── 元件 / The component ──────────────────────────────────────────────────

/**
 * 地面基座：薄板 + 邊線，顏色走 inset 代幣 / The ground pad: a thin slab, inset tokens
 */
const PAD: Face = (() => {
  const x0 = 5 - 5.3;
  const x1 = 5 + 5.3;
  const y0 = 5 - 5.3;
  const y1 = 5 + 5.3;
  return {
    pts: [proj(x0, y0, 0), proj(x1, y0, 0), proj(x1, y1, 0), proj(x0, y1, 0)],
    fill: 'var(--color-ds-inset)',
    stroke: 'var(--color-ds-inset-line)',
  };
})();

export function BuildingFigure({
  kind,
  level,
  ghost = false,
  className = '',
}: {
  kind: BuildingKind;
  /** 0–5，越界會被夾住 / 0–5, clamped */
  level: number;
  /** 疊上「下一級會新增什麼」的虛線幽靈 / Overlay the dashed ghost of the next level */
  ghost?: boolean;
  className?: string;
}) {
  const lvl = Math.max(0, Math.min(BUILDING_MAX_LEVEL, Math.round(level)));
  const faces = figureFaces(kind, lvl);
  const ghostFaces = ghost ? figureGhostFaces(kind, lvl) : [];
  return (
    <svg
      viewBox="0 0 100 68"
      className={className}
      role="img"
      aria-label={`${t(`place.${kind}`)} · ${t('place.level')} ${lvl}`}
    >
      <polygon
        points={PAD.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}
        fill={PAD.fill}
        stroke={PAD.stroke}
        strokeWidth={0.6}
      />
      {faces.map((f, i) => (
        <polygon
          key={i}
          points={f.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}
          fill={f.fill}
          stroke={f.stroke}
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
      ))}
      {ghostFaces.map((f, i) => (
        <polygon
          key={`g${i}`}
          points={f.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}
          fill="var(--color-ds-cyan)"
          fillOpacity={0.07}
          stroke="var(--color-ds-cyan)"
          strokeWidth={0.9}
          strokeDasharray="2.5 2"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
