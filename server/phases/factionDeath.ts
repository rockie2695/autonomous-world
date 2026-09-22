// ============================================================================
// 階段 14：勢力消滅
// Phase 14: Faction Death
// ============================================================================
// 檢查勢力是否應標記為死亡。
// Checks if factions should be marked as dead.
//
// 規則（來自規格）/ Rules (from spec):
// - 若勢力有 0 地點且 0 角色 → alive = false / If faction has 0 places AND 0 characters → alive = false
// - 死亡勢力將從遊戲中移除 / Dead factions are removed from the game
//
// 使用方式 / Usage:
//   await factionDeath(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';

/**
 * 檢查勢力消滅（0 地點、0 角色）。
 * Check for faction death (0 places, 0 characters).
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（本階段未使用）/ Seeded RNG (unused for this phase)
 */
export async function factionDeath(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 找出所有存活勢力 / Find all alive factions
  const factions = await prisma.faction.findMany({
    where: {
      worldId,
      alive: true,
    },
  });

  for (const faction of factions) {
    // 統計地點與角色數 / Count places and characters
    const [placeCount, charCount] = await Promise.all([
      prisma.place.count({
        where: { factionId: faction.id },
      }),
      prisma.character.count({
        where: { factionId: faction.id, alive: true },
      }),
    ]);

    // 若兩者皆為零，勢力死亡 / If both are zero, faction is dead
    if (placeCount === 0 && charCount === 0) {
      await prisma.faction.update({
        where: { id: faction.id },
        data: {
          alive: false,
          endedAtRound: round,
        },
      });

      // 記錄勢力消滅事件 / Log faction death event
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'FACTION_ELIMINATED',
          data: {
            factionId: faction.id,
            factionName: faction.name,
          },
        },
      });
    }
  }
}
