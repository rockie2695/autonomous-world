// ============================================================================
// 階段 5：號令
// Phase 5: Signals
// ============================================================================
// 處理號令的推進與過期。
// Processes signal progression and expiry.
//
// 規則（來自規格）/ Rules (from spec):
// - 號令在 SIGNAL_DURATION 回合後過期 / Signals expire after SIGNAL_DURATION rounds
// - 每個陣營最多同時有 1 個有效號令 / Each faction can have at most 1 active signal
// - 君王/總督可發送號令，冷卻為 SIGNAL_COOLDOWN / King/Admin can send signals with SIGNAL_COOLDOWN cooldown
//
// 使用方式 / Usage:
//   await signals(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 處理號令的推進與過期。
 * Process signal progression and expiry.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（本階段未使用）/ Seeded RNG (unused for this phase)
 */
export async function signals(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 使過期號令失效 / Expire old signals
  await prisma.signal.updateMany({
    where: {
      worldId,
      active: true,
      expireRound: { lte: round },
    },
    data: { active: false },
  });

  // 減少會發送號令之角色的冷卻 / Decrease cooldowns for characters who sent signals
  await prisma.character.updateMany({
    where: {
      worldId,
      signalCooldown: { gt: 0 },
    },
    data: { signalCooldown: { decrement: 1 } },
  });
}
