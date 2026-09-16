// ============================================================================
// Phase 1: Spawn Places
// ============================================================================
// Creates new places and roads each round.
//
// Rules (from spec):
// - PLACE_NEW_PER_ROUND new places per round (default: 1)
// - Parent node: random existing place
// - New place: 1-3 roads to random existing places (deduped, each end < 3 roads)
// - Layout: near parent with random offset
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

    // Calculate layout position (near parent with offset)
    // 增量佈局：新節點放在母節點附近隨機偏移
    const layoutX = parent.layoutX + rng.float(-20, 20);
    const layoutY = parent.layoutY + rng.float(-20, 20);

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

    // Create 1-3 roads to random existing places
    const roadCount = rng.int(
      CONFIG.ROAD_NEW_PER_PLACE_MIN,
      CONFIG.ROAD_NEW_PER_PLACE_MAX
    );

    const existingPlaces = parentPlaces.filter((p: { id: string }) => p.id !== place.id);
    const targetPlaces = rng.shuffle(existingPlaces).slice(0, roadCount);

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
