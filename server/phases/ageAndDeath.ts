// ============================================================================
// Phase 3: Age and Death
// ============================================================================
// Ages characters and handles death from old age.
//
// Rules (from spec):
// - Each character ages +1 per round
// - If age >= maxAge, character dies (old age)
// - Dead characters are marked alive=false, diedAtRound set
//
// Usage:
//   const deaths = await ageAndDeath(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';

/**
 * Age all characters and check for old age deaths.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG (unused for this phase, kept for interface consistency)
 * @returns Number of characters that died
 */
export async function ageAndDeath(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // Age all living characters
  await prisma.character.updateMany({
    where: {
      worldId,
      alive: true,
    },
    data: {
      age: { increment: 1 },
    },
  });

  // Find characters who have reached their max age
  const elderly = await prisma.character.findMany({
    where: {
      worldId,
      alive: true,
      age: { gte: prisma.character.fields.maxAge }, // age >= maxAge
    },
  });

  if (elderly.length === 0) return 0;

  // Mark them as dead
  await prisma.character.updateMany({
    where: {
      id: { in: elderly.map((c) => c.id) },
    },
    data: {
      alive: false,
      diedAtRound: round,
    },
  });

  // Log death events / 記錄死亡事件
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

  // If any dead character was a king, mark their faction as collapsing
  const deadKings = elderly.filter((c) => c.isKing);

  for (const king of deadKings) {
    if (king.factionId) {
      await prisma.faction.update({
        where: { id: king.factionId },
        data: { collapsing: true },
      });
    }
  }

  return elderly.length;
}
