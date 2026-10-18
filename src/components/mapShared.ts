// ============================================================================
// Sigma 地圖的共用純邏輯 / Shared pure logic for the sigma map
// ----------------------------------------------------------------------------
// 顏色換算、資料型別，以及那組讓外部按鈕控制鏡頭的 `MapCameraControls`。全部與 React
// 和 canvas 都無關，所以從 `SigmaMap.tsx` 分出來之後元件本身短了很多，而且這些東西
// 可以各自單獨測。
//
// Colour conversion, the data shapes, and `MapCameraControls` (the handle the floating
// buttons use to drive the camera). None of it touches React or a canvas, so pulling it
// out shortens the component and each piece stands alone.
//
// 這個檔案刻意**不含** 'use client'：它是純模組。
// Deliberately carries no 'use client': it is a plain module.
// 功能 / Features:
// - 節點 = 勢力色、大小 = 兵力 / Nodes = faction color, size = troops
// - 道路 = 細線、半透明、hover 高亮 / Roads = thin lines, semi-transparent, hover highlight
// - hover 顯示：名字 + 勢力 + 兵力 + 建築 / Hover: name + faction + troops + buildings
// - 可拖曳 / 縮放 / Draggable + zoomable（鏡頭動畫：聚焦地點、全覽）/ animated camera: focus + fit
// - 點擊顯示地方詳情 / Click shows place detail
//
// 節點發光／陰影層已**移除**，所以 `readDesignToken`、`getGlowSprite` 與 `withAlpha`
// 也一併不存在了——它們只服務那一層。
//
// The node glow/shadow layer is **removed**, so `readDesignToken`, `getGlowSprite` and
// `withAlpha` are gone with it — they existed only to serve that layer.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';
import { createRng } from '@/lib/rng';

/**
 * 將 HSL 字串轉換為 hex 格式 / Convert HSL string to hex format
 * Sigma.js/WebGL 需要 hex 或 rgb 格式 / Sigma.js/WebGL requires hex or rgb format
 */
