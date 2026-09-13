// ============================================================================
// Phase 6: Relationships
// ============================================================================
// Forms friendships and discontent between nearby characters.
//
// Rules (from spec):
// - Each round: same place or adjacent (1 road) character pairs
// - FRIEND_FORM_CHANCE (5%) → Friendship (bidirectional)
// - DISCONTENT_FORM_CHANCE (5%) → Discontent (unidirectional)
//
// Usage:
//   await relationships(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * Form relationships between nearby characters.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG for relationship formation
 */
export async function relationships(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Get all living characters with their places
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: { id: true, placeId: true },
  });

  // Get all roads to find adjacent places
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // Build adjacency map
  const adjacent = new Map<string, Set<string>>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, new Set());
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, new Set());
    adjacent.get(road.aId)!.add(road.bId);
    adjacent.get(road.bId)!.add(road.aId);
  }

  // Find eligible pairs (same place or adjacent)
  const eligiblePairs: [string, string][] = [];

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i];
      const b = characters[j];

      // Same place
      if (a.placeId === b.placeId) {
        eligiblePairs.push([a.id, b.id]);
        continue;
      }

      // Adjacent places
      const aAdjacent = adjacent.get(a.placeId);
      if (aAdjacent?.has(b.placeId)) {
        eligiblePairs.push([a.id, b.id]);
      }
    }
  }

  // Process each eligible pair
  for (const [aId, bId] of eligiblePairs) {
    // Form friendship
    if (rng.chance(CONFIG.FRIEND_FORM_CHANCE)) {
      // Check if friendship already exists
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

    // Form discontent (unidirectional)
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
