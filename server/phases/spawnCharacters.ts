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
//   const spawnedIds = await spawnCharacters(worldId, round, rng);
//   // spawnedIds: 本回合新生成的角色 ID（用來讓它們本回合不移動）
//   // spawnedIds: IDs spawned this round (used to keep them from moving in their spawn round)
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generatePersonName } from '@/lib/nameGenerator/person';

/**
 * 在隨機地點生成新角色，並由該地點所屬勢力的君王決定是否指派其為行政官。
 * Spawn new characters at random places; the faction's king then decides
 * whether to assign them as administrator of the spawn place.
 *
 * 行政官規則 / Administrator rules:
 * - 出生地無行政官 → 直接指派 / Spawn place vacant → assign directly
 * - 現任行政官是國王 → 保留席位 / Current admin is the king → king keeps seat
 * - 否則比較總能力（wu+tong+jing），嚴格勝出才取代；
 *   被免職者野心 +CONFIG.AMBITION_ADMIN_REPLACED_DELTA，記錄事件 + AmbitionEvent
 * - Otherwise compare total ability (wu+tong+jing); strictly greater wins.
 *   The removed admin gains CONFIG.AMBITION_ADMIN_REPLACED_DELTA ambition,
 *   logged as an Event + an AmbitionEvent.
 *
 * @param worldId - 要加入角色的世界 ID / The world to add characters to
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於可重現性的種子 RNG / Seeded RNG for reproducibility
 * @returns 本回合生成的角色 ID 陣營 / IDs of characters spawned this round
 */
export async function spawnCharacters(
  worldId: string,
  round: number,
  rng: Rng
): Promise<string[]> {
  // 取得世界中所有「有陣營」的地點——僅勢力控制地能生成角色 /
  // Get all faction-controlled places — only owned places can spawn characters
  const places = await prisma.place.findMany({
    where: { worldId, factionId: { not: null } },
    select: { id: true, name: true, factionId: true, administratorId: true },
  });

  if (places.length === 0) return [];

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

  const spawnedIds: string[] = [];

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

    // 建立角色（加入該地點所屬勢力）/
    // Create the character (joins the place's faction)
    const created = await prisma.character.create({
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
        factionId: place.factionId,
        troops: 0,
        gold: 0,
        alive: true,
        isKing: false,
      },
      select: { id: true },
    });

    // 記錄生成事件 / Log the spawn event
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

    // ── 君王指派行政官 / King assigns administrator ─────────────────────────
    // 規則 / Rules:
    // 1. 出生地無行政官 → 直接指派（涵蓋「勢力尚無任何行政官」的情況）
    //    Spawn place vacant → assign directly (also covers "faction has no admin yet")
    // 2. 現任行政官是國王本人 → 保留席位 / Current admin is the king → king keeps seat
    // 3. 否則比較總能力（wu+tong+jing），新將領嚴格勝出才取代；
    //    被免職者野心 +1（配置），記錄 ADMIN_REMOVED 事件 + AmbitionEvent
    // 4. 否則不動 / Otherwise no change
    if (place.administratorId === null) {
      await prisma.place.update({
        where: { id: place.id },
        data: { administratorId: created.id },
      });
      await prisma.character.update({
        where: { id: created.id },
        data: { lastPromotedRound: round },
      });
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'ADMIN_ASSIGNED',
          data: {
            charId: created.id,
            charName: name,
            placeId: place.id,
            placeName: place.name,
          },
        },
      });
    } else {
      const currentAdmin = await prisma.character.findUnique({
        where: { id: place.administratorId },
        select: { id: true, name: true, wu: true, tong: true, jing: true, isKing: true, ambition: true, alive: true },
      });

      // 國王保留席位；（已死亡的行政官無法保有職位 → 視為空缺）/
      // King keeps the seat; a dead admin cannot hold office → treated as vacant
      const kingKeepsSeat = currentAdmin !== null && currentAdmin.isKing && currentAdmin.alive;
      const seatVacant = currentAdmin === null || !currentAdmin.alive;

      if (kingKeepsSeat) {
        // 國王保留席位，不動 / King keeps seat, no change
      } else if (seatVacant) {
        await prisma.place.update({
          where: { id: place.id },
          data: { administratorId: created.id },
        });
        await prisma.character.update({
          where: { id: created.id },
          data: { lastPromotedRound: round },
        });
        await prisma.event.create({
          data: {
            worldId,
            round,
            type: 'ADMIN_ASSIGNED',
            data: {
              charId: created.id,
              charName: name,
              placeId: place.id,
              placeName: place.name,
            },
          },
        });
      } else if (currentAdmin !== null) {
        const newTotal = wu + tong + jing;
        const oldTotal = currentAdmin.wu + currentAdmin.tong + currentAdmin.jing;

        if (newTotal > oldTotal) {
          // 取代現任行政官 / Replace the current administrator
          await prisma.place.update({
            where: { id: place.id },
            data: { administratorId: created.id },
          });
          await prisma.character.update({
            where: { id: created.id },
            data: { lastPromotedRound: round },
          });

          // 被免職者野心上升（+配置值，套用上限）/
          // Removed admin's ambition rises (+config value, clamped to max)
          const ambitionDelta = CONFIG.AMBITION_ADMIN_REPLACED_DELTA;
          const newAmbition = Math.min(
            CONFIG.CHAR_AMBITION_MAX,
            currentAdmin.ambition + ambitionDelta
          );
          const appliedDelta = newAmbition - currentAdmin.ambition;
          await prisma.character.update({
            where: { id: currentAdmin.id },
            data: { ambition: newAmbition },
          });

          // 記錄免職事件 + 野心事件 / Log removal event + ambition event
          await prisma.event.create({
            data: {
              worldId,
              round,
              type: 'ADMIN_REMOVED',
              data: {
                charId: currentAdmin.id,
                charName: currentAdmin.name,
                placeId: place.id,
                placeName: place.name,
                newAdminId: created.id,
                newAdminName: name,
                oldTotal,
                newTotal,
              },
            },
          });
          await prisma.ambitionEvent.create({
            data: {
              worldId,
              charId: currentAdmin.id,
              round,
              delta: appliedDelta,
              reason: `Removed as administrator of ${place.name} by ${name}`,
            },
          });
        }
      }
    }

    spawnedIds.push(created.id);
  }

  return spawnedIds;
}
