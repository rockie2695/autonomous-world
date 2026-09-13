// ============================================================================
// Phase 11: Build
// ============================================================================
// Handles building upgrades by administrators.
//
// Rules (from spec):
// - Only administrators can upgrade buildings
// - Cost: BASE × MULT^level (exponential)
// - Max level: 5 for all buildings
// - Buildings: fortress (defense), market (income), barracks (recruitment)
//
// Usage:
//   await build(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * Process building upgrades for all administrators.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG for upgrade decisions
 */
export async function build(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Get all places with administrators
  const places = await prisma.place.findMany({
    where: {
      worldId,
      administratorId: { not: null },
    },
    include: {
      administrator: {
        select: { id: true, gold: true },
      },
    },
  });

  for (const place of places) {
    if (!place.administrator) continue;

    // Determine which building to upgrade
    const buildings = ['fortress', 'market', 'barracks'] as const;
    const building = rng.pick([...buildings]);
    if (!building) continue;

    // Check current level
    const currentLevel = place[building];
    if (currentLevel >= 5) continue; // Max level

    // Calculate cost
    const cost =
      CONFIG.BUILDING_UPGRADE_COST_BASE *
      Math.pow(CONFIG.BUILDING_UPGRADE_COST_MULT, currentLevel);

    // Check if administrator can afford it
    if (place.administrator.gold < cost) continue;

    // Deduct gold and upgrade
    await prisma.character.update({
      where: { id: place.administrator.id },
      data: { gold: { decrement: cost } },
    });

    await prisma.place.update({
      where: { id: place.id },
      data: { [building]: currentLevel + 1 },
    });
  }
}
