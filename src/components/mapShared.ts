// ============================================================================
// Sigma 地圖的共用純邏輯 / Shared pure logic for the sigma map
// ----------------------------------------------------------------------------
// 顏色換算、發光 sprite 快取、資料型別，以及那組讓外部按鈕控制鏡頭的
// `MapCameraControls`。全部與 React 和 canvas 都無關，所以從 `SigmaMap.tsx`
// 分出來之後元件本身短了很多，而且這些東西可以各自單獨測。
//
// Colour conversion, the glow sprite cache, the data shapes, and `MapCameraControls`
// (the handle the floating buttons use to drive the camera). None of it touches React
// or a canvas, so pulling it out shortens the component and each piece stands alone.
//
// 這個檔案刻意**不含** 'use client'：它是純模組。
// Deliberately carries no 'use client': it is a plain module.
// 功能 / Features:
// - 節點 = 勢力色、大小 = 兵力 / Nodes = faction color, size = troops
// - 道路 = 細線、半透明、hover 高亮 / Roads = thin lines, semi-transparent, hover highlight
// - 節點發光 + 陰影（靜態裝飾層）/ Node glow + drop shadow (static decoration layer)
// - hover 顯示：名字 + 勢力 + 兵力 + 建築 / Hover: name + faction + troops + buildings
// - 可拖曳 / 縮放 / Draggable + zoomable（鏡頭動畫：聚焦地點、全覽）/ animated camera: focus + fit
// - 點擊顯示地方詳情 / Click shows place detail
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

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
 * 讀取 globals.css 的設計 token（設計值不 hardcode 在 TSX）。
 * Read a design token from globals.css (design values never hardcoded in TSX).
 *
 * @param name - CSS 自訂屬性名稱（不含 --）/ CSS custom property name (without --)
 * @param fallback - 讀不到時的後備值 / Fallback when the token is missing
 * @returns token 值（已 trim）/ The trimmed token value
 */
export function readDesignToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value.length > 0 ? value : fallback;
}

/** 發光／陰影 sprite 的像素尺寸 / Pixel size of the glow/shadow sprites */
export const SPRITE_SIZE = 64;

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
 * 建立一張中心向外淡出的徑向漸層 sprite，並依色票快取。
 * 對同一種顏色只建立一次，之後每次重繪都只是 drawImage ——
 * 遠比每幀 createRadialGradient 便宜（地圖最多 2000 個節點）。
 * Build a radial-gradient sprite that fades from the centre outwards, cached
 * per colour. Each redraw is then just a drawImage, far cheaper than calling
 * createRadialGradient per node per frame (the map can hold 2000 nodes).
 *
 * @param cache - 以顏色為鍵的 sprite 快取 / Sprite cache keyed by colour
 * @param color - 中心色（CSS 色碼）/ Centre colour (any CSS colour string)
 * @param alpha - 中心不透明度 / Opacity at the centre
 * @returns 快取的 sprite 畫布 / The cached sprite canvas
 */
export function getGlowSprite(
  cache: Map<string, HTMLCanvasElement>,
  color: string,
  alpha: number
): HTMLCanvasElement {
  const key = `${color}|${alpha}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const sprite = document.createElement('canvas');
  sprite.width = SPRITE_SIZE;
  sprite.height = SPRITE_SIZE;
  const sctx = sprite.getContext('2d');
  if (sctx) {
    const half = SPRITE_SIZE / 2;
    const gradient = sctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, withAlpha(color, alpha));
    gradient.addColorStop(0.45, withAlpha(color, alpha * 0.32));
    gradient.addColorStop(1, withAlpha(color, 0));
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }

  cache.set(key, sprite);
  return sprite;
}

/**
 * 把 CSS 色碼轉成帶透明度的 rgba()。
 * Sigma 的節點色是 hex，所以這裡只需處理 #rgb / #rrggbb。
 * Convert a CSS colour to rgba() with the given alpha. Node colours arrive as
 * hex from hslToHex, so only #rgb / #rrggbb need handling.
 *
 * @param color - hex 色碼 / A hex colour
 * @param alpha - 0-1 的不透明度 / Opacity between 0 and 1
 * @returns rgba() 色字串 / An rgba() colour string
 */
export function withAlpha(color: string, alpha: number): string {
  let hex = color.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  const solved = hasRect
    ? // 矩形：長與厚各自受限，取小。半長 = w100·fs/200，所以 fs ≤ 200·availAlong/w100 /
      // Rectangle: length and thickness each have a cap. Half-length is w100·fs/200, so
      // fs ≤ 200·availAlong/w100
      Math.min(
        (200 * m.availAlongPx! * m.fit) / m.widthAt100,
        (200 * m.availAcrossPx! * m.fit) / m.heightAt100
      )
    : // 圓：半對角線受限。hypot(w, h) ≤ 2r，所以 fs ≤ 200 · r · fit / hypot(w100, h100)
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
