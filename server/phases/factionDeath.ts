// ============================================================================
// Phase 14: Faction Death
// ============================================================================
// Checks if factions should be marked as dead.
//
// Rules (from spec):
// - If faction has 0 places AND 0 characters → alive = false
// - Dead factions are removed from the game
//
// Usage:
//   await factionDeath(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';

/**
 * Check for faction death (0 places, 0 characters).
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG (unused for this phase)
 */
export async function factionDeath(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Find all alive factions
  const factions = await prisma.faction.findMany({
    where: {
      worldId,
      alive: true,
    },
  });

  for (const faction of factions) {
    // Count places and characters
    const [placeCount, charCount] = await Promise.all([
      prisma.place.count({
        where: { factionId: faction.id },
      }),
      prisma.character.count({
        where: { factionId: faction.id, alive: true },
      }),
    ]);

    // If both are zero, faction is dead
    if (placeCount === 0 && charCount === 0) {
      await prisma.faction.update({
        where: { id: faction.id },
        data: {
          alive: false,
          endedAtRound: round,
        },
      });
    }
  }
}
