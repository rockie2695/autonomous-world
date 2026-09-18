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
}

interface Tooltip {
  x: number;
  y: number;
  place: Place;
  faction: Faction | null;
  characterCount: number;
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
}: SigmaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 清理舊圖形 / Clean up old graph
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }
    if (graphRef.current) {
      graphRef.current.clear();
    }

    // 建立新圖形 / Create new graph
    const graph = new Graph();
    graphRef.current = graph;

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
      nodeReducer: (node, data) => {
        const res = { ...data };
        // 節點越大，標籤越清晰 / Larger nodes get clearer labels
        res.labelSize = Math.max(12, Math.min(16, data.size / 2));

        // hover 時標籤變黑色 / Label turns black on hover
        if (hoveredNodeRef.current === node) {
          res.labelColor = '#000000'; // 純字串，非物件 / Plain string, not object
          res.zIndex = 1; // hover 節點在最上層 / Hovered node on top
        } else {
          res.labelColor = '#ffffff'; // 預設白色 / Default white
        }

        return res;
      },
    });

    // ── Hover 事件 / Hover Events ──────────────────────────────────────────

    sigma.on('enterNode', ({ node }) => {
      hoveredNodeRef.current = node;
      sigma.refresh(); // 強制重繪以觸發 nodeReducer / Force redraw to trigger nodeReducer

      const attrs = graph.getNodeAttributes(node);

      // 顯示工具提示 / Show tooltip
      const nodePos = graph.getNodeAttributes(node);
      const viewportPos = sigma.graphToViewport({
        x: nodePos.x,
        y: nodePos.y,
      });

      setTooltip({
        x: viewportPos.x,
        y: viewportPos.y,
        place: attrs.placeData,
        faction: attrs.factionData,
        characterCount: attrs.characterCount,
      });

      if (containerRef.current) {
        containerRef.current.style.cursor = 'pointer';
      }
    });

    sigma.on('leaveNode', () => {
      hoveredNodeRef.current = null;
      sigma.refresh(); // 強制重繪以觸發 nodeReducer / Force redraw to trigger nodeReducer
      setTooltip(null);

      if (containerRef.current) {
        containerRef.current.style.cursor = '';
      }
    });

    // ── 點擊事件 / Click Event ─────────────────────────────────────────────

    sigma.on('clickNode', (event: { node: string }) => {
      const node = event.node;
      const attrs = graph.getNodeAttributes(node);
      if (onPlaceClick) {
        onPlaceClick(attrs.placeData);
      }
    });

    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [places, factions, roads, characters, onPlaceClick]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
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
        </div>
      )}
    </div>
  );
}
