// ============================================================================
// 階段 1：生成地點
// Phase 1: Spawn Places
// ============================================================================
// 每回合建立新地點與道路。
// Creates new places and roads each round.
//
// 規則（來自規格）/ Rules (from spec):
// - 每回合新增 PLACE_NEW_PER_ROUND 個地點（預設：1）/ PLACE_NEW_PER_ROUND new places per round (default: 1)
// - 母節點：隨機既有地點 / Parent node: random existing place
// - 新地點：1-3 條道路連至隨機既有地點（去重，每端 < 3 條路）/ New place: 1-3 roads to random existing places (deduped, each end < 3 roads)
// - 佈局：鄰居重心加隨機偏移（重心式放置）/ Layout: near neighbor centroid with random offset (centroid-based placement)
// - 每 LAYOUT_RECALC_INTERVAL 回合重算所有位置 / Every LAYOUT_RECALC_INTERVAL rounds, recalculate all positions
//
// 使用方式 / Usage:
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
 * 生成新地點並以道路連接。
 * Spawn new places and connect them with roads.
 *
 * @param worldId - 要加入地點的世界 ID / The world to add places to
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於可重現性的種子 RNG / Seeded RNG for reproducibility
 * @returns 建立的新地點數 / Number of new places created
 */
export async function spawnPlaces(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // 檢查是否已達地點上限 / Check if we've hit the place cap
  const placeCount = await prisma.place.count({
    where: { worldId },
  });

  if (placeCount >= CONFIG.PLACE_MAX_COUNT) {
    return 0; // 世界已滿 / World is full
  }

  const newPlacesCount = Math.min(
    CONFIG.PLACE_NEW_PER_ROUND,
    CONFIG.PLACE_MAX_COUNT - placeCount
  );

  let created = 0;

  for (let i = 0; i < newPlacesCount; i++) {
    // 挑選隨機母節點 / Pick a random parent place
    const parentPlaces = await prisma.place.findMany({
      where: { worldId },
      select: { id: true, layoutX: true, layoutY: true },
    });

    if (parentPlaces.length === 0) continue;

    const parent = rng.pick(parentPlaces) as { id: string; layoutX: number; layoutY: number } | undefined;
    if (!parent) continue;

    // 產生唯一名稱 / Generate a unique name
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

    // 統計各既有地點的當前道路數，排除已達上限者 / Count current roads for each existing place to exclude those at max capacity
    const roadCounts = new Map<string, number>();
    const roads = await prisma.road.findMany({
      where: { worldId },
      select: { aId: true, bId: true },
    });
    for (const road of roads) {
      roadCounts.set(road.aId, (roadCounts.get(road.aId) ?? 0) + 1);
      roadCounts.set(road.bId, (roadCounts.get(road.bId) ?? 0) + 1);
    }

    // 過濾出尚未達道路上限的地點 / Filter to places that haven't reached the road limit
    const availablePlaces = existingPlaces.filter(
      (p: { id: string }) => (roadCounts.get(p.id) ?? 0) < CONFIG.ROAD_MAX_PER_PLACE
    );
    const targetPlaces = rng.shuffle(availablePlaces).slice(0, roadCount);

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

    // 建立地點 / Create the place
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

    // 建立連至目標地點的道路 / Create roads to target places
    for (const target of targetPlaces) {
      // 確保 aId < bId 以保持一致 / Ensure aId < bId for consistency
      const [aId, bId] = [place.id, target.id].sort();

      // 檢查道路是否已存在 / Check if road already exists
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
