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

/**
 * 將 HSL 字串轉換為 hex 格式 / Convert HSL string to hex format
 * Sigma.js/WebGL 需要 hex 或 rgb 格式 / Sigma.js/WebGL requires hex or rgb format
 */
function hslToHex(hsl: string): string {
  // 解析 "hsl(120, 70%, 50%)" 格式 / Parse "hsl(120, 70%, 50%)" format
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return '#666666'; // 預設灰色 / Default gray

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

interface SigmaMapProps {
  places: Place[];
  factions: Faction[];
  roads: Road[];
  characters: Character[];
  onPlaceClick?: (place: Place) => void;
  selectedPlaceId?: string | null;
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
  onPlaceClick,
  selectedPlaceId,
}: SigmaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const hoveredNeighborsRef = useRef<Set<string>>(new Set());
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  const onPlaceClickRef = useRef(onPlaceClick);

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
  }, [selectedPlaceId, onPlaceClick]);

  // ── 建立 Sigma 實例（僅一次）/ Create the Sigma instance (once) ──────────

  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph();
    graphRef.current = graph;

    // 建立 Sigma 實例 / Create Sigma instance
    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: '#ffffff26', // 半透明白色 / Semi-transparent white
      defaultNodeColor: '#666',
      labelFont: 'monospace',
      labelSize: 14,
      labelColor: { attribute: 'labelColor' }, // 從節點屬性讀取標籤顏色 / Read label color from node attribute
      labelWeight: 'bold',
      renderLabels: true,
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
        res.labelSize = Math.max(12, Math.min(16, data.size / 2));

        // hover / 選中 時標籤變黑色，連接節點也高亮 / Label turns black on hover/select, connected nodes also highlighted
        if (hoveredNodeRef.current === node) {
          res.labelColor = '#000000'; // 純字串，非物件 / Plain string, not object
          res.zIndex = 1; // hover 節點在最上層 / Hovered node on top
          res.highlighted = true;
        } else if (selectedPlaceIdRef.current === node) {
          res.labelColor = '#000000';
          res.highlighted = true;
        } else if (hoveredNeighborsRef.current.has(node)) {
          res.labelColor = '#000000';
          res.highlighted = true;
        } else {
          res.labelColor = '#ffffff'; // 預設白色 / Default white
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

    return () => {
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
      const color = faction ? hslToHex(faction.color) : '#696969';

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
            color: '#696969',
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

  return (
    // Sigma 的 kill() 會清空整個 container，因此 tooltip 必須放在
    // sigma container 的兄弟節點，避免 React 移除已被刪除的節點而拋錯。
    // Sigma's kill() empties the whole container, so the tooltip must be a
    // SIBLING of the sigma container — otherwise React later tries to remove
    // an already-deleted node and throws 'removeChild' errors.
    <div className="w-full h-full relative">
      <div ref={containerRef} className="absolute inset-0" />
      {/* 工具提示 / Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-800/95 rounded-lg p-3 text-xs shadow-xl border border-gray-700"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-bold text-white text-sm mb-1">
            {tooltip.place.name}
          </div>
          {tooltip.faction && (
            <div className="flex items-center gap-1 mb-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: tooltip.faction.color }}
              />
              <span className="text-gray-300">{tooltip.faction.name}</span>
            </div>
          )}
          <div className="space-y-0.5 text-gray-400">
            <div>⚔️ 兵力: {tooltip.place.garrison} (+ {tooltip.characterCount} 將領)</div>
            <div>🏰 堡壘: {tooltip.place.fortress}</div>
            <div>🏪 市場: {tooltip.place.market}</div>
            <div>🏯 兵營: {tooltip.place.barracks}</div>
            <div>👥 將領: {tooltip.characterCount}</div>
          </div>
          {tooltip.linkedPlaces.length > 0 && (
            <div className="mt-1 pt-1 border-t border-gray-700 text-gray-300">
              🛣️ 相連地點 / Linked places: {tooltip.linkedPlaces.join('、')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
