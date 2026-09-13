// ============================================================================
// Phase 7: Ambition Events
// ============================================================================
// Processes ambition changes based on game events.
//
// Rules (from spec):
// - 20 rounds without promotion → ambition +0.5
// - Friend defects → ambition +2
// - King tong high → ambition -0.5 × (king.tong / 30)
//
// Usage:
//   await ambitionEvents(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * Process ambition events for all characters.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG (unused for this phase)
 */
export async function ambitionEvents(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Get all living characters
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: {
      id: true,
      factionId: true,
      lastPromotedRound: true,
      ambition: true,
    },
  });

  for (const char of characters) {
    let delta = 0;
    let reason = '';

    // Check for lack of promotion (20+ rounds)
    const roundsSincePromotion = char.lastPromotedRound
      ? round - char.lastPromotedRound
      : round; // Never promoted

    if (roundsSincePromotion >= CONFIG.AMBITION_NO_PROMOTION_ROUNDS) {
      delta += CONFIG.AMBITION_NO_PROMOTION_DELTA;
      reason += `No promotion for ${roundsSincePromotion} rounds; `;
    }

    // Check if friend recently defected
    // TODO: This requires checking recent defection events
    // For now, skip this check

    // Check king's tong (reduces ambition)
    if (char.factionId) {
      const faction = await prisma.faction.findUnique({
        where: { id: char.factionId },
        select: { kingId: true },
      });

      if (faction?.kingId) {
        const king = await prisma.character.findUnique({
          where: { id: faction.kingId },
          select: { tong: true },
        });

        if (king) {
          const tongReduction =
            CONFIG.AMBITION_KING_TONG_DELTA * (king.tong / 30);
          delta -= tongReduction;
          reason += `King tong ${king.tong} reduces ambition; `;
        }
      }
    }

    // Apply delta if any
    if (delta !== 0) {
      const newAmbition = Math.max(
        CONFIG.CHAR_AMBITION_MIN,
        Math.min(CONFIG.CHAR_AMBITION_MAX, char.ambition + delta)
      );

      await prisma.character.update({
        where: { id: char.id },
        data: { ambition: newAmbition },
      });

      // Log the event
      await prisma.ambitionEvent.create({
        data: {
          worldId,
          charId: char.id,
          round,
          delta,
          reason: reason.trim(),
        },
      });
    }
  }
}
