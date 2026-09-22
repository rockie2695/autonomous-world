// ============================================================================
// 階段 2：生成角色
// Phase 2: Spawn Characters
// ============================================================================
// 每回合在各地點生成新角色。
// Generates new characters at places each round.
//
// 規則（來自規格）/ Rules (from spec):
// - 每個地點有機率生成角色 / Each place has a chance to spawn a character
// - 生成率隨世界成長而下降：100 地點時 5% → 2000 地點時 1% / Spawn rate decreases as world grows: 5% at 100 places → 1% at 2000 places
// - 屬性：wu/tong/jing 均勻 5-30，速度常態 μ=17 σ=5（截斷 5-30）/ Stats: wu/tong/jing uniform 5-30, speed normal μ=17 σ=5 (clamped 5-30)
// - 野心：常態分佈 μ=17 σ=5（截斷 5-30）/ Ambition: normal distribution μ=17 σ=5 (clamped 5-30)
// - 年齡：起始 20，maxAge 隨機 50-80 / Age: starts at 20, maxAge random 50-80
// - 忠誠：隨機取自 SELF/PATH/ALTRUISM / Loyalty: random from SELF/PATH/ALTRUISM
//
// 使用方式 / Usage:
//   const spawned = await spawnCharacters(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generatePersonName } from '@/lib/nameGenerator/person';

/**
 * 在隨機地點生成新角色。
 * Spawn new characters at random places.
 *
 * @param worldId - 要加入角色的世界 ID / The world to add characters to
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於可重現性的種子 RNG / Seeded RNG for reproducibility
 * @returns 生成的角色數 / Number of characters spawned
 */
export async function spawnCharacters(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // 取得世界中所有地點 / Get all places in the world
  const places = await prisma.place.findMany({
    where: { worldId },
    select: { id: true },
  });

  if (places.length === 0) return 0;

  // 依世界進度計算生成率 / Calculate spawn rate based on world progress
  // 從起始率到結束率線性插值 / Linear interpolation from START to END rate
  const progress = Math.min(
    1,
    (places.length - 100) / (CONFIG.PLACE_MAX_COUNT - 100)
  );
  const spawnRate =
    CONFIG.CHAR_SPAWN_RATE_START -
    progress *
      (CONFIG.CHAR_SPAWN_RATE_START - CONFIG.CHAR_SPAWN_RATE_END);

  let spawned = 0;

  for (const place of places) {
    // 此地點的隨機生成機會 / Random chance to spawn at this place
    if (!rng.chance(spawnRate)) continue;

    // 生成角色屬性 / Generate character stats
    const name = generatePersonName(rng);
    const wu = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
    const tong = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
    const jing = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
    const speed = rng.gaussian(
      CONFIG.CHAR_SPEED_MEAN,
      CONFIG.CHAR_SPEED_SIGMA,
      CONFIG.CHAR_SPEED_MIN,
      CONFIG.CHAR_SPEED_MAX
    );
    const ambition = rng.gaussian(
      CONFIG.CHAR_AMBITION_MEAN,
      CONFIG.CHAR_AMBITION_SIGMA,
      CONFIG.CHAR_AMBITION_MIN,
      CONFIG.CHAR_AMBITION_MAX
    );
    const maxAge = rng.int(CONFIG.CHAR_MAX_AGE_MIN, CONFIG.CHAR_MAX_AGE_MAX);

    // 隨機忠誠標籤（不直接影響玩法）/ Random loyalty tag (doesn't affect gameplay directly)
    const loyaltyOptions = ['SELF', 'PATH', 'ALTRUISM'] as const;
    const loyalty = rng.pick([...loyaltyOptions]) ?? 'SELF';

    // 建立角色 / Create the character
    await prisma.character.create({
      data: {
        worldId,
        name,
        wu,
        tong,
        jing,
        speed,
        loyalty,
        ambition,
        age: CONFIG.CHAR_START_AGE,
        maxAge,
        placeId: place.id,
        troops: 0,
        gold: 0,
        alive: true,
        isKing: false,
      },
    });

    // 記錄事件 / Log the event
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'CHARACTER_SPAWNED',
        data: {
          charName: name,
          placeId: place.id,
        },
      },
    });

    spawned++;
  }

  return spawned;
}
