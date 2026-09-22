// ============================================================================
// 階段 8：忠誠檢查（叛變）
// Phase 8: Loyalty Check (Defection)
// ============================================================================
// 檢查角色是否會從其陣營叛逃。
// Checks if characters will defect from their faction.
//
// 規則（來自規格）/ Rules (from spec):
// - base = ambition × 0.5
// - 若 loyalty != king.loyalty: base × 1.2 / if loyalty != king.loyalty: base × 1.2
// - 若朋友最近叛逃: base × 1.5 / if friend defected recently: base × 1.5
// - base × (1 - king.tong × 0.01)
// - 若 faction.places > 500: base × 0.8 / if faction.places > 500: base × 0.8
// - 若有不滿: base × 1.3 / if has Discontent: base × 1.3
// - 若 rand(100) < base: 叛逃！ / if rand(100) < base: defect!
//   - 若為總督：以該地點建立新勢力 / if admin: create new faction with that place
//   - 否則：加入鄰近勢力或建立新的 / else: join nearby faction or create new one
//
// 使用方式 / Usage:
//   const defections = await loyaltyCheck(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generateFactionName } from '@/lib/nameGenerator/faction';

/**
 * 檢查並處理叛變。
 * Check for defections and process them.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於叛變擲骰的種子 RNG / Seeded RNG for defection rolls
 * @returns 叛變的角色數 / Number of characters that defected
 */
