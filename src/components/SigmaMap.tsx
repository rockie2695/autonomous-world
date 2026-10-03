// ============================================================================
// Sigma 地圖元件 — 使用 Sigma.js + graphology 渲染互動式地圖
// Sigma Map Component — Interactive map using Sigma.js + graphology
// ============================================================================
// 功能 / Features:
// - 節點 = 勢力色、大小 = 兵力 / Nodes = faction color, size = troops
// - 道路 = 細線、半透明、hover 高亮 / Roads = thin lines, semi-transparent, hover highlight
// - 節點發光 + 陰影（靜態裝飾層）/ Node glow + drop shadow (static decoration layer)
// - hover 顯示：名字 + 勢力 + 兵力 + 建築 / Hover: name + faction + troops + buildings
// - 可拖曳 / 縮放 / Draggable + zoomable（鏡頭動畫：聚焦地點、全覽）/ animated camera: focus + fit
// - 點擊顯示地方詳情 / Click shows place detail
// ============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import { drawDiscNodeHover } from 'sigma/rendering';
import { useReducedMotion } from 'motion/react';
import { CONFIG } from '@/lib/gameConfig';

/**
 * 將 HSL 字串轉換為 hex 格式 / Convert HSL string to hex format
 * Sigma.js/WebGL 需要 hex 或 rgb 格式 / Sigma.js/WebGL requires hex or rgb format
 */
function hslToHex(hsl: string): string {
  // 解析 "hsl(120, 70%, 50%)" 格式 / Parse "hsl(120, 70%, 50%)" format
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return '#4a5568'; // 預設灰色 / Default gray

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
function readDesignToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value.length > 0 ? value : fallback;
}

