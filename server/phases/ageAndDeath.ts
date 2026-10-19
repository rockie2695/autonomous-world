// ============================================================================
// 階段 3：老化與死亡
// Phase 3: Age and Death
// ============================================================================
// 角色老化並處理自然死亡。
// Ages characters and handles death from old age.
//
// 規則（來自規格）/ Rules (from spec):
// - 每個角色每回合年齡 +1 / Each character ages +1 per round
// - 若年齡 >= maxAge，角色死亡（自然死亡）/ If age >= maxAge, character dies (old age)
// - 死亡角色標記 alive=false，並設定 diedAtRound / Dead characters are marked alive=false, diedAtRound set
//
// 使用方式 / Usage:
//   const deaths = await ageAndDeath(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';
import { processDeadLeaders } from '../afterDeath';

/**
 * 使所有角色老化並檢查自然死亡。
 * Age all characters and check for old age deaths.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（本階段未使用，保留以維持介面一致）/ Seeded RNG (unused for this phase, kept for interface consistency)
 * @returns 死亡的角色數 / Number of characters that died
 */
export async function ageAndDeath(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // 所有存活角色老化 / Age all living characters
  await prisma.character.updateMany({
    where: {
      worldId,
      alive: true,
    },
    data: {
      age: { increment: 1 },
    },
  });

  // 找出已達最高年齡的角色 / Find characters who have reached their max age
  const elderly = await prisma.character.findMany({
    where: {
      worldId,
      alive: true,
      age: { gte: prisma.character.fields.maxAge }, // age >= maxAge
    },
  });

  if (elderly.length === 0) return 0;

  // 標記為死亡 / Mark them as dead
  await prisma.character.updateMany({
    where: {
      id: { in: elderly.map((c) => c.id) },
    },
    data: {
      alive: false,
      diedAtRound: round,
    },
  });

  // 記錄死亡事件 / Log death events
  for (const char of elderly) {
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'DEATH',
        data: {
          charId: char.id,
          charName: char.name,
          reason: 'old_age',
          age: char.age,
        },
      },
    });
  }

  // 若死亡者為君王，處理王位繼承；行政官席位清空也在同一個善後模組裡。
  // 自然死亡與戰死**必須**走同一條善後路（`server/afterDeath.ts`）——以前君王邏輯
  // 在這裡 inline、行政官席位根本沒人清（死人佔著席位領分成），兩種死法各自為政。
  // If any dead character was a king, run the succession; the administrator seats the
  // dead held are cleared in the same aftermath module. Natural death and battle death
  // **must** share one aftermath path (`server/afterDeath.ts`) — the king logic used to
  // live inline here and nothing at all cleared administrator seats (a corpse held the
  // seat and kept collecting its share), so the two kinds of death drifted.
  await processDeadLeaders(
    worldId,
    round,
    elderly.map((c) => ({
      id: c.id,
      name: c.name,
      factionId: c.factionId,
      isKing: c.isKing,
    }))
  );

  return elderly.length;
}
