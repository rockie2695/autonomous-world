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
// - (君王的 tong 過去會降低叛變機率，該規則已移除：統領現在只影響購兵量) /
    // (A king's tong used to suppress defection. Removed: leadership now only affects
    // how many troops a leader can buy.)
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
import { defectionValue, defectionChance } from '@/lib/defection';
import { uniqueAliveFactionName, uniqueAliveKingName } from '../uniqueNames';

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
          // 原勢力的名字：事件日誌要寫「離開了哪個勢力」，只有 id 讀不出來 /
          // The old faction's name: the log says *which* faction was left, and an id says nothing
          name: true,
        },
      },
      place: {
        // 所在地：同樣為了讓事件能寫出「在哪裡」/ For the same reason: "at which place"
        select: { name: true },
      },
    },
  });

  // AmbitionEvents for THIS round, batched once and their deltas summed per character.
  //
  // One query for the whole round rather than one per character: this loop already runs
  // per living leader, and at a few hundred characters that difference is the whole cost of
  // the phase. The deltas are summed, not counted -- each event carries its own magnitude.
  const eventsThisRound = await prisma.ambitionEvent.findMany({
    where: { worldId, round },
    select: { charId: true, delta: true },
  });
  const deltaPerChar = new Map<string, number>();
  for (const ev of eventsThisRound) {
    deltaPerChar.set(ev.charId, (deltaPerChar.get(ev.charId) ?? 0) + ev.delta);
  }

  let defectionCount = 0;

  for (const char of characters) {
    if (!char.faction) continue;

        // Defection is a computed value, not a stored one. See src/lib/defection.ts.
        //
        // The old chain multiplied: ambition x 0.5, then loyalty x1.2, friend-defection
        // x1.5, large faction x0.8, discontent x1.3. Multipliers compound, so no single
        // factor could be read off on its own, and "friend defected x1.5" doubled the
        // *probability* rather than the *risk*. Everything now adds to the value instead.
        //
        // Note the king lookup is by id and does not need the faction: loyalty only matters
        // as "same tag as the king", and a character with no king has nothing to mismatch.
        let loyaltyMismatch = false;
        if (char.faction.kingId) {
          const king = await prisma.character.findUnique({
            where: { id: char.faction.kingId },
            select: { loyalty: true },
          });
          loyaltyMismatch = king !== null && char.loyalty !== king.loyalty;
        }

        const value = defectionValue({
          ambition: char.ambition,
          loyaltyMismatch,
          eventDeltaSum: deltaPerChar.get(char.id) ?? 0,
        });
        const chance = defectionChance(value);

        // chance is already a 0..1 probability, so no /100 here. A value at or below the
        // midpoint yields exactly 0, which is the "below average, no defection" case.
        if (chance > 0 && rng.chance(chance)) {
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
        const factionName = await uniqueAliveFactionName(worldId, rng);
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

        // 更新角色（新君王名字須在存活君王中唯一）/ Update character (the new
        // king's name must be unique among alive kings)
        const kingName = await uniqueAliveKingName(
          worldId,
          char.id,
          char.name,
          rng
        );
        await prisma.character.update({
          where: { id: char.id },
          data: {
            factionId: newFaction.id,
            isKing: true,
            name: kingName,
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
              charName: kingName,
              oldFactionId: char.factionId,
              oldFactionName: char.faction.name,
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

          // 目標勢力的名字：道路只帶 factionId，所以名字要另外查一次 /
          // The target faction's name: roads only carry factionId, so this costs one lookup
          const nearbyFactionName = nearbyFactionId

            ? (

              await prisma.faction.findUnique({

                where: { id: nearbyFactionId },

                select: { name: true },

              })

            )?.name ?? null

            : null;

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
                  oldFactionName: char.faction.name,
                  newFactionId: nearbyFactionId,
                  // joined_nearby 原本連勢力名都沒存，日誌只能說「叛離了原勢力」/
                  // joined_nearby stored not even the faction's name, so the row could only say "defected"
                  newFactionName: nearbyFactionName,
                  placeId: char.placeId,
                  placeName: char.place.name,
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
          const factionName = await uniqueAliveFactionName(worldId, rng);
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

          // 新君王名字須在存活君王中唯一 / King name must be unique among
          // alive kings
          const kingName = await uniqueAliveKingName(
            worldId,
            char.id,
            char.name,
            rng
          );
          await prisma.character.update({
            where: { id: char.id },
            data: {
              factionId: newFaction.id,
              isKing: true,
              name: kingName,
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
                charName: kingName,
                oldFactionId: char.factionId,
                oldFactionName: char.faction.name,
                newFactionId: newFaction.id,
                newFactionName: factionName,
                placeId: char.placeId,
                placeName: char.place.name,
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
