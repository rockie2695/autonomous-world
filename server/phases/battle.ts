// ============================================================================
// 階段 10：戰鬥
// Phase 10: Battle
// ============================================================================
// 角色抵達敵方領地時解決戰鬥。
// Resolves battles when characters arrive at enemy territories.
//
// 規則（來自規格）/ Rules (from spec):
// - 攻擊者抵達地點，與守軍交戰 / Attackers arrive at place, fight defenders
// - 攻擊順序：速度降序（v1.1）/ Attack order: speed descending (v1.1)
// - 若多名攻擊者，後到者與新擁有者交戰 / If multiple attackers, later ones fight the new owner
// - atk = troops × (1 + wu/30) × rand(0.85, 1.15)
// - def = troops × (1 + tong/30) × (1 + fortress×0.2) × rand(0.85, 1.15)
// - 敗者：依速度差逃跑 / Loser: escape based on speed difference
//   - escape = clamp(0.5 + speedDiff × 0.02, 0.1, 0.9)
//   - 若逃跑失敗 → 死亡 / If escape fails → death
// - 勝者：troops ×= 0.9（疲勞）/ Winner: troops ×= 0.9 (fatigue)
// - 若守軍全滅：地點易主 / If all defenders dead: place changes owner
//
// 使用方式 / Usage:
//   const battles = await battle(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 解決所有交戰地點的戰鬥。
 * Resolve battles at all contested places.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於戰鬥計算的種子 RNG / Seeded RNG for battle calculations
 * @returns 進行的戰鬥數 / Number of battles fought
 */
