// ============================================================================
// 階段 8：忠誠檢查（叛變）
// Phase 8: Loyalty Check (Defection)
// ============================================================================
// 檢查角色是否會從其陣營叛逃。
// Checks if characters will defect from their faction.
//
// 規則（來自規格）/ Rules (from spec):
//
// **全部是加項，沒有乘數。** 舊版的乘算鏈（`defectionBase × 0.5`、忠誠 `× 1.2`、
// 朋友叛逃 `× 1.5`、大勢力 `× 0.8`、不滿 `× 1.3`）已經移除：乘數會疊乘，沒有任何單一
// 因子能被單獨讀出來，而且「朋友叛逃 × 1.5」乘的是**機率**而不是**風險**。
//
// **Everything is an addend; there are no multipliers.** The old multiplicative chain
// (`defectionBase × 0.5`, loyalty `× 1.2`, friend-defection `× 1.5`, large faction `× 0.8`,
// discontent `× 1.3`) is retired: multipliers compound, so no single factor could be read off
// on its own, and "friend defected × 1.5" doubled the *probability* rather than the *risk*.
//
//     value  = defectionBase
//            + (忠誠標籤與君王不同 ? DEFECTION_VALUE_LOYALTY_PENALTY(2) : 0)
//            + 本回合此人的 DefectionEvent **delta 總和**
//
//     chance = (value − DEFECTION_MIDPOINT(17.5)) / 17.5 × DEFECTION_BASE_RATE(0.05)
//
// 忠誠標籤是**唯一**寫死的加項：它是標籤比較，不會產生 `DefectionEvent`，所以沒有
// delta 可加。其餘全部來自資料庫裡的真實 delta。
//
// The loyalty tag is the **only** hardcoded addend: it is a tag comparison that never
// produces a `DefectionEvent`, so there is no delta to read. Everything else comes from real
// deltas in the database.
//
// 低於中點時機率為 **0**（不是負數）：「低於平均就不叛變」正是這條規則想說的話。
// Below the midpoint the chance is exactly **0**, not negative: "below average, no
// defection" is exactly what the rule is saying.
//
// - 若擲中：叛逃！ / on a hit: defect!
//   - 若為總督：以該地點建立新勢力 / if admin: create new faction with that place
//   - 否則：加入鄰近勢力或建立新的 / else: join nearby faction or create new one
//   - 叛變會寫入 `DEFECTION` 事件與一筆帳本，後者正是上面的 delta 來源 / a defection
//     writes a `DEFECTION` event and a ledger row, and that ledger row is the delta above
//   - 若為總督：以該地點建立新勢力 / if admin: create new faction with that place
//   - 否則：加入鄰近勢力或建立新的 / else: join nearby faction or create new one
//
// 使用方式 / Usage:
//   const defections = await loyaltyCheck(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
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

  // DefectionEvents for THIS round, batched once and their deltas summed per character.
  //
  // One query for the whole round rather than one per character: this loop already runs
  // per living leader, and at a few hundred characters that difference is the whole cost of
  // the phase. The deltas are summed, not counted -- each event carries its own magnitude.
  const eventsThisRound = await prisma.defectionEvent.findMany({
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
        // The old chain multiplied: defectionBase x 0.5, then loyalty x1.2, friend-defection
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
          defectionBase: char.defectionBase,
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
            // 野心是**固定的初始值**，叛變與建國都不重骰它。叛變之後的冷卻是
            // defectionEvents 往帳本寫一筆負的 delta，而不是改寫這個值。
            //
            // The defection base is a **fixed initial stat** and is re-rolled by neither
            // defecting nor founding a faction. The cooling after a defection is a
            // negative delta in the ledger, not a rewrite of this value.
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
                // 加入別人的勢力同樣不動野心 /
                // Joining someone else's faction does not touch defectionBase either
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
              // 野心是**固定的初始值**，叛變與建國都不重骰它。叛變之後的冷卻是
              // defectionEvents 往帳本寫一筆負的 delta，而不是改寫這個值。
              //
              // The defection base is a **fixed initial stat** and is re-rolled by neither
              // defecting nor founding a faction. The cooling after a defection is a
              // negative delta in the ledger, not a rewrite of this value.
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
