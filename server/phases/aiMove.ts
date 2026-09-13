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
//
// Usage:
//   await aiMove(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
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
  // Get all living characters with their current locations
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: {
      id: true,
      placeId: true,
      speed: true,
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

  // Move each character
  for (const char of sorted) {
    // TODO: Determine target based on signals, faction orders, or AI logic
    // For now, characters stay in place
    // In Phase 3+, we'll implement proper targeting

    // Placeholder: no movement for now
    // When implemented:
    // 1. Check if character has a target (from signal or AI decision)
    // 2. Find adjacent place that gets closer to target
    // 3. Move character to that place
  }
}
