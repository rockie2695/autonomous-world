// ============================================================================
// 階段 7：野心事件
// Phase 7: Ambition Events
// ============================================================================
// 依遊戲事件處理野心變化。
// Processes ambition changes based on game events.
//
// 規則（來自規格）/ Rules (from spec):
// - 20 回合未升遷 → 野性 +0.5 / 20 rounds without promotion → ambition +0.5
// - 朋友叛逃 → 野心 +2 / Friend defects → ambition +2
// - 君王統率高 → 野心 -0.5 × (king.tong / 30) / King tong high → ambition -0.5 × (king.tong / 30)
// - 行政官暫時減免到期 → 仍在職則 +AMBITION_ADMIN_ASSIGNED_DELTA 回復 /
//   Expired temporary administrator reduction reverts (+AMBITION_ADMIN_ASSIGNED_DELTA)
//
// 使用方式 / Usage:
//   await ambitionEvents(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 處理所有角色的野心事件。
 * Process ambition events for all characters.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（本階段未使用）/ Seeded RNG (unused for this phase)
 */
export async function ambitionEvents(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // ── 行政官暫時減免到期 / Expired temporary administrator ambition reduction ──
  // 取得行政官職務時會暫時 -AMBITION_ADMIN_ASSIGNED_DELTA，若在
  // AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS 回合後仍在職就回復；已被免職者
  // 免職時已 +AMBITION_ADMIN_REPLACED_DELTA 且欄位已清空（不會出現在此查詢），
  // 死亡者不回復，只清掉欄位 /
  // Granting the post temporarily -AMBITION_ADMIN_ASSIGNED_DELTA; the reduction
  // reverts after AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS if the character is
  // still in office. Removed characters already gained
  // +AMBITION_ADMIN_REPLACED_DELTA (field cleared), dead ones just get the field
  // cleared without a revert.
  const expiring = await prisma.character.findMany({
    where: { worldId, adminAmbitionRevertRound: { lte: round } },
    select: {
      id: true,
      name: true,
      ambition: true,
      alive: true,
      administered: { select: { id: true, name: true } },
    },
  });

  for (const char of expiring) {
    if (char.alive && char.administered !== null) {
      const newAmbition = Math.min(
        CONFIG.CHAR_AMBITION_MAX,
        char.ambition + CONFIG.AMBITION_ADMIN_ASSIGNED_DELTA
      );
      const appliedDelta = newAmbition - char.ambition;

      if (appliedDelta !== 0) {
        await prisma.character.update({
          where: { id: char.id },
          data: { ambition: newAmbition },
        });
        await prisma.ambitionEvent.create({
          data: {
            worldId,
            charId: char.id,
            round,
            delta: appliedDelta,
            reason: `Temporary administrator ambition reduction expired after ${CONFIG.AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS} rounds`,
          },
        });
        // 記錄可見事件，讓玩家看得到「暫時減免」已到期 / Log a visible Event so
        // players can see the temporary reduction expire
        await prisma.event.create({
          data: {
            worldId,
            round,
            type: 'AMBITION_RECOVERED',
            data: {
              charId: char.id,
              charName: char.name,
              placeId: char.administered.id,
              placeName: char.administered.name,
              ambitionDelta: appliedDelta,
            },
          },
        });
      }
    }

    await prisma.character.update({
      where: { id: char.id },
      data: { adminAmbitionRevertRound: null },
    });
  }

  // 取得所有存活角色 / Get all living characters
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

    // 檢查是否久未升遷（20+ 回合）/ Check for lack of promotion (20+ rounds)
    const roundsSincePromotion = char.lastPromotedRound
      ? round - char.lastPromotedRound
      : round; // 從未升遷 / Never promoted

    if (roundsSincePromotion >= CONFIG.AMBITION_NO_PROMOTION_ROUNDS) {
      delta += CONFIG.AMBITION_NO_PROMOTION_DELTA;
      reason += `No promotion for ${roundsSincePromotion} rounds; `;
    }

    // 檢查朋友是否最近叛逃 / Check if friend recently defected
    // TODO: 需檢查最近的叛逃事件 / This requires checking recent defection events
    // 目前略過此檢查 / For now, skip this check

    // 檢查君王統率（降低野心）/ Check king's tong (reduces ambition)
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

    // 若有變化則套用 / Apply delta if any
    if (delta !== 0) {
      const newAmbition = Math.max(
        CONFIG.CHAR_AMBITION_MIN,
        Math.min(CONFIG.CHAR_AMBITION_MAX, char.ambition + delta)
      );

      await prisma.character.update({
        where: { id: char.id },
        data: { ambition: newAmbition },
      });

      // 記錄事件 / Log the event
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
