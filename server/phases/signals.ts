// ============================================================================
// Phase 5: Signals
// ============================================================================
// Processes signal progression and expiry.
//
// Rules (from spec):
// - Signals expire after SIGNAL_DURATION rounds
// - Each faction can have at most 1 active signal
// - King/Admin can send signals with SIGNAL_COOLDOWN cooldown
//
// Usage:
//   await signals(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * Process signal progression and expiry.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG (unused for this phase)
 */
export async function signals(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Expire old signals
  await prisma.signal.updateMany({
    where: {
      worldId,
      active: true,
      expireRound: { lte: round },
    },
    data: { active: false },
  });

  // Decrease cooldowns for characters who sent signals
  await prisma.character.updateMany({
    where: {
      worldId,
      signalCooldown: { gt: 0 },
    },
    data: { signalCooldown: { decrement: 1 } },
  });
}
