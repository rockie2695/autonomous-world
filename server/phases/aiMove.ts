// ============================================================================
// Phase 9: AI Movement
// ============================================================================
// Moves each character toward their target (1 tile per turn).
//
// Rules (from spec):
// - Each character moves at most 1 place per turn
// - Movement order: speed descending (v1.1)
// - Same speed: seeded RNG determines order
// - If character has no target, they stay put
// - Target priority: Signal > Faction enemy > Stay put
//
// Usage:
//   await aiMove(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * Move all characters toward their targets.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG for tie-breaking movement order
 */
export async function aiMove(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Get all living characters with their current locations and faction
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: {
      id: true,
      placeId: true,
      speed: true,
      factionId: true,
    },
  });

  // Sort by speed descending (v1.1)
  // For same speed, use seeded RNG for deterministic tie-breaking
  const sorted = characters.sort((a, b) => {
    if (a.speed !== b.speed) return b.speed - a.speed;
    // Same speed: use RNG
    return rng.random() - 0.5;
  });

  // Get all roads for pathfinding
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // Build adjacency map
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }

  // Get active signals for this round
  const activeSignals = await prisma.signal.findMany({
    where: {
      worldId,
      active: true,
      expireRound: { gte: round },
    },
    select: {
      fromId: true,
      targetPlaceId: true,
    },
  });

  // Build signal map: characterId -> targetPlaceId
  const signalTargets = new Map<string, string>();
  for (const signal of activeSignals) {
    signalTargets.set(signal.fromId, signal.targetPlaceId);
  }

  // Get all places with their faction info for enemy detection
  const places = await prisma.place.findMany({
    where: { worldId },
    select: {
      id: true,
      factionId: true,
    },
  });

  // Build place faction map
  const placeFactionMap = new Map<string, string | null>();
  for (const place of places) {
    placeFactionMap.set(place.id, place.factionId);
  }

  // Move each character
  for (const char of sorted) {
    const currentPlaceFaction = placeFactionMap.get(char.placeId);

    // 1. Check if character has a target from signal
    const signalTarget = signalTargets.get(char.id);
    if (signalTarget) {
      // Move toward signal target
      const neighbors = adjacent.get(char.placeId) ?? [];
      if (neighbors.includes(signalTarget)) {
        // Can move directly to target
        await prisma.character.update({
          where: { id: char.id },
          data: { placeId: signalTarget },
        });
        continue;
      }

      // Find adjacent place that gets closer to target (BFS depth 1)
      // For now, just move to any adjacent place that's not owned by enemy
      for (const neighbor of neighbors) {
        const neighborFaction = placeFactionMap.get(neighbor);
        if (neighborFaction !== currentPlaceFaction) continue; // Skip enemy places
        await prisma.character.update({
          where: { id: char.id },
          data: { placeId: neighbor },
        });
        break;
      }
      continue;
    }

    // 2. If no signal, check if faction has enemies nearby
    if (char.factionId) {
      const neighbors = adjacent.get(char.placeId) ?? [];

      // Find enemy places (different faction or unowned)
      const enemyPlaces = neighbors.filter((n) => {
        const nFaction = placeFactionMap.get(n);
        return nFaction !== currentPlaceFaction;
      });

      if (enemyPlaces.length > 0) {
        // Move toward random enemy place
        const target = rng.pick(enemyPlaces);
        if (target) {
          await prisma.character.update({
            where: { id: char.id },
            data: { placeId: target },
          });
        }
      }
    }

    // 3. If no target, stay put (no movement)
  }
}
