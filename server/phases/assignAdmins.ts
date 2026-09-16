// ============================================================================
// Phase 12: Assign Admins
// ============================================================================
// AI auto-assigns administrators to places.
//
// Rules (from spec):
// - Each place has 1 administrator
// - King can administer multiple places
// - AI assigns the character with highest tong at each place
// - If king is idle, they administer their current place
//
// Usage:
//   await assignAdmins(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';

/**
 * Auto-assign administrators to places.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG (unused for this phase)
 */
export async function assignAdmins(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Get all places without administrators
  const unassignedPlaces = await prisma.place.findMany({
    where: {
      worldId,
      administratorId: null,
    },
  });

  for (const place of unassignedPlaces) {
    // Find the character with highest tong at this place
    const bestCandidate = await prisma.character.findFirst({
      where: {
        worldId,
        placeId: place.id,
        alive: true,
      },
      orderBy: { tong: 'desc' },
      select: { id: true, name: true },
    });

    if (bestCandidate) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          administratorId: bestCandidate.id,
        },
      });

      // Update character's lastPromotedRound
      await prisma.character.update({
        where: { id: bestCandidate.id },
        data: { lastPromotedRound: round },
      });

      // Log admin assignment event / 記錄管理員指派事件
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'ADMIN_ASSIGNED',
          data: {
            charId: bestCandidate.id,
            charName: bestCandidate.name,
            placeId: place.id,
            placeName: place.name,
          },
        },
      });
    }
  }
}
