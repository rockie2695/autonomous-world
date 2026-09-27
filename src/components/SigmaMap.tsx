// ============================================================================
// Sigma 地圖元件 — 使用 Sigma.js + graphology 渲染互動式地圖
// Sigma Map Component — Interactive map using Sigma.js + graphology
// ============================================================================
// 功能 / Features:
// - 節點 = 勢力色、大小 = 兵力 / Nodes = faction color, size = troops
// - 道路 = 細線、半透明、hover 高亮 / Roads = thin lines, semi-transparent, hover highlight
// - hover 顯示：名字 + 勢力 + 兵力 + 建築 / Hover: name + faction + troops + buildings
// - 可拖曳 / 縮放 / Draggable + zoomable
// - 點擊顯示地方詳情 / Click shows place detail
// ============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import { drawDiscNodeHover } from 'sigma/rendering';
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
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const hoveredNeighborsRef = useRef<Set<string>>(new Set());
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  const onPlaceClickRef = useRef(onPlaceClick);
  const onControlsReadyRef = useRef(onControlsReady);

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
      renderEdgeLabels: false,
      defaultEdgeColor: '#1e3a5f', // 深藍色道路 / Deep blue roads
      defaultNodeColor: '#4a5568',
      labelFont: 'monospace',
      labelSize: 14,
      labelColor: { attribute: 'labelColor' },
      labelWeight: 'bold',
      renderLabels: true,
      // 統一標籤顯示門檻（config）：節點螢幕尺寸低於閾值時隱藏標籤
      // Unified label show/hide threshold (config-driven)
      labelRenderedSizeThreshold: CONFIG.LABEL_SIZE_THRESHOLD,
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

    // ── 點擊事件 / Click Event ─────────────────────────────────────────────

    sigma.on('clickNode', (event: { node: string }) => {
      const attrs = graph.getNodeAttributes(event.node);
      onPlaceClickRef.current?.(attrs.placeData);
    });

    sigmaRef.current = sigma;

    // 將視角控制交給父層（浮動縮放 / 重設按鈕使用）
    // Hand camera controls to the parent (used by floating zoom / reset buttons)
    onControlsReadyRef.current?.({
      zoomIn: () => {
        void sigma.getCamera().animatedZoom();
      },
      zoomOut: () => {
        void sigma.getCamera().animatedUnzoom();
      },
      resetView: () => {
        // 回到預設視角：置中、ratio 1、角度 0（同時重設拖曳位置與縮放）
        // Return to default view: centered, ratio 1, angle 0 (resets pan and zoom)
        void sigma.getCamera().animatedReset();
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

  // ── 聚光燈環 + 移動動畫（覆蓋畫布）────────────────────────────────────────
  // 每幀用當前鏡頭座標重繪：新生成 / 被攻擊地點顯示脈動發光環；
  // 本回合的移動以光點沿起點 → 終點行進（週期：行進 → 停頓）。
  // Spotlight rings + move animation (overlay canvas): every frame redraws
  // with current camera coordinates — newly created/attacked places get a
  // pulsing glow ring; this round's moves travel as glowing dots from → to
  // (cycle: travel → pause). ────────────────────────────────────────────────

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
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    if (visibleSpotlights.length === 0 && validMoves.length === 0) {
      return () => resizeObserver.disconnect();
    }

    // 動畫點顏色 = 移動者陣營色（無陣營用青綠）/
    // Move dot color = mover's faction color (teal fallback)
    const factionColors = new Map<string, string>();
    for (const faction of factions) {
      factionColors.set(faction.id, hslToHex(faction.color));
    }

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = now - start;
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

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
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
    <div className="w-full h-full relative">
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
