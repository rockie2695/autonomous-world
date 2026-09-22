// ============================================================================
// 階段 6：人際關係
// Phase 6: Relationships
// ============================================================================
// 在鄰近角色間建立友誼與不滿。
// Forms friendships and discontent between nearby characters.
//
// 規則（來自規格）/ Rules (from spec):
// - 每回合：同地點或相鄰（1 條道路）的角色配對 / Each round: same place or adjacent (1 road) character pairs
// - FRIEND_FORM_CHANCE（5%）→ 友誼（雙向）/ FRIEND_FORM_CHANCE (5%) → Friendship (bidirectional)
// - DISCONTENT_FORM_CHANCE（5%）→ 不滿（單向）/ DISCONTENT_FORM_CHANCE (5%) → Discontent (unidirectional)
//
// 使用方式 / Usage:
//   await relationships(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 在鄰近角色間建立關係。
 * Form relationships between nearby characters.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於關係建立的種子 RNG / Seeded RNG for relationship formation
 */
export async function relationships(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有存活角色及其所在地 / Get all living characters with their places
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: { id: true, placeId: true },
  });

  // 取得所有道路以找出相鄰地點 / Get all roads to find adjacent places
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // 建立鄰接表 / Build adjacency map
  const adjacent = new Map<string, Set<string>>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, new Set());
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, new Set());
    adjacent.get(road.aId)!.add(road.bId);
    adjacent.get(road.bId)!.add(road.aId);
  }

  // 找出符合條件的配對（同地點或相鄰）/ Find eligible pairs (same place or adjacent)
  const eligiblePairs: [string, string][] = [];

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i];
      const b = characters[j];

      // 同地點 / Same place
      if (a.placeId === b.placeId) {
        eligiblePairs.push([a.id, b.id]);
        continue;
      }

      // 相鄰地點 / Adjacent places
      const aAdjacent = adjacent.get(a.placeId);
      if (aAdjacent?.has(b.placeId)) {
        eligiblePairs.push([a.id, b.id]);
      }
    }
  }

  // 處理每組符合條件的配對 / Process each eligible pair
  for (const [aId, bId] of eligiblePairs) {
    // 建立友誼 / Form friendship
    if (rng.chance(CONFIG.FRIEND_FORM_CHANCE)) {
      // 檢查友誼是否已存在 / Check if friendship already exists
      const existing = await prisma.friendship.findUnique({
        where: {
          worldId_aId_bId: {
            worldId,
            aId: aId < bId ? aId : bId,
            bId: aId < bId ? bId : aId,
          },
        },
      });

      if (!existing) {
        await prisma.friendship.create({
          data: {
            worldId,
            aId: aId < bId ? aId : bId,
            bId: aId < bId ? bId : aId,
            sinceRound: round,
          },
        });
      }
    }

    // 建立不滿（單向）/ Form discontent (unidirectional)
    if (rng.chance(CONFIG.DISCONTENT_FORM_CHANCE)) {
      const existing = await prisma.discontent.findUnique({
        where: {
          worldId_aId_bId: { worldId, aId, bId },
        },
      });

      if (!existing) {
        await prisma.discontent.create({
          data: {
            worldId,
            aId,
            bId,
            sinceRound: round,
          },
        });
      }
    }
  }
}