export function hslToHex(hsl: string): string {
  // 解析 "hsl(120, 70%, 50%)" 格式 / Parse "hsl(120, 70%, 50%)" format
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return CONFIG.MAP_UNOWNED_NODE_COLOR; // 預設灰色 / Default gray

  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 把 `#rgb` / `#rrggbb` 轉成三個 0–255 的通道值。
 * Turn `#rgb` / `#rrggbb` into three 0–255 channels.
 *
 * 領地層要自己寫 ImageData，所以自己解色碼。圖節點的顏色一律是 hex（有主之地
 * 已經過 hslToHex，無主之地固定 'MAP_UNOWNED_NODE_COLOR'），因此不必支援其他色彩格式。
 * The territory layer writes its own ImageData, so it parses colours itself.
 * Graph node colours are always hex, so no other format needs supporting.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * 把顏色朝白色調亮指定的混合比例。
 * Mix a colour toward white by `amount`, keeping its hue.
 *
 * 勢力色是 `hsl(H, 70%, 50%)`（建立勢力時產生），而領地填色是同一個顏色疊在深色
 * 背景上的半透明色塊。名字直接用原色會和底下的色塊一起變暗，讀起來像糊掉。往白色
 * 混是最直接的做法：色相不變，亮度上去，所以名字仍然是「這個勢力的顏色」。
 *
 * Faction colours are `hsl(H, 70%, 50%)` and the territory fill is that same colour
 * composited translucently over a dark backdrop, so the raw colour reads as muddy once
 * it sits on top of it. Mixing toward white lifts the lightness while keeping the hue,
 * so the name still reads as *this* faction's colour.
 *
 * @param color - HSL 字串或 hex 色碼 / An HSL string or hex colour
 * @param amount - 0 = 原色不變，1 = 純白 / 0 leaves it alone, 1 is pure white
 * @returns 調亮後的 hex；無法解析時原樣傳回 / The brightened hex, or the input unchanged
 */
export function brightenColor(color: string, amount: number): string {
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#')
    ? trimmed
    : /^hsl\(/i.test(trimmed)
      ? hslToHex(trimmed)
      : '';
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return color;

  const [r, g, b] = hexToRgb(hex);
  const mix = Math.min(1, Math.max(0, amount));
  const channel = (c: number) =>
    Math.round(c + (255 - c) * mix)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** 勢力名字字級的求解輸入 / Input for solving the faction-name font size */
export interface LabelFontFit {
  /** 文字在 100px 字級下的寬度（px）/ Text width measured at font-size 100px */
  widthAt100: number;
  /** 文字在 100px 字級下的高度（px）/ Text height measured at font-size 100px */
  heightAt100: number;
  /** 內切圓半徑，換算成螢幕像素 / Inscribed-circle radius, in screen pixels */
  radiusPx: number;
  /** 可用比例，0–1 / The fraction of the radius the text may occupy, 0–1 */
  fit: number;
  /** 字級上限 / Largest allowed font size */
  fontMax: number;
  /** 可讀下限；比它小就寧可不要這個名字 / Below this the name is unreadable, so drop it */
  fontMin: number;
  /**
   * 沿主軸的可用長度（半長，螢幕像素）。給了它就**不用**圓，改用這個矩形。
   * Half-extent along the principal axis, in screen pixels. Supplying it makes the solve use
   * the verified rectangle instead of the circle.
   */
  availAlongPx?: number;
  /** 垂直主軸的可用半寬（螢幕像素）/ Half-extent across the axis, in screen pixels */
  availAcrossPx?: number;
  /**
   * 名字外發光的半徑（**em 為單位**，所以跟著字級縮放）。**光暈是名字的一部分**，
   * 所以必須算進字級的預算裡；否則求解只保證「墨跡」在領地內，光暈會自己溢出來。
   *
   * 用 em 而不是 px 是關鍵：光暈若寫死 6px，一塊薄領地扣掉兩側各 6px 之後就幾乎沒有
   * 空間，字級會被壓到 8px 甚至整個消失（實測 4 個回合有 3 個不畫）。跟著字級縮放，
   * 小名字就配小光暈。
   *
   * The outward glow radius on the name, **in em**, so it scales with the font size. **The
   * glow is part of the name** and belongs in the font's budget; otherwise the solve only
   * guarantees the *ink* is inside and the glow walks off the claim on its own.
   *
   * Em rather than px is the point: a fixed 6px subtracted from both sides of a thin claim
   * leaves almost nothing, and the solve collapses to 8px or drops the name entirely
   * (measured: 3 of 4 rounds lost their label). Scaling with the font gives a small name a
   * small halo.
   */
  glowEm?: number;
}

/** 勢力名字字級的求解結果 / Solved faction-name font size */
export interface LabelFontSolution {
  /** 解出來的字級（px）/ The solved font size in px */
  fontSize: number;
  /** 是否大到看得懂 / Whether it clears `fontMin` */
  legible: boolean;
}

/**
 * 解出「整塊文字都還在自己領地裡」的最大字級。
 * Solve the largest font size whose **whole text box** still sits on the claim.
 *
 * **有矩形就用矩形，沒有才退回圓。** 圓只代表「錨點附近最寬多少」，對細長的領地小得可憐，
 * 名字沿長軸明明可以跑很遠卻被迫縮成一小撮——那正是「沒有把領地用滿」的原因。矩形是沿主軸
 * 走出領地為止、並且驗證過整塊都還是自己人，所以用它既用得滿又不會跑到別人地盤上。
 *
 * **Use the rectangle when given, and the circle only as the fallback.** The circle reports
 * "how wide it is at the roomiest point", which is tiny for an elongated claim — so a name that
 * could run a long way along the axis was forced tiny. That is precisely why the claim looked
 * underused. The rectangle is measured by walking along the principal axis until the claim ends
 * and verified to lie wholly inside it, so it fills the claim without ever crossing over.
 *
 * 圓本身仍然有用：它是「最寬裕的一點」的度量，也是矩形縮到極小時的下限保證。
 * The circle still earns its place: it measures the roomiest point, and it is the guarantee
 * behind the rectangle once it has shrunk small.
 *
 * @param m - 量測結果與上限 / The measurements and bounds
 * @returns 字級，以及是否大到看得懂 / The font size and whether it is legible
 */
export function solveLabelFontSize(m: LabelFontFit): LabelFontSolution {
  const diag = Math.hypot(m.widthAt100, m.heightAt100);
  const hasRect = m.availAlongPx !== undefined && m.availAcrossPx !== undefined;
  // 光暈以 em 計，所以直接進字級的預算：fs·(每 px 字級的半寬 + glowEm) ≤ 可用空間·fit。
  // 這樣「墨跡 + 光暈」整體不超過 avail·fit，離邊界至少還有 avail·(1−fit) 的餘裕 ——
  // 而且餘裕會隨領地大小等比放大，小領地不會被光暈吃光。
  //
  // The glow is in em, so it goes straight into the font's budget:
  // fs·(half-extent per px of font + glowEm) ≤ available·fit. The name *plus its halo* then
  // never exceeds avail·fit, leaving at least avail·(1−fit) of clearance — and that clearance
  // scales with the claim, so a thin one is not eaten alive by a fixed-radius halo.
  const glowEm = m.glowEm ?? 0;
  /**
   * 兩條界，缺一不可：
   *
   * 1. `fs·(每 px 字級的半寬 + glowEm) ≤ avail·fit` —— 「墨跡 + 光暈」塞得進預留的空間；
   * 2. `fs·glowEm ≤ avail·(1−fit)` —— 光暈自己塞得進**剩下的**餘裕。
   *
   * 少了第 2 條會怎樣：餘裕是 `avail·(1−fit)`，光暈卻是 `0.15 × font`，而
   * `font ≈ avail·fit/(0.5+0.15)`，所以光暈 ≈ 0.189·avail > 0.18·avail —— **剛好比餘裕大**，
   * 於是細長領地上的名字會有一點光暈跨出去。之前就是這樣被測試抓到的：只差 1.8px vs 6.9px。
   *
   * Two bounds, and both are needed:
   *
   * 1. `fs·(halfExtentPerPx + glowEm) ≤ avail·fit` — the ink **plus its halo** fits the budget;
   * 2. `fs·glowEm ≤ avail·(1−fit)` — the halo fits the **leftover** margin.
   *
   * Drop the second and it fails by a hair: the leftover margin is `avail·(1−fit)` while the halo
   * is `0.15 × font` and `font ≈ avail·fit/(0.5+0.15)`, so the halo works out to ≈0.189·avail
   * against a 0.18·avail margin — **just larger**. A thin claim then pushes its halo outside,
   * which is exactly how the test caught it: 1.8px of clearance against a 6.9px halo.
   */
  const solved = hasRect
    ? Math.min(
        // 1. 墨跡 + 光暈塞得進預留空間 / ink plus halo inside the fitted budget
        (m.availAlongPx! * m.fit) / (m.widthAt100 / 200 + glowEm),
        (m.availAcrossPx! * m.fit) / (m.heightAt100 / 200 + glowEm),
        // 2. 光暈塞得進剩下的餘裕 / halo inside the leftover margin
        glowEm > 0 ? (m.availAlongPx! * (1 - m.fit)) / glowEm : Infinity,
        glowEm > 0 ? (m.availAcrossPx! * (1 - m.fit)) / glowEm : Infinity
      )
    : // 圓：半對角線受限。hypot(w, h) ≤ 2r，所以 fs ≤ 200 · r · fit / hypot(w100, h100) /
      // Circle: the half-diagonal is the cap
      (200 * m.radiusPx * m.fit) / diag;

  if (!(diag > 0) || !(solved > 0)) return { fontSize: 0, legible: false };
  const fontSize = Math.min(m.fontMax, solved);
  return { fontSize, legible: fontSize >= m.fontMin };
}

export interface Place {
  id: string;
  name: string;
  factionId: string | null;
  administratorId: string | null;
  garrison: number;
  fortress: number;
  market: number;
  barracks: number;
  layoutX: number;
  layoutY: number;
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  collapsing: boolean;
}

export interface Road {
  id: string;
  aId: string;
  bId: string;
}

export interface Character {
  id: string;
  name: string;
  placeId: string;
  troops: number;
  gold: number;
  isKing: boolean;
  alive: boolean;
}

/**
 * 地圖視角控制 — 由 SigmaMap 透過 onControlsReady 提供。
 * Map camera controls — provided by SigmaMap via onControlsReady.
 * 父層將其存入 ref，供浮動縮放/重設按鈕呼叫。
 * Parents store it in a ref for the floating zoom/reset buttons.
 */
export interface MapCameraControls {
  /** 放大 / Zoom in */
  zoomIn: () => void;
  /** 縮小 / Zoom out */
  zoomOut: () => void;
  /** 重設拖曳位置與縮放層級（動畫回到預設視角）/ Reset pan position and zoom level (animated back to default view) */
  resetView: () => void;
  /** 聚焦到某個地點（供事件日誌點擊後呼叫）/ Focus the camera on a place (called when the event log targets one) */
  focusPlace: (placeId: string) => void;
  /** 目前縮放程度：0 = 最近、1 = 最遠（反向包裝，用於滑桿）/
   *  Current zoom as 0 = closest, 1 = furthest (inverted for the slider) */
  getZoom: () => number;
  /** 設定縮放程度（0..1，同 getZoom 的反向刻度）/ Set zoom (0..1, same inverted scale) */
  setZoom: (t: number) => void;
  /** 每次縮放變動時通知（滑桿要跟著動）/ Called whenever the zoom changes so the slider can track it */
  onZoomChange?: (cb: (zoom: number) => void) => () => void;
  /**
   * Sigma's own **framed** (normalised) → viewport-pixel mapping.
   *
   * The backdrop layers (`SpaceGalaxy` and its fog) position and scale themselves with
   * this, and must **not** re-derive pan and zoom from `camera.x / y / ratio`: a
   * hand-rolled pan has the **wrong sign**, so the backdrop drifts against the map and
   * reads as "not following it". The galaxy has no parallax or zoom clamp of its own for
   * the same reason — it inherits sigma's transform exactly.
   *
   * Optional so partial fixtures still satisfy the interface.
   */
  framedGraphToViewport?: (p: { x: number; y: number }) => { x: number; y: number };
}

export interface SigmaMapProps {
  places: Place[];
  factions: Faction[];
  roads: Road[];
  characters: Character[];
  /** 地圖聚光燈：近 K 回合內新生成 / 被攻擊的地點 / Map spotlight: places created/attacked within the last K rounds */
  spotlights?: Array<{ placeId: string; kind: 'created' | 'attacked' }>;
  /** 本回合移動（from → to），供動畫播放 / This round's moves (from → to) for the travel animation */
  moves?: Array<{ fromPlaceId: string; toPlaceId: string; factionId: string | null }>;
  onPlaceClick?: (place: Place) => void;
  selectedPlaceId?: string | null;
  /** 鏡頭每次移動時通知（框化座標），供疊層做視差 / Notified on every camera move (framed coords), so overlays can do parallax */
  onCameraMove?: (x: number, y: number, ratio: number) => void;
  /** 視角控制回呼；Sigma 實例建立後呼叫，卸載時呼叫 null / Camera controls callback; invoked after the Sigma instance is created, null on unmount */
  /** 是否顯示領地圖層 / Whether the territory layer is shown */
  showTerritory?: boolean;
  onControlsReady?: (controls: MapCameraControls | null) => void;
}

/** 拉近時的提示：指向一個**地方** / Zoomed-in tooltip: a single *place* */
export interface PlaceTooltip {
  kind: 'place';
  x: number;
  y: number;
  place: Place;
  faction: Faction | null;
  characterCount: number;
  /**
   * 住在這裡的存活將領**各自帶著的兵力總和**，不含 `place.garrison`。
   *
   * 節點大小本來就是 `駐軍 + 將領兵力` 一起算的，但提示只印 `garrison`，於是一個節點
   * 看起來比實際兵力小很多。兩個數字分開列，讀者才知道節點的大小是怎麼來的。
   *
   * The summed troops of the living characters based here, excluding `place.garrison`.
   *
   * Node size has always been `garrison + leader troops`, but the tooltip printed only
   * the garrison, so a node could look far weaker than it was. Listing both makes the
   * node size legible: the reader can see where it came from.
   */
  leaderTroops: number;
  linkedPlaces: string[];
}

/**
 * 拉遠時的提示：指向一整塊**勢力領地** / Zoomed-out tooltip: a whole faction region
 *
 * 領地視圖畫的是面積而不是節點，所以提示也必須是面積的。這一層原本重用地方提示，
 * 但它用「最近的地方」回答游標 —— 在這個視圖裡那幾乎永遠是某個跟游標無關的小地點，
 * 於是 hover 一塊勢力領地卻顯示另一個地方的名字。
 * The zoomed-out view draws areas rather than nodes, so its tooltip has to describe
 * an area too. This layer used to reuse the place tooltip, which answered the cursor
 * with "the nearest place" — in this view that is almost always some unrelated little
 * place, so hovering a faction's territory named somewhere else entirely.
 */
export interface FactionTooltip {
  kind: 'faction';
  x: number;
  y: number;
  /** 勢力名稱 / Faction name */
  name: string;
  /** 勢力色（hsl 字串）/ Faction colour, stored as hsl */
  color: string;
  /** 該勢力控制的**地方**數（不是格子數）/ Places this faction owns (not cell count) */
  placeCount: number;
}

export type Tooltip = PlaceTooltip | FactionTooltip;

// ============================================================================
// 星系的外觀 / How a star system looks
// ============================================================================

/**
 * 一顆太陽的顏色。`core` 是 sigma 畫的圓盤，`edge` 是覆蓋層畫的柔光外圈。
 *
 * A star's colours. `core` is the disc Sigma paints; `edge` is the glow the overlay paints.
 *
 * **兩個值必須一起決定。** 它們一旦分開產生，就會出現「一個核心配著別顆恆星的光暈」——
 * 而且圓盤由 sigma 畫、柔光由覆蓋層畫，兩邊本來就是不同的地方，沒有任何機制會擋住那件事。
 *
 * **They have to be decided together.** Split them and a sun ends up wearing another star's
 * halo — and the disc and the glow are painted by different code in different places, so
 * nothing would stop it.
 */
export interface StarClass {
  core: string;
  edge: string;
}

/**
 * 這顆太陽的顏色，只由**地點 id** 決定。所以同一個地方在每一台機器、每一次重繪都長得一樣，
 * 而資料庫裡不必多存任何東西。
 *
 * This star's colours, decided by the **place id alone**. So a place looks the same on every
 * machine and across every redraw, and the database has to store nothing extra.
 *
 * 回傳的物件是 `CONFIG` 裡的**唯讀**項目，不要就地修改。
 *
 * The returned object is a read-only entry from `CONFIG`; do not mutate it.
 */
export function starClassOf(placeId: string): StarClass {
  // 用 `createRng` 而不是 `id.charCodeAt(0) % n`：後者只看得見第一個字元，而 id 的前綴
  // 常常相同，那會讓整批地點拿到同一顆太陽。
  //
  // `createRng`, not `id.charCodeAt(0) % n`: the latter only sees the first character, and ids
  // often share a prefix, which would hand a whole batch of places the same sun.
  const classes = CONFIG.MAP_STAR_SUN_CLASSES;
  const index = createRng(placeId).int(0, classes.length - 1);
  return classes[index];
}

/** 把 `#rrggbb` 變成**完全透明**的同色（給 Canvas 漸層的外圈用）/ the same colour, fully transparent (for a gradient's outer stop) */
export function transparent(hex: string): string {
  return `${hex}00`;
}

// ============================================================================
// 星系尺寸 / Star-system sizing
// ============================================================================

/**
 * 星系的尺寸倍率：所有 `MAP_STAR_*_PX` 都是「剛進入星系層」時的大小，實際畫出來要乘上
 * 這個倍率，所以星系**跟著鏡頭走**而不是在螢幕上釘死。
 *
 * The star system's size factor. Every `MAP_STAR_*_PX` is the size at the moment star view
 * was entered, and what actually gets drawn is multiplied by this, so a system follows the
 * camera instead of being pinned on screen.
 *
 * 以 `MAP_STAR_ZOOM_RATIO` 當基準，所以**剛跨過門檻那一幀剛好是 1** —— 與沒有這個
 * 倍率之前一模一樣，因此沒有跨門檻時的跳變。指數 0.5 就是 sigma 自己縮放節點的
 * `size / sqrt(ratio)`，所以星系對縮放的的反應與一般地點節點完全一致。
 *
 * Anchored on `MAP_STAR_ZOOM_RATIO`, so the frame that crosses the threshold is exactly 1 —
 * identical to having no factor at all, which means there is no jump on the way in. An
 * exponent of 0.5 is sigma's own `size / sqrt(ratio)`, so a system reacts to zoom exactly
 * the way a place node does.
 *
 * 上下限是必要的：倍率只往上長，而鏡頭可以一路推到 `MAP_ZOOM_MIN_RATIO`，不封頂的話
 * 最靠近時星系會大到彼此重疊。**下限 1** 同樣重要 —— 它讓「拉遠一點就回到剛進來的大小」
 * 成立，而不是變成一串越拉越小、難以辨認的點。
 *
 * Both bounds are load-bearing. It only grows, and the camera can travel all the way to
 * `MAP_ZOOM_MIN_RATIO`, so unbounded the systems would overlap at the closest zoom. A floor
 * of **1** matters just as much: it keeps "pull back a little and you are back to how it
 * looked on entry" true, rather than becoming a trail of ever-smaller hard-to-read dots.
 */
export function starScaleAt(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return CONFIG.MAP_STAR_ZOOM_SCALE_MIN;
  const clamped = Math.max(ratio, CONFIG.MAP_ZOOM_MIN_RATIO);
  const raw = Math.pow(
    CONFIG.MAP_STAR_ZOOM_RATIO / clamped,
    CONFIG.MAP_STAR_ZOOM_SCALE_EXPONENT
  );
  return Math.min(
    Math.max(raw, CONFIG.MAP_STAR_ZOOM_SCALE_MIN),
    CONFIG.MAP_STAR_ZOOM_SCALE_MAX
  );
}

// ============================================================================
// 地點提示 / The place tooltip
// ============================================================================

/**
 * 取得出這個地點連到哪些地方。**只認有字串 `label` 的鄰居** —— 拉遠時 `nodeReducer`
 * 會把 label 設成 `null`（那是縮放規則），而這裡要回傳的正是「看得出名字的那些」，
 * 否則提示會列出十幾個 `null`。
 *
 * The places this place links to. Only neighbours carrying a **string** `label` count:
 * zoomed out `nodeReducer` sets `label` to `null` (that is the zoom rule), and what this
 * wants is precisely "the ones whose names are legible" — otherwise the tooltip lists a
 * dozen nulls.
 */
export interface LabeledNeighborhood {
  neighbors: (node: string) => string[];
  getNodeAttributes: (node: string) => { label?: unknown };
}

export function linkedPlaceNames(
  graph: LabeledNeighborhood,
  nodeId: string
): string[] {
  return graph
    .neighbors(nodeId)
    .map((id) => {
      const label = graph.getNodeAttributes(id).label;
      return typeof label === 'string' ? label : null;
    })
    .filter((name): name is string => name !== null);
}

// ============================================================================
// 地名的可點範圍 / Where a place's name counts as the place
// ============================================================================

/**
 * 地名標籤在**螢幕像素**上的矩形。sigma 把地名畫在節點的**右側**（`x + size + 3`，
 * baseline 垂直置中），所以這是節點中心與半徑、量出來的文字寬度與字級算出來的。
 *
 * A place's name label as a rectangle in **screen pixels**. Sigma draws the name to the
 * *right* of the node (`x + size + 3`, vertically centred on its baseline), so the rect falls
 * out of the node's centre and radius, the measured text width and the label size.
 *
 * 為什麼需要它：地名的可點範圍必須**包含標籤本身**，否則游標一移到名字上，那圈強制顯示
 * 的名稱（自己與相連地點）就消失了 —— 明明游標還指著其中一個名字。這一點是純幾何，
 * 沒有 DOM，所以放在這裡並測試。
 *
 * Why this exists at all: a place's hover target has to **include its own name**, or the
 * moment the cursor reaches the name the forced labels (its own and its neighbours') vanish —
 * while the cursor is still pointing at one of them. It is pure geometry with no DOM, so it
 * lives here and is tested.
 */
export function placeLabelRect(input: {
  /** 節點中心的螢幕 x / node centre, screen x */
  cx: number;
  /** 節點中心的螢幕 y / node centre, screen y */
  cy: number;
  /** 節點的螢幕半徑 / the node's on-screen radius */
  radius: number;
  /** 量出來的文字寬度 / measured text width */
  textWidth: number;
  /** 標籤字級 / the label font size */
  labelSize: number;
}): { x: number; y: number; w: number; h: number } {
  // 垂直方向放寬一點：文字的實際墨水高度遠小於字級，而命中測試寧可鬆不可緊 ——
  // 命中區太小會讓「指著名字」變成「指著空氣」。
  //
  // A little generous vertically: a glyph's ink height is well under its font size, and a
  // hit target that is too tight turns "pointing at the name" into "pointing at nothing".
  const h = input.labelSize * 1.2;
  const x = input.cx + input.radius + 3;
  return { x, y: input.cy - h / 2, w: input.textWidth, h };
}

/** 螢幕點是否落在矩形內 / whether a screen point is inside the rect */
export function pointInRect(
  px: number,
  py: number,
  r: { x: number; y: number; w: number; h: number }
): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