/** 發光／陰影 sprite 的像素尺寸 / Pixel size of the glow/shadow sprites */
const SPRITE_SIZE = 64;

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
function getGlowSprite(
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
function withAlpha(color: string, alpha: number): string {
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

interface Place {
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

interface Faction {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  collapsing: boolean;
}

interface Road {
  id: string;
  aId: string;
  bId: string;
}

interface Character {
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
}

interface SigmaMapProps {
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
  /** 視角控制回呼；Sigma 實例建立後呼叫，卸載時呼叫 null / Camera controls callback; invoked after the Sigma instance is created, null on unmount */
  onControlsReady?: (controls: MapCameraControls | null) => void;
}

interface Tooltip {
  x: number;
  y: number;
  place: Place;
  faction: Faction | null;
  characterCount: number;
  linkedPlaces: string[];
}

/**
 * Sigma 地圖元件。 / Sigma Map Component.
 * 使用 WebGL 渲染互動式圖形地圖。 / Renders interactive graph map using WebGL.
 */
export function SigmaMap({
  places,
  factions,
  roads,
  characters,
  spotlights = [],
  moves = [],
  onPlaceClick,
  selectedPlaceId,
  onControlsReady,
}: SigmaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const hoveredNeighborsRef = useRef<Set<string>>(new Set());
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  /** 目前是否顯示地名（純粹看鏡頭 ratio）/ Whether place names are currently shown (purely camera-ratio driven) */
  const labelsVisibleRef = useRef(false);
  const onPlaceClickRef = useRef(onPlaceClick);
  const onControlsReadyRef = useRef(onControlsReady);
  // 尊重「減少動態效果」偏好：鏡頭直接跳轉，不做過場動畫
  // Respect prefers-reduced-motion: the camera jumps instead of animating
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // 選中地點變更時（開啟或關閉彈窗）立即清除殘留的 tooltip。
  // Clear the lingering tooltip immediately when the selected place changes
  // (popup opened or closed). 使用 React 建議的「render 期間調整 state」模式。
  // Uses React's recommended "adjust state during render" pattern.
  const [prevSelectedPlaceId, setPrevSelectedPlaceId] = useState(selectedPlaceId);
  if (prevSelectedPlaceId !== selectedPlaceId) {
    setPrevSelectedPlaceId(selectedPlaceId);
    setTooltip(null);
  }

  // 同步最新 props 到 refs，讓一次性建立的事件處理器與 nodeReducer
  // 讀取最新值，Sigma 實例不需重建（地圖視角因此不會被重設）。
  // Sync latest props into refs so the once-created handlers and nodeReducer
  // read fresh values without re-creating the Sigma instance (the camera
  // position is therefore never reset).
  useEffect(() => {
    selectedPlaceIdRef.current = selectedPlaceId;
    onPlaceClickRef.current = onPlaceClick;
    onControlsReadyRef.current = onControlsReady;
  }, [selectedPlaceId, onPlaceClick, onControlsReady]);

  // ── 建立 Sigma 實例（僅一次）/ Create the Sigma instance (once) ──────────

  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph();
    graphRef.current = graph;

    // 建立 Sigma 實例 / Create Sigma instance
    const sigma = new Sigma(graph, containerRef.current, {
      // 切換桌機／手機時容器會短暫量到 0 高 Sigma 預設直接丟
      // "Container has no height"，整個錯誤邊界就炸掉。容器只是暫時沒有
      // 尺寸，下一次 resize 會補上，所以照官方建議放行 /
      // While switching desktop <-> mobile the container briefly measures zero
      // height and Sigma throws "Container has no height" by default, which
      // takes down the error boundary. The size is transient and the next
      // resize fixes it, so take the library's own escape hatch.
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      defaultEdgeColor: '#1e3a5f', // 深藍色道路 / Deep blue roads
      defaultNodeColor: '#4a5568',
      labelFont: 'monospace',
      labelSize: 14,
      labelColor: { attribute: 'labelColor' },
      labelWeight: 'bold',
      renderLabels: true,
      // 地名標籤只跟著鏡頭縮放走，不看兵力；真正的門檻在 nodeReducer 裡用
      // camera.ratio 判斷。這裡必須設 0，否則 sigma 仍會用「節點尺寸」過濾一次，
      // 讓兵多的地名在拉遠時偷偷留著。
      // Place labels follow the camera zoom only; the real gate lives in
      // nodeReducer via camera.ratio. This must be 0, or sigma filters once more
      // by node size and garrisoned names sneak through when zoomed out.
      labelRenderedSizeThreshold: 0,
      // 自訂 hover 渲染：只在節點「目前」hover / 選中 / 相連時畫白色底框，
      // 過濾掉 sigma 內部殘留的 hoveredNode / highlightedNodes 狀態。
      // 這兩個內部狀態沒有公開清除 API，只靠 mousemove 轉移更新；彈窗
      // 關閉後若不過濾會殘留空白標籤底框。
      // Custom hover renderer: only draw the white pill for nodes that are
      // CURRENTLY hovered / selected / neighbor — filter out sigma's sticky
      // internal hoveredNode / highlightedNodes (no public clear API; they
      // are only updated by mousemove transitions, so after the popup closes
      // a stale blank pill would otherwise remain).
      defaultDrawNodeHover: (context, data, settings) => {
        const nodeId = (data as { key?: string }).key;
        const isActive =
          !!nodeId &&
          (nodeId === hoveredNodeRef.current ||
            nodeId === selectedPlaceIdRef.current ||
            hoveredNeighborsRef.current.has(nodeId));
        if (!isActive) return;
        drawDiscNodeHover(context, data, settings);
      },
      nodeReducer: (node, data) => {
        const res = { ...data };
        // 節點越大，標籤越清晰 / Larger nodes get clearer labels
        res.labelSize = Math.max(14, Math.min(20, data.size / 2));

        // 拉遠時整張圖都不顯示地名（與兵力無關）；放近才統一出現 /
        // Zoomed out, no place is labelled regardless of garrison; names appear
        // together once you zoom in
        if (!labelsVisibleRef.current) res.label = null;

        // hover / 選中 時標籤變青色，連接節點也高亮 / Label turns cyan on hover/select, connected nodes also highlighted
        if (hoveredNodeRef.current === node) {
          res.labelColor = '#1EBDD6'; // 霓虹青綠 / Neon cyan
          res.zIndex = 1;
          res.highlighted = true;
        } else if (selectedPlaceIdRef.current === node) {
          res.labelColor = '#1EBDD6';
          res.highlighted = true;
        } else if (hoveredNeighborsRef.current.has(node)) {
          res.labelColor = '#1EBDD6';
          res.highlighted = true;
        } else {
          res.labelColor = '#e2e8f0'; // 預設淺灰 / Default light gray
        }

        return res;
      },
    });

    // ── Hover 事件 / Hover Events ──────────────────────────────────────────

    sigma.on('enterNode', ({ node }) => {
      hoveredNodeRef.current = node;
      // 找出所有連接的鄰居 / Find all connected neighbors
      const neighborIds = graph.neighbors(node);
      hoveredNeighborsRef.current = new Set(neighborIds);
      sigma.refresh(); // 強制重繪以觸發 nodeReducer / Force redraw to trigger nodeReducer

      const attrs = graph.getNodeAttributes(node);
      const viewportPos = sigma.graphToViewport({
        x: attrs.x,
        y: attrs.y,
      });

      // 相連地點名稱 / Linked place names
      const linkedPlaceNames = neighborIds
        .map((id) => {
          const attrs = graph.getNodeAttributes(id);
          return typeof attrs.label === 'string' ? attrs.label : null;
        })
        .filter((name): name is string => name !== null);

      setTooltip({
        x: viewportPos.x,
        y: viewportPos.y,
        place: attrs.placeData,
        faction: attrs.factionData,
        characterCount: attrs.characterCount,
        linkedPlaces: linkedPlaceNames,
      });

      if (containerRef.current) {
        containerRef.current.style.cursor = 'pointer';
      }
    });

    sigma.on('leaveNode', () => {
      hoveredNodeRef.current = null;
      hoveredNeighborsRef.current = new Set();
      sigma.refresh(); // 強制重繪以觸發 nodeReducer / Force redraw to trigger nodeReducer
      setTooltip(null);

      if (containerRef.current) {
        containerRef.current.style.cursor = '';
      }
    });

    // ── 鏡頭動畫 / Camera Animation ─────────────────────────────────────────
    // reducedMotion 用 ref 讀取：建立 Sigma 的 effect 依賴陣列是空的，
    // 直接閉包捕捉會拿到首次渲染的值。
    // reducedMotion is read through a ref: the effect that builds Sigma has an
    // empty dependency array, so closing over the value would freeze the first
    // render's answer.

    const animMs = () => (reducedMotionRef.current ? 0 : CONFIG.MAP_CAMERA_ANIM_MS);

    /** 鏡頭移到某節點並置中；若目前拉太遠則一併放大到可辨識的比例 */
    /** Move the camera to a node and centre it; zoom in first if it is too far out */
    // 必須用 getNodeDisplayData()（framed 座標），不能用
    // graph.getNodeAttributes() 的原始座標：sigma 會把圖正規化置中，
    // 鏡頭 operates 在 framed 空間。直接餵原始座標會讓鏡頭停在節點之外，
    // 畫面全黑且關閉彈窗後不會回來。
    // Must use getNodeDisplayData() (framed space), not the raw
    // getNodeAttributes() coordinates: sigma normalises and centres the graph,
    // and the camera works in framed space. Feeding raw coordinates parks the
    // camera off the node — the map goes blank and never recovers on close.
    const focusNode = (node: string) => {
      if (!graph.hasNode(node)) return;
      const display = sigma.getNodeDisplayData(node);
      if (!display) return;
      const camera = sigma.getCamera();
      // framed 空間裡「全覽」是固定的 ratio（見 fitWorld），聚焦就是從全覽
      // 再拉近 MAP_FOCUS_ZOOM 倍——用同樣的基準才能讓兩種視角一致。
      // In framed space "fit everything" is a fixed ratio (see fitWorld), so
      // focusing is simply that zoomed in by MAP_FOCUS_ZOOM — sharing the
      // baseline keeps the two views consistent.
      const focusRatio = CONFIG.MAP_FIT_PADDING * CONFIG.MAP_FOCUS_ZOOM;
      void camera.animate(
        {
          x: display.x,
          y: display.y,
          ratio: Math.min(camera.ratio, focusRatio),
          angle: 0,
        },
        { duration: animMs() }
      );
    };

    /** 鏡頭動畫到「整個世界剛好放得下」/ Animate the camera to fit the whole world */
    const fitWorld = () => {
      const camera = sigma.getCamera();
      // sigma 的正規化（createNormalizationFunction）把整張圖映射成
      // 「以 (0.5,0.5) 為中心、較大軸恰為 1」的單位方形，所以全覽視角是固定值：
      // 中心 (0.5,0.5)、ratio 1，再乘 MAP_FIT_PADDING 留白。實測五種視窗比例
      // （含 1600×400、400×1200）都能容納全部節點。
      // Sigma's normalisation maps the whole graph into a unit square centred on
      // (0.5, 0.5) whose larger axis is exactly 1, so "fit everything" is a
      // constant: centre (0.5, 0.5), ratio 1, times MAP_FIT_PADDING for margin.
      // Verified to contain every node across five viewport aspects.
      //
      // 不可用 sigma.getBBox()：它回傳原始座標範圍（正規化之前），拿來算中心
      // 會讓鏡頭停在世界之外，reset 之後地圖會變成一片空白（實測 0 個節點可見）。
      // Must NOT use sigma.getBBox(): it returns the RAW extent (pre-normalisation),
      // so centring on it parks the camera outside the world — measured 0 nodes
      // visible, i.e. a blank map after reset.
      void camera.animate(
        {
          x: 0.5,
          y: 0.5,
          ratio: camera.getBoundedRatio(CONFIG.MAP_FIT_PADDING),
          angle: 0,
        },
        { duration: animMs() }
      );
    };

    // ── 點擊事件 / Click Event ─────────────────────────────────────────────

    sigma.on('clickNode', (event: { node: string }) => {
      const attrs = graph.getNodeAttributes(event.node);
      // 點擊後鏡頭滑向該地點，長地圖上尤其明顯
      // Slide the camera to the clicked place — very noticeable on a large map
      focusNode(event.node);
      onPlaceClickRef.current?.(attrs.placeData);
    });

    // 鏡頭變動時重算「地名要不要顯示」。只有跨過門檻才 refresh，避免每幀
    // 重跑 nodeReducer。綁在 camera 上——sigma 只在內部自己監聽這個事件，
    // 不會轉發給 sigma.on()。
    // Recompute label visibility as the camera moves, refreshing only when the
    // threshold is crossed so nodeReducer is not re-run every frame. Bound on
    // the camera: sigma consumes this event internally and does not re-emit it.
    const syncLabelVisibility = () => {
      const visible = sigma.getCamera().ratio <= CONFIG.LABEL_ZOOM_RATIO;
      if (visible === labelsVisibleRef.current) return;
      labelsVisibleRef.current = visible;
      sigma.refresh();
    };
    labelsVisibleRef.current = sigma.getCamera().ratio <= CONFIG.LABEL_ZOOM_RATIO;
    sigma.getCamera().on('updated', syncLabelVisibility);

    sigmaRef.current = sigma;

    // 將視角控制交給父層（浮動縮放 / 重設按鈕使用）
    // Hand camera controls to the parent (used by floating zoom / reset buttons)
    onControlsReadyRef.current?.({
      zoomIn: () => {
        void sigma.getCamera().animatedZoom({ duration: animMs() });
      },
      zoomOut: () => {
        void sigma.getCamera().animatedUnzoom({ duration: animMs() });
      },
      resetView: () => {
        // 全覽整個世界（而非回到 ratio 1）：世界通常遠大於視窗，
        // animatedReset 會讓地圖塞得滿滿的
        // Fit the whole world (rather than ratio 1): the world is normally much
        // larger than the viewport, so animatedReset crops it
        fitWorld();
      },
      focusPlace: (placeId: string) => {
        // 節點不存在（例如極舊回合的事件、該地已消失）時 focusNode 會自行跳過 /
        // focusNode no-ops when the node is gone (very old events, destroyed place)
        focusNode(placeId);
      },
    });

    return () => {
      onControlsReadyRef.current?.(null);
      sigma.kill();
      sigmaRef.current = null;
      // 清除 hover 狀態，避免殘留舊的高亮標籤
      // Clear hover state to avoid stale highlighted labels
      hoveredNodeRef.current = null;
      hoveredNeighborsRef.current = new Set();
    };
  }, []);

  // ── 資料變更時重建圖形（不重建 Sigma 實例，保留地圖視角）
  // ── Rebuild the graph on data changes (without re-creating the Sigma
  //    instance, preserving the camera position) ────────────────────────────

  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph) return;

    graph.clear();

    // 建立勢力顏色對照 / Create faction color map
    const factionMap = new Map<string, Faction>();
    for (const faction of factions) {
      factionMap.set(faction.id, faction);
    }

    // 計算每個地方的將領數和總兵力
    // Calculate character count and total troops per place
    const charsPerPlace = new Map<string, number>();
    const troopsPerPlace = new Map<string, number>();
    for (const char of characters) {
      if (char.alive) {
        charsPerPlace.set(char.placeId, (charsPerPlace.get(char.placeId) ?? 0) + 1);
        troopsPerPlace.set(char.placeId, (troopsPerPlace.get(char.placeId) ?? 0) + char.troops);
      }
    }

    // 新增地方節點 / Add place nodes
    for (const place of places) {
      const faction = place.factionId ? factionMap.get(place.factionId) : null;
      const charCount = charsPerPlace.get(place.id) ?? 0;
      const totalTroops = (troopsPerPlace.get(place.id) ?? 0) + place.garrison;

      // 節點大小：使用 log 刻度避免少數巨點吃掉畫面
      // Node size: use log scale to prevent a few huge nodes from dominating
      // size = 4 + log(troops + 1) × 2
      const nodeSize = 4 + Math.log(totalTroops + 1) * 2;

      // 有勢力的地方用勢力色（轉換為 hex），無主之地用深灰色
      // Owned places use faction color (converted to hex), unowned use dark gray
      const color = faction ? hslToHex(faction.color) : '#374151';

      graph.addNode(place.id, {
        x: place.layoutX,
        y: place.layoutY,
        size: nodeSize,
        color,
        label: place.name,
        // 儲存額外資料 / Store extra data for tooltips
        placeData: place,
        factionData: faction,
        characterCount: charCount,
        totalTroops,
      });
    }

    // 新增道路邊緣 / Add road edges
    for (const road of roads) {
      if (graph.hasNode(road.aId) && graph.hasNode(road.bId)) {
        if (!graph.hasEdge(road.aId, road.bId)) {
          graph.addEdge(road.aId, road.bId, {
            size: 1,
            color: '#1e3a5f',
          });
        }
      }
    }

    // 資料重建後清除 hover 狀態並重繪 / Clear hover state and redraw after rebuild
    hoveredNodeRef.current = null;
    hoveredNeighborsRef.current = new Set();
    sigma.refresh();
  }, [places, factions, roads, characters]);

  // ── 選中地點變更時清除 hover 狀態並重繪標籤
  // ── Clear hover state and redraw labels when the selected place changes
  //    （彈窗開啟或關閉時，overlay 攔截了滑鼠事件，leaveNode 不會觸發，
  //      必須在此清除殘留的高亮，否則節點會殘留白色標籤底框）
  //    (while the popup overlay intercepts mouse events, leaveNode never
  //     fires — clear stale highlights here or nodes keep a white pill) ────

  useEffect(() => {
    // 清除 hover refs 並重繪。sigma 內部的 hoveredNode / highlightedNodes
    // 殘留由自訂 defaultDrawNodeHover 過濾，因此這裡只需清除 refs。
    // Clear hover refs and redraw. Residual sigma internal hover state is
    // filtered out by the custom defaultDrawNodeHover, so only refs need clearing.
    hoveredNodeRef.current = null;
    hoveredNeighborsRef.current = new Set();
    sigmaRef.current?.refresh();
  }, [selectedPlaceId]);

  // ── 節點發光 + 陰影（靜態裝飾層）───────────────────────────────────────
  // 第二張覆蓋畫布，位於聚光燈層之下、sigma 容器之上：先鋪一層往右下
  // 偏移的暗影，再鋪一層依勢力色的柔和發光。節點圓盤由 WebGL 畫在更上面，
  // 所以看起來像「從地圖發亮起來」而不是貼圖。
  // A second overlay canvas below the spotlight layer and above the sigma
  // container: an offset dark shadow pass, then a soft faction-coloured glow
  // pass. Sigma paints the node discs on top, so the map reads as lit from
  // within rather than as flat stickers.
  //
  // 只在 sigma 重繪（鏡頭移動 / 資料變更 / refresh）或視窗縮放時重繪，閒置時零成本；
  // 沒有額外 rAF。掛 afterRender 而非 camera 'updated'，兵力變化導致節點大小改變
  // 時也能跟著重繪。
  // Redraws only when sigma renders (camera moves, data changes, refresh) or on
  // resize — no extra rAF, so an idle map costs nothing. Hooking afterRender
  // rather than the camera event also covers node resizes from troop changes.
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    const canvas = glowRef.current;
    if (!sigma || !graph || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 以色票快取的 sprite（同一勢力只建立一次）/ Sprites cached per colour
    const sprites = new Map<string, HTMLCanvasElement>();
    // 快取畫布尺寸，避免每幀讀 getBoundingClientRect 造成版面重排 /
    // Cached canvas size — reading getBoundingClientRect every frame thrashes layout
    let viewWidth = 0;
    let viewHeight = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      viewWidth = rect.width;
      viewHeight = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, viewWidth, viewHeight);
      if (graph.order === 0) return;

      // 陰影色取自設計 token，而非 hardcode 在 TSX
      // The shadow colour comes from a design token, never hardcoded here
      const shadowColor = readDesignToken('--color-ds-void', '#020617');

      // 只畫視窗內的節點：2000 個節點時這是明顯的省流 /
      // Only nodes inside the viewport — a real saving at 2000 nodes
      const topLeft = sigma.viewportToGraph({ x: 0, y: 0 });
      const bottomRight = sigma.viewportToGraph({ x: viewWidth, y: viewHeight });
      const minX = Math.min(topLeft.x, bottomRight.x);
      const maxX = Math.max(topLeft.x, bottomRight.x);
      const minY = Math.min(topLeft.y, bottomRight.y);
      const maxY = Math.max(topLeft.y, bottomRight.y);

      // ── 第一層：陰影（往右下偏移）/ Pass 1: drop shadow, offset down-right ──
      for (const node of graph.nodes()) {
        const attrs = graph.getNodeAttributes(node);
        const { x, y, size } = attrs as {
          x: number;
          y: number;
          size: number;
        };
        if (x < minX || x > maxX || y < minY || y > maxY) continue;

        const radius = sigma.scaleSize(size);
        const outer = radius * CONFIG.MAP_SHADOW_SCALE;
        if (outer < CONFIG.MAP_GLOW_MIN_RADIUS_PX) continue;

        const vp = sigma.graphToViewport({ x, y });
        const sprite = getGlowSprite(
          sprites,
          shadowColor,
          CONFIG.MAP_SHADOW_ALPHA
        );
        ctx.drawImage(
          sprite,
          vp.x - outer + CONFIG.MAP_SHADOW_OFFSET_PX,
          vp.y - outer + CONFIG.MAP_SHADOW_OFFSET_PX,
          outer * 2,
          outer * 2
        );
      }

      // ── 第二層：發光（依節點大小調整強度）/ Pass 2: glow, scaled by node size ──
      for (const node of graph.nodes()) {
        const attrs = graph.getNodeAttributes(node);
        const { x, y, size, color } = attrs as {
          x: number;
          y: number;
          size: number;
          color: string;
        };
        if (x < minX || x > maxX || y < minY || y > maxY) continue;

        const radius = sigma.scaleSize(size);
        const outer = radius * CONFIG.MAP_GLOW_SCALE;
        if (radius < CONFIG.MAP_GLOW_MIN_RADIUS_PX) continue;

        // 大節點全亮，小節點降到下限 —— 讓勢力重心自然浮現 /
        // Big nodes glow fully, small ones fade to a floor, so the map's
        // centres of gravity emerge without everything hazing over
        const strength = Math.min(
          1,
          Math.max(
            CONFIG.MAP_GLOW_MIN_ALPHA / CONFIG.MAP_GLOW_ALPHA,
            radius / CONFIG.MAP_GLOW_REFERENCE_PX
          )
        );
        const alpha = CONFIG.MAP_GLOW_ALPHA * strength;

        const vp = sigma.graphToViewport({ x, y });
        ctx.drawImage(getGlowSprite(sprites, color, alpha), vp.x - outer, vp.y - outer, outer * 2, outer * 2);
      }
    };

    // sigma 每次重繪都會觸發（拖曳 / 縮放 / 鏡頭動畫 / refresh）/
    // Fires on every sigma render (drag, zoom, camera animation, refresh)
    sigma.on('afterRender', draw);
    sigma.on('resize', resize);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    resize();

    return () => {
      sigma.off('afterRender', draw);
      sigma.off('resize', resize);
      resizeObserver.disconnect();
      // 清空 sprite 快取，避免關閉的畫布留在記憶體 /
      // Drop the sprite cache so detached canvases are not retained
      sprites.clear();
      ctx.clearRect(0, 0, viewWidth, viewHeight);
    };
    // 只在掛載時建立：節點資料從 graph 讀取，變更由 afterRender 觸發重繪
    // Built once on mount: node data is read from the graph, and changes
    // trigger a redraw through afterRender
  }, []);

  // ── 聚光燈環 + 移動動畫（覆蓋畫布）────────────────────────────────────────
  // 每幀用當前鏡頭座標重繪：新生成 / 被攻擊地點顯示脈動發光環；
  // 本回合的移動以光點沿起點 → 終點行進（週期：行進 → 停頓）。
  // Spotlight rings + move animation (overlay canvas): every frame redraws
  // with current camera coordinates — newly created/attacked places get a
  // pulsing glow ring; this round's moves travel as glowing dots from → to
  // (cycle: travel → pause).
  //
  // 這是地圖上唯一的 rAF 迴圈，因此必須照 AGENTS.md 的動畫規範：
  // 捲出視窗（IntersectionObserver）、分頁在背景（document.hidden）都暫停，
  // 並在 prefers-reduced-motion 下只畫一幀靜態圖。
  // This is the map's only rAF loop, so it follows the animation rules: pause
  // when scrolled out of view (IntersectionObserver) or when the tab is hidden
  // (document.hidden), and draw a single static frame under
  // prefers-reduced-motion. ─────────────────────────────────────────────────

  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    const canvas = overlayRef.current;
    if (!sigma || !graph || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const validMoves = moves.filter(
      (m) => graph.hasNode(m.fromPlaceId) && graph.hasNode(m.toPlaceId)
    );
    const visibleSpotlights = spotlights.filter((s) =>
      graph.hasNode(s.placeId)
    );

    // 高解析度畫布同步（devicePixelRatio）/ Sync canvas backing store (dpr)
    // 初次呼叫必須留到 isAnimating / renderFrame 宣告之後，否則會撞到 TDZ
    // The first call must come after isAnimating / renderFrame are declared,
    // otherwise it hits the temporal dead zone.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!isAnimating()) renderFrame(STATIC_FRAME_MS);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // 動畫點顏色 = 移動者陣營色（無陣營用青綠）/
    // Move dot color = mover's faction color (teal fallback)
    const factionColors = new Map<string, string>();
    for (const faction of factions) {
      factionColors.set(faction.id, hslToHex(faction.color));
    }

    /** 靜態幀的時間點：脈動與光點都停在一個代表性的中間相位 / A representative mid-animation phase for the static frame */
    const STATIC_FRAME_MS = CONFIG.MOVE_ANIM_DURATION / 2;

    let raf = 0;
    let onScreen = true;
    let start = performance.now();

    /** 只有「在畫面上 + 分頁可見 + 允許動態」才跑 / Animate only when on screen, the tab is visible, and motion is allowed */
    const isAnimating = () =>
      onScreen && !document.hidden && !reducedMotionRef.current;

    /** 依經過時間畫一幀 / Draw one frame for the given elapsed time */
    const renderFrame = (t: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // 聚光燈：脈動發光環（半徑用 scaleSize 隨鏡頭縮放，永遠畫在節點圓外）
      // Spotlight: pulsing glow ring (radius uses scaleSize so it tracks zoom
      // and always sits outside the node circle)
      const pulse = 0.5 + 0.5 * Math.sin((t / CONFIG.SPOTLIGHT_RING_PULSE_MS) * Math.PI);
      ctx.lineWidth = CONFIG.SPOTLIGHT_RING_WIDTH;
      for (const sp of visibleSpotlights) {
        const attrs = graph.getNodeAttributes(sp.placeId);
        const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
        // 節點的螢幕半徑（與 Sigma 渲染同一套縮放）+ 間距 + 脈動
        // Node's on-screen radius (same scaling Sigma renders with) + gap + pulse
        const nodeRadius = sigma.scaleSize(attrs.size as number);
        const radius =
          nodeRadius +
          CONFIG.SPOTLIGHT_RING_OFFSET +
          CONFIG.SPOTLIGHT_RING_PULSE_AMP * pulse;
        const color = sp.kind === 'created' ? '#22d3ee' : '#f87171';
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur =
          CONFIG.SPOTLIGHT_RING_SHADOW +
          CONFIG.SPOTLIGHT_RING_SHADOW_PULSE * pulse;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // 移動點：行進（帶尾跡）→ 停頓，週期循環 /
      // Move dot: travel (with trail) → pause, looping
      const cycle = CONFIG.MOVE_ANIM_DURATION + CONFIG.MOVE_ANIM_PAUSE;
      const phase = (t % cycle) / CONFIG.MOVE_ANIM_DURATION;
      if (phase <= 1) {
        // easeInOutQuad / 緩入緩出
        const p = phase;
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        for (const m of validMoves) {
          const a = graph.getNodeAttributes(m.fromPlaceId);
          const b = graph.getNodeAttributes(m.toPlaceId);
          const va = sigma.graphToViewport({ x: a.x, y: a.y });
          const vb = sigma.graphToViewport({ x: b.x, y: b.y });
          const x = va.x + (vb.x - va.x) * eased;
          const y = va.y + (vb.y - va.y) * eased;
          const color =
            (m.factionId ? factionColors.get(m.factionId) : undefined) ??
            '#5eead4';

          // 尾跡 / Trail
          const tailT = Math.max(0, eased - 0.12);
          ctx.beginPath();
          ctx.moveTo(va.x + (vb.x - va.x) * tailT, va.y + (vb.y - va.y) * tailT);
          ctx.lineTo(x, y);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // 光點 / Glowing dot
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // 脈動環在暫停時仍留一幀，畫面不會變空白 /
      // A paused ring still leaves one frame on screen, so it never blanks out
    };

    // 沒有聚光燈也沒有移動 → 不啟動動畫迴圈。這個提早返回必須放在
    // isAnimating / renderFrame 宣告之後：resize 閉包會用到它們，而
    // ResizeObserver 已經註冊了。提早返回會讓那兩個 const 永遠停在 TDZ，
    // 於是每次容器改變尺寸（切換桌機／手機）都丟 ReferenceError /
    // No spotlights and no moves means no animation loop — but this early
    // return must come *after* isAnimating / renderFrame are declared: the
    // resize closure touches them and the ResizeObserver is already live.
    // Returning early left both consts in the TDZ, so every container resize
    // (desktop <-> mobile) threw.
    if (visibleSpotlights.length === 0 && validMoves.length === 0) {
      return () => resizeObserver.disconnect();
    }

    const tick = (now: number) => {
      if (!isAnimating()) {
        raf = 0;
        return;
      }
      renderFrame(now - start);
      raf = requestAnimationFrame(tick);
    };

    /** 開始／續播 / Start or resume the loop */
    const play = () => {
      if (raf !== 0 || !isAnimating()) return;
      start = performance.now();
      raf = requestAnimationFrame(tick);
    };

    /** 暫停 / Pause the loop */
    const pause = () => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // 先把畫布尺寸與 transform 設定好，再決定要播還是畫一幀 /
    // Size the backing store first, then decide whether to animate or draw a frame
    resize();

    // 捲出視窗就停，回到畫面才續播（離開時補一幀，回來不會看到空白）/
    // Pause when scrolled out of view and resume on return (a frame is drawn on
    // the way out so the canvas is never blank when it comes back)
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      onScreen = entry.isIntersecting;
      if (onScreen) play();
      else {
        pause();
        renderFrame(STATIC_FRAME_MS);
      }
    });
    intersectionObserver.observe(canvas);

    // 分頁切到背景就停 / Pause while the tab is in the background
    const onVisibilityChange = () => {
      if (document.hidden) pause();
      else play();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 使用者中途開啟「減少動態效果」也要立刻停 / Honour a mid-session switch
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => {
      if (motionQuery.matches) {
        pause();
        renderFrame(STATIC_FRAME_MS);
      } else {
        play();
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    if (isAnimating()) {
      play();
    } else {
      // 減少動態效果：只畫一幀，不啟動迴圈 /
      // Reduced motion: one static frame, no loop
      renderFrame(STATIC_FRAME_MS);
    }

    return () => {
      pause();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery.removeEventListener('change', onMotionChange);
      resizeObserver.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [spotlights, moves, factions]);

  return (
    // Sigma 的 kill() 會清空整個 container，因此 tooltip 必須放在
    // sigma container 的兄弟節點，避免 React 移除已被刪除的節點而拋錯。
    // Sigma's kill() empties the whole container, so the tooltip must be a
    // SIBLING of the sigma container — otherwise React later tries to remove
    // an already-deleted node and throws 'removeChild' errors.
    // 四內陰影讓世界聚焦在中央（token 在 globals.css 的 @theme static）/
    // The inner vignette frames the world and focuses the centre (token lives in
    // globals.css @theme static)
    <div className="w-full h-full relative shadow-ds-map-vignette">
      {/* 節點發光 + 陰影（最底層裝飾）/ Node glow + drop shadow (bottom decoration layer)
          w-full h-full 理由同覆蓋層：canvas 是替換元素 / same reason as the overlay: canvas is a replaced element
          DOM 順序：發光層 → 聚光燈層 → sigma container。發光要在聚光燈環之下，
          sigma 的節點與標籤又在最上面。
          DOM order: glow → spotlight overlay → sigma container. The glow sits under
          the spotlight rings, and sigma's nodes and labels sit above both. */}
      <canvas
        ref={glowRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      {/* 聚光燈環 + 移動動畫覆蓋層（不攔截滑鼠事件）/ Spotlight rings + move animation overlay (never intercepts mouse events)
          w-full h-full 必須：canvas 是替換元素，absolute inset-0 不會自動撐滿（intrinsic 300×150）
          w-full h-full is required: canvas is a replaced element — absolute inset-0 alone leaves it at its intrinsic 300×150
          DOM 順序：覆蓋層必須在 sigma container「之前」——sigma 的 WebGL canvas
          背景透明，後畫的 sigma 會疊在覆蓋層上，地名標籤才能壓過聚光燈環。
          DOM order: the overlay MUST come BEFORE the sigma container — sigma's
          WebGL canvas is transparent, so painting sigma last puts place labels
          on top of the spotlight rings. */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div ref={containerRef} className="absolute inset-0" />
      {/* 工具提示 / Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-900/95 backdrop-blur-md rounded-xl p-3.5 text-base shadow-2xl shadow-black/50 border border-gray-700/60"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          {/* 頂部發光線 / Top glow line */}
          <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

          <div className="font-orbitron font-bold text-lg text-white mb-1 tracking-wide">
            {tooltip.place.name}
          </div>
          {tooltip.faction && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: tooltip.faction.color }}
              />
              <span className="text-gray-300 text-sm">{tooltip.faction.name}</span>
            </div>
          )}
          <div className="space-y-0.5 text-gray-400 text-sm">
            <div>⚔️ 兵力: <span className="text-cyan-400 font-orbitron">{tooltip.place.garrison}</span> (+ {tooltip.characterCount} 將領)</div>
            <div>🏰 堡壘: <span className="text-gray-400 font-orbitron">{tooltip.place.fortress}</span></div>
            <div>🏪 市場: <span className="text-gray-400 font-orbitron">{tooltip.place.market}</span></div>
            <div>🏯 兵營: <span className="text-gray-400 font-orbitron">{tooltip.place.barracks}</span></div>
            <div>👥 將領: <span className="text-gray-400 font-orbitron">{tooltip.characterCount}</span></div>
          </div>
          {tooltip.linkedPlaces.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-800/60 text-gray-400 text-sm">
              🛣️ {tooltip.linkedPlaces.join('、')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
