// ============================================================================
// ForceAtlas2 佈局計算 / ForceAtlas2 Layout Calculation
// ============================================================================
// 使用 graphology-layout-forceatlas2 計算地圖佈局。
// Uses graphology-layout-forceatlas2 to calculate map layout.
//
// 每 LAYOUT_RECALC_INTERVAL 回合全域重算一次。
// Full recalculation every LAYOUT_RECALC_INTERVAL rounds.
//
// 使用方式 / Usage:
//   import { recalculateLayout } from '@/server/graph/layout';
//   await recalculateLayout(worldId);
// ============================================================================

import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { prisma } from '@/lib/prisma';
import { CONFIG, getScalingRatio } from '@/lib/gameConfig';

/**
 * 根據節點數量動態計算 gravity。
 * Dynamic gravity based on node count.
 * 節點少時 0.5，多時 0.3 — 避免炸開
 * Low node count: 0.5, high: 0.3 — prevent explosion
 */
function getGravity(nodeCount: number): number {
  const minGravity = 0.3;
  const maxGravity = 0.5;
  const minNodes = 100;
  const maxNodes = 2000;
  if (nodeCount <= minNodes) return maxGravity;
  if (nodeCount >= maxNodes) return minGravity;
  return maxGravity - ((nodeCount - minNodes) / (maxNodes - minNodes)) * (maxGravity - minGravity);
}

/**
 * 建立 ForceAtlas2 設定 / Create ForceAtlas2 settings
 * 根據節點數量動態調整 gravity 和 scalingRatio
 * Dynamically adjusts gravity and scalingRatio based on node count
 */
function createFA2Settings(nodeCount: number) {
  return {
    gravity: getGravity(nodeCount),
    scalingRatio: getScalingRatio(nodeCount),
    barnesHutOptimize: CONFIG.FA2_BARNES_HUT,
    barnesHutTheta: CONFIG.FA2_BARNES_HUT_THETA,
    adjustSizes: CONFIG.FA2_ADJUST_SIZES,
    linLogMode: CONFIG.FA2_LIN_LOG_MODE,
    edgeWeightInfluence: CONFIG.FA2_EDGE_WEIGHT_INFLUENCE,
    outboundAttractionDistribution: CONFIG.FA2_OUTBOUND_ATTRACTION_DISTRIBUTION,
    strongGravityMode: CONFIG.FA2_STRONG_GRAVITY_MODE,
    slowDown: 1,
  };
}

/**
 * 執行 ForceAtlas2 佈局計算。
 * Execute ForceAtlas2 layout calculation.
 *
 * 從資料庫讀取所有地方和道路，建立圖形，運行 ForceAtlas2，
 * 然後將結果寫回 layoutX/layoutY。
 * Reads all places and roads from database, builds graph,
 * runs ForceAtlas2, then writes results back to layoutX/layoutY.
 *
 * @param worldId - 要計算佈局的世界 ID / World ID to calculate layout for
 */
export async function recalculateLayout(worldId: string): Promise<void> {
  // 取得所有地方和道路 / Fetch all places and roads
  const [places, roads] = await Promise.all([
    prisma.place.findMany({
      where: { worldId },
      select: { id: true, layoutX: true, layoutY: true },
    }),
    prisma.road.findMany({
      where: { worldId },
      select: { aId: true, bId: true },
    }),
  ]);

  if (places.length === 0) return;

  // 建立 graphology 圖形 / Create graphology graph
  const graph = new Graph();

  // 新增節點 / Add nodes
  // ForceAtlas2 無法在所有節點都在 (0,0) 時運算
  // ForceAtlas2 cannot compute when all nodes are at (0,0)
  // 所以我們給一個隨機初始位置 / So we give random initial positions
  for (const place of places) {
    const needsInit = place.layoutX === 0 && place.layoutY === 0;
    graph.addNode(place.id, {
      x: needsInit ? Math.random() * 1000 : place.layoutX,
      y: needsInit ? Math.random() * 1000 : place.layoutY,
    });
  }

  // 新增邊緣 / Add edges
  for (const road of roads) {
    if (graph.hasNode(road.aId) && graph.hasNode(road.bId)) {
      if (!graph.hasEdge(road.aId, road.bId)) {
        graph.addEdge(road.aId, road.bId);
      }
    }
  }

  // 運行 ForceAtlas2 / Run ForceAtlas2
  const positions = forceAtlas2(graph, {
    iterations: CONFIG.FA2_ITERATIONS,
    settings: createFA2Settings(places.length),
  });

  // 將結果寫回資料庫 / Write results back to database
  const updates = Object.entries(positions).map(([nodeId, pos]) =>
    prisma.place.update({
      where: { id: nodeId },
      data: {
        layoutX: pos.x,
        layoutY: pos.y,
      },
    })
  );

  await Promise.all(updates);
}

/**
 * 檢查是否需要重新計算佈局。
 * Check if layout needs recalculation.
 *
 * @param currentRound - 當前回合數 / Current round number
 * @returns 是否需要重算 / Whether recalculation is needed
 */
export function shouldRecalculate(currentRound: number): boolean {
  return currentRound % CONFIG.LAYOUT_RECALC_INTERVAL === 0;
}