export async function loyaltyCheck(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // 取得所有在勢力中的存活角色 / Get all living characters in factions
  const characters = await prisma.character.findMany({
    where: {
      worldId,
      alive: true,
      factionId: { not: null },
      isKing: false, // 君王不會叛變 / Kings don't defect
    },
    include: {
      faction: {
        select: {
          id: true,
          kingId: true,
          collapsing: true,
        },
      },
    },
  });

  let defectionCount = 0;

  for (const char of characters) {
    if (!char.faction) continue;

    // 計算叛變機率 / Calculate defection probability
    let base = char.ambition * CONFIG.AMBITION_DEFECT_BASE_MULT;

    // 檢查與君王的忠誠差異 / Check loyalty difference from king
    if (char.faction.kingId) {
      const king = await prisma.character.findUnique({
        where: { id: char.faction.kingId },
        select: { loyalty: true, tong: true },
      });

      if (king) {
        if (char.loyalty !== king.loyalty) {
          base *= CONFIG.AMBITION_DIFF_LOYALTY_MULT;
        }

        // 君王統率降低叛變 / King's tong reduces defection
        base *= 1 - CONFIG.AMBITION_KING_TONG_REDUCE * king.tong;
      }
    }

    // 檢查朋友是否最近叛逃 / Check if friend defected recently
    const recentDefection = await prisma.event.findFirst({
      where: {
        worldId,
        type: 'DEFECT',
        round: { gte: round - 5 },
        data: {
          path: ['friendId'],
          equals: char.id,
        },
      },
    });

    if (recentDefection) {
      base *= CONFIG.AMBITION_FRIEND_DEFECT_MULT;
    }

    // 大型勢力降低叛變 / Large faction reduces defection
    const factionCharCount = await prisma.character.count({
      where: {
        factionId: char.factionId!,
        alive: true,
      },
    });

    if (factionCharCount > CONFIG.AMBITION_LARGE_FACTION_THRESHOLD) {
      base *= CONFIG.AMBITION_LARGE_FACTION_MULT;
    }

    // 不滿增加叛變 / Discontent increases defection
    const hasDiscontent = await prisma.discontent.findFirst({
      where: {
        worldId,
        aId: char.id,
      },
    });

    if (hasDiscontent) {
      base *= CONFIG.DISCONTENT_DEFECT_MULT;
    }

    // 叛變擲骰 / Roll for defection
    if (rng.chance(base / 100)) {
      defectionCount++;

      // 決定叛變類型 / Determine defection type
      const isAdministrator = await prisma.place.findFirst({
        where: {
          worldId,
          administratorId: char.id,
        },
      });

      if (isAdministrator) {
        // 總督以其地點建立新勢力 / Admin creates new faction with their place
        const factionName = generateFactionName(rng);
        const color = `hsl(${rng.int(0, 360)}, 70%, 50%)`;

        const newFaction = await prisma.faction.create({
          data: {
            worldId,
            name: factionName,
            color,
            createdAtRound: round,
            kingId: char.id,
          },
        });

        // 將地點轉移給新勢力 / Transfer the place to new faction
        await prisma.place.update({
          where: { id: isAdministrator.id },
          data: { factionId: newFaction.id },
        });

        // 更新角色 / Update character
        await prisma.character.update({
          where: { id: char.id },
          data: {
            factionId: newFaction.id,
            isKing: true,
            ambition: rng.int(
              CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MIN,
              CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MAX
            ),
          },
        });

        // 記錄叛變事件 / Log defection event
        await prisma.event.create({
          data: {
            worldId,
            round,
            type: 'DEFECTION',
            data: {
              charId: char.id,
              charName: char.name,
              oldFactionId: char.factionId,
              newFactionId: newFaction.id,
              newFactionName: factionName,
              placeId: isAdministrator.id,
              placeName: isAdministrator.name,
              reason: 'admin_defection',
            },
          },
        });
      } else {
        // 加入鄰近勢力或建立新的 / Join nearby faction or create new one
        // 尋找相鄰地點 / Find adjacent places
        const adjacentPlaces = await prisma.road.findMany({
          where: {
            worldId,
            OR: [
              { aId: char.placeId },
              { bId: char.placeId },
            ],
          },
          include: {
            placeA: { select: { factionId: true, name: true } },
            placeB: { select: { factionId: true, name: true } },
          },
        });

        // 尋找可加入的鄰近勢力 / Find a nearby faction to join
        let joinedFaction = false;
        for (const road of adjacentPlaces) {
          const nearbyFactionId =
            road.aId === char.placeId
              ? road.placeA.factionId
              : road.placeB.factionId;

          if (
            nearbyFactionId &&
            nearbyFactionId !== char.factionId &&
            !adjacentPlaces.some(
              (r: { placeA: { factionId: string | null }; placeB: { factionId: string | null } }) =>
                (r.placeA.factionId === nearbyFactionId ||
                  r.placeB.factionId === nearbyFactionId) &&
                r !== road
            )
          ) {
            // 加入此勢力 / Join this faction
            await prisma.character.update({
              where: { id: char.id },
              data: {
                factionId: nearbyFactionId,
                ambition: rng.int(
                  CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MIN,
                  CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MAX
                ),
              },
            });

            // 記錄叛變事件 / Log defection event
            await prisma.event.create({
              data: {
                worldId,
                round,
                type: 'DEFECTION',
                data: {
                  charId: char.id,
                  charName: char.name,
                  oldFactionId: char.factionId,
                  newFactionId: nearbyFactionId,
                  placeId: char.placeId,
                  reason: 'joined_nearby',
                },
              },
            });

            joinedFaction = true;
            break;
          }
        }

        // 若無法加入鄰近勢力，則建立新的 / If couldn't join nearby, create new faction
        if (!joinedFaction) {
          const factionName = generateFactionName(rng);
          const color = `hsl(${rng.int(0, 360)}, 70%, 50%)`;

          const newFaction = await prisma.faction.create({
            data: {
              worldId,
              name: factionName,
              color,
              createdAtRound: round,
              kingId: char.id,
            },
          });

          await prisma.character.update({
            where: { id: char.id },
            data: {
              factionId: newFaction.id,
              isKing: true,
              ambition: rng.int(
                CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MIN,
                CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MAX
              ),
            },
          });

          // 記錄叛變事件 / Log defection event
          await prisma.event.create({
            data: {
              worldId,
              round,
              type: 'DEFECTION',
              data: {
                charId: char.id,
                charName: char.name,
                oldFactionId: char.factionId,
                newFactionId: newFaction.id,
                newFactionName: factionName,
                placeId: char.placeId,
                reason: 'created_new_faction',
              },
            },
          });
        }
      }
    }
  }

  return defectionCount;
}