export async function battle(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // 找出同時有我方與敵方角色的地點 / Find all places with both friendly and enemy characters
  const places = await prisma.place.findMany({
    where: { worldId, factionId: { not: null } },
    include: {
      characters: {
        where: { alive: true },
        select: { id: true, factionId: true, wu: true, tong: true, speed: true, troops: true, name: true },
      },
    },
  });

  // 取得所有道路以進行逃跑路徑尋找 / Get all roads for escape pathfinding
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // 建立逃跑移動用的鄰接表 / Build adjacency map for escape movement
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }

  // 取得所有地點及陣營資訊以決定逃跑目的地 / Get all places with faction info for escape destination
  const allPlaces = await prisma.place.findMany({
    where: { worldId },
    select: { id: true, factionId: true },
  });
  const placeFactionMap = new Map<string, string | null>();
  for (const p of allPlaces) {
    placeFactionMap.set(p.id, p.factionId);
  }

  let battleCount = 0;

  for (const place of places) {
    if (!place.factionId) continue;

    // 分離守軍（同陣營）與攻擊者（不同陣營）/ Separate defenders (same faction) from attackers (different faction)
    const defenders = place.characters.filter(
      (c) => c.factionId === place.factionId
    );
    const attackers = place.characters.filter(
      (c) => c.factionId !== place.factionId
    );

    if (attackers.length === 0 || defenders.length === 0) continue;

    // 攻擊者依速度降序排序（v1.1）/ Sort attackers by speed descending (v1.1)
    const sortedAttackers = attackers.sort((a, b) => b.speed - a.speed);

    for (const attacker of sortedAttackers) {
      if (attacker.troops <= 0) continue;

      // 逐一與守軍交戰 / Fight defenders one by one
      let currentDefenders = [...defenders];

      while (currentDefenders.length > 0 && attacker.troops > 0) {
        // 挑選守軍：優先總督，再取兵力最高 / Pick defender: priority to admin, then highest troops
        const defender =
          currentDefenders.find(
            (d) => place.administratorId === d.id
          ) ?? currentDefenders.sort((a, b) => b.troops - a.troops)[0];

        if (!defender) break;

        // 計算攻擊力 / Calculate attack power
        const atkRandom = rng.float(
          CONFIG.BATTLE_RANDOM_MIN,
          CONFIG.BATTLE_RANDOM_MAX
        );
        const atk =
          attacker.troops *
          (1 + attacker.wu * CONFIG.BATTLE_ATK_WU_MULT) *
          atkRandom;

        // 計算防禦力 / Calculate defense power
        const defRandom = rng.float(
          CONFIG.BATTLE_RANDOM_MIN,
          CONFIG.BATTLE_RANDOM_MAX
        );
        const def =
          defender.troops *
          (1 + defender.tong * CONFIG.BATTLE_DEF_TONG_MULT) *
          (1 + place.fortress * CONFIG.BATTLE_FORTRESS_DEF_MULT) *
          defRandom;

        if (atk > def) {
          // 攻擊者獲勝 / Attacker wins
          battleCount++;

          // 守軍嘗試逃跑 / Defender tries to escape
          const speedDiff = defender.speed - attacker.speed;
          const escapeChance = Math.max(
            CONFIG.SPEED_ESCAPE_MIN,
            Math.min(
              CONFIG.SPEED_ESCAPE_MAX,
              CONFIG.SPEED_ESCAPE_BASE + speedDiff * CONFIG.SPEED_ESCAPE_PER_DIFF
            )
          );

          if (rng.chance(escapeChance)) {
            // 逃跑成功 — 移至附近友方地點 / Escape successful — move to nearby friendly place
            const neighbors = adjacent.get(place.id) ?? [];
            const currentFaction = defender.factionId;

            // 尋找友方地點（同陣營或無主）/ Find friendly place (same faction or unowned)
            let escapePlaceId: string | null = null;
            for (const neighbor of neighbors) {
              const neighborFaction = placeFactionMap.get(neighbor);
              if (neighborFaction === currentFaction || neighborFaction === null) {
                escapePlaceId = neighbor;
                break;
              }
            }

            // 若無友方地點，留在原地（損失兵力）/ If no friendly place, just stay at current place (lose troops)
            if (escapePlaceId) {
              await prisma.character.update({
                where: { id: defender.id },
                data: { troops: 0, placeId: escapePlaceId },
              });
            } else {
              await prisma.character.update({
                where: { id: defender.id },
                data: { troops: 0 },
              });
            }

            // 記錄逃跑事件 / Log escape event
            await prisma.event.create({
              data: {
                worldId,
                round,
                type: 'ESCAPE_SUCCESS',
                data: {
                  charId: defender.id,
                  charName: defender.name,
                  placeId: place.id,
                  placeName: place.name,
                  speedDiff,
                },
              },
            });
          } else {
            // 逃跑失敗 — 死亡 / Escape failed — death
            await prisma.character.update({
              where: { id: defender.id },
              data: {
                alive: false,
                diedAtRound: round,
              },
            });

            // 記錄死亡事件 / Log death event
            await prisma.event.create({
              data: {
                worldId,
                round,
                type: 'BATTLE_DEATH',
                data: {
                  charId: defender.id,
                  charName: defender.name,
                  placeId: place.id,
                  placeName: place.name,
                  attackerId: attacker.id,
                  attackerName: attacker.name,
                },
              },
            });
          }

          // 從當前名單移除守軍 / Remove defender from current list
          currentDefenders = currentDefenders.filter(
            (d) => d.id !== defender.id
          );

          // 攻擊者損失兵力（疲勞）/ Attacker loses troops (fatigue)
          attacker.troops = Math.floor(
            attacker.troops * CONFIG.CHAR_FATIGUE_PER_WIN
          );
        } else {
          // 守軍獲勝 / Defender wins
          battleCount++;

          // 攻擊者嘗試逃跑 / Attacker tries to escape
          const speedDiff = attacker.speed - defender.speed;
          const escapeChance = Math.max(
            CONFIG.SPEED_ESCAPE_MIN,
            Math.min(
              CONFIG.SPEED_ESCAPE_MAX,
              CONFIG.SPEED_ESCAPE_BASE + speedDiff * CONFIG.SPEED_ESCAPE_PER_DIFF
            )
          );

          if (rng.chance(escapeChance)) {
            // 逃跑成功 — 移回友方地點 / Escape successful — move back to friendly place
            const neighbors = adjacent.get(place.id) ?? [];
            const currentFaction = attacker.factionId;

            // 尋找友方地點（同陣營或無主）/ Find friendly place (same faction or unowned)
            let escapePlaceId: string | null = null;
            for (const neighbor of neighbors) {
              const neighborFaction = placeFactionMap.get(neighbor);
              if (neighborFaction === currentFaction || neighborFaction === null) {
                escapePlaceId = neighbor;
                break;
              }
            }

            // 若無友方地點，留在原地（損失兵力）/ If no friendly place, just stay at current place (lose troops)
            if (escapePlaceId) {
              await prisma.character.update({
                where: { id: attacker.id },
                data: { troops: 0, placeId: escapePlaceId },
              });
            } else {
              await prisma.character.update({
                where: { id: attacker.id },
                data: { troops: 0 },
              });
            }

            // 記錄逃跑事件 / Log escape event
            await prisma.event.create({
              data: {
                worldId,
                round,
                type: 'ESCAPE_SUCCESS',
                data: {
                  charId: attacker.id,
                  charName: attacker.name,
                  placeId: place.id,
                  placeName: place.name,
                  speedDiff,
                },
              },
            });
          } else {
            // 逃跑失敗 — 死亡 / Escape failed — death
            await prisma.character.update({
              where: { id: attacker.id },
              data: {
                alive: false,
                diedAtRound: round,
              },
            });

            // 記錄死亡事件 / Log death event
            await prisma.event.create({
              data: {
                worldId,
                round,
                type: 'BATTLE_DEATH',
                data: {
                  charId: attacker.id,
                  charName: attacker.name,
                  placeId: place.id,
                  placeName: place.name,
                  defenderId: defender.id,
                  defenderName: defender.name,
                },
              },
            });
          }

          // 攻擊者被擊敗，停止戰鬥 / Attacker is defeated, stop fighting
          break;
        }
      }

      // 若守軍全滅，地點易主 / If all defenders are dead, place changes owner
      if (currentDefenders.length === 0 && attacker.troops > 0) {
        await prisma.place.update({
          where: { id: place.id },
          data: { factionId: attacker.factionId },
        });

        // 若無總督，攻擊者成為總督 / Attacker becomes admin if no admin
        if (!place.administratorId) {
          await prisma.place.update({
            where: { id: place.id },
            data: { administratorId: attacker.id },
          });
        }
      }
    }
  }

  return battleCount;
}
