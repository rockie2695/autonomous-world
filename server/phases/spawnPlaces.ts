// ============================================================================
// Phase 1: Spawn Places
// ============================================================================
// Creates new places and roads each round.
//
// Rules (from spec):
// - PLACE_NEW_PER_ROUND new places per round (default: 1)
// - Parent node: random existing place
// - New place: 1-3 roads to random existing places (deduped, each end < 3 roads)
// - Layout: near neighbor centroid with random offset (centroid-based placement)
// - Every LAYOUT_RECALC_INTERVAL rounds, recalculate all positions
//
// Usage:
//   const newCount = await spawnPlaces(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generatePlaceName } from '@/lib/nameGenerator/place';

/**
 * 檢查新位置是否與既有節點碰撞。
 * Check if a new position collides with existing nodes.
 *
 * @param existingPositions - 既有節點位置 / Existing node positions
 * @param x - 新位置 X / New position X
 * @param y - 新位置 Y / New position Y
 * @param minDist - 最小間距 / Minimum distance
 * @returns 是否碰撞 / Whether collision exists
 */
function hasCollision(
  existingPositions: Array<{ x: number; y: number }>,
  x: number,
  y: number,
  minDist: number
): boolean {
  for (const pos of existingPositions) {
    const dx = pos.x - x;
    const dy = pos.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < minDist) {
      return true;
    }
  }
  return false;
}

/**
 * Spawn new places and connect them with roads.
 *
 * @param worldId - The world to add places to
 * @param round - Current round number
 * @param rng - Seeded RNG for reproducibility
 * @returns Number of new places created
 */
export async function spawnPlaces(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // Check if we've hit the place cap
  const placeCount = await prisma.place.count({
    where: { worldId },
  });

  if (placeCount >= CONFIG.PLACE_MAX_COUNT) {
    return 0; // World is full
  }

  const newPlacesCount = Math.min(
    CONFIG.PLACE_NEW_PER_ROUND,
    CONFIG.PLACE_MAX_COUNT - placeCount
  );

  let created = 0;

  for (let i = 0; i < newPlacesCount; i++) {
    // Pick a random parent place
    const parentPlaces = await prisma.place.findMany({
      where: { worldId },
      select: { id: true, layoutX: true, layoutY: true },
    });

    if (parentPlaces.length === 0) continue;

    const parent = rng.pick(parentPlaces) as { id: string; layoutX: number; layoutY: number } | undefined;
    if (!parent) continue;

    // Generate a unique name
    const name = generatePlaceName(rng);

    // ── 增量佈局：鄰居重心 + 隨機偏移 + 碰撞檢查 ──
    // Incremental layout: neighbor centroid + random offset + collision check
    // 1. 找出鄰居（母節點 + 隨機連接的既有節點）
    // 2. 計算鄰居重心
    // 3. 用隨機角度 + 半徑計算新位置
    // 4. 碰撞檢查，最多重試 COLLISION_MAX_RETRY 次

    // 鄰居 = 母節點（保證連通）
    const neighborIds = [parent.id];

    // 新節點會連接的目標（稍後建立道路）
    const roadCount = rng.int(
      CONFIG.ROAD_NEW_PER_PLACE_MIN,
      CONFIG.ROAD_NEW_PER_PLACE_MAX
    );

    const existingPlaces = parentPlaces.filter((p: { id: string }) => p.id !== parent.id);
    const targetPlaces = rng.shuffle(existingPlaces).slice(0, roadCount);

    // 鄰居包含所有會連接的節點
    for (const target of targetPlaces) {
      neighborIds.push(target.id);
    }

    // 計算鄰居重心 / Calculate neighbor centroid
    let avgX = 0;
    let avgY = 0;
    for (const neighborId of neighborIds) {
      const neighbor = parentPlaces.find((p: { id: string }) => p.id === neighborId);
      if (neighbor) {
        avgX += neighbor.layoutX;
        avgY += neighbor.layoutY;
      }
    }
    avgX /= neighborIds.length;
    avgY /= neighborIds.length;

    // 碰撞檢查用的既有位置列表
    const existingPositions = parentPlaces.map((p: { layoutX: number; layoutY: number }) => ({
      x: p.layoutX,
      y: p.layoutY,
    }));

    // 隨機角度 + 半徑，嘗試放置
    let layoutX = avgX;
    let layoutY = avgY;

    for (let retry = 0; retry < CONFIG.NODE_COLLISION_MAX_RETRY; retry++) {
      const angle = rng.float(0, Math.PI * 2);
      const radius = rng.float(CONFIG.NODE_SPAWN_RADIUS_MIN, CONFIG.NODE_SPAWN_RADIUS_MAX);
      const candidateX = avgX + Math.cos(angle) * radius;
      const candidateY = avgY + Math.sin(angle) * radius;

      if (!hasCollision(existingPositions, candidateX, candidateY, CONFIG.NODE_COLLISION_MIN_DIST)) {
        layoutX = candidateX;
        layoutY = candidateY;
        break;
      }

      // 最後一次失敗就用最後的候選位置
      layoutX = candidateX;
      layoutY = candidateY;
    }

    // Create the place
    const place = await prisma.place.create({
      data: {
        worldId,
        name,
        layoutX,
        layoutY,
        createdAtRound: round,
        fortress: CONFIG.PLACE_INITIAL_FORTRESS,
        market: CONFIG.PLACE_INITIAL_MARKET,
        barracks: CONFIG.PLACE_INITIAL_BARRACKS,
        garrison: CONFIG.PLACE_INITIAL_GARRISON,
      },
    });

    // Log the event / 記錄事件
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'PLACE_CREATED',
        data: {
          placeId: place.id,
          placeName: name,
          parentId: parent.id,
        },
      },
    });

    // Create roads to target places
    for (const target of targetPlaces) {
      // Ensure aId < bId for consistency
      const [aId, bId] = [place.id, target.id].sort();

      // Check if road already exists
      const existingRoad = await prisma.road.findUnique({
        where: {
          worldId_aId_bId: { worldId, aId, bId },
        },
      });

      if (!existingRoad) {
        await prisma.road.create({
          data: {
            worldId,
            aId,
            bId,
            createdAtRound: round,
          },
        });
      }
    }

    created++;
  }

  return created;
}
