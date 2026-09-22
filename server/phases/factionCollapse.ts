// ============================================================================
// 階段 13：勢力崩潰
// Phase 13: Faction Collapse
// ============================================================================
// 君王死亡時處理勢力崩潰。
// Processes faction collapse when king dies.
//
// 規則（來自規格）/ Rules (from spec):
// - 君王死亡 → collapsing = true / King death → collapsing = true
// - 每回合：隨機 1-3 名角色叛逃 / Each round: 1-3 characters defect randomly
// - 叛逃持續直到剩餘 0 名角色 / Defections continue until 0 characters remain
// - 角色加入鄰近勢力或自立新勢力 / Characters join nearby factions or create new ones
//
// 使用方式 / Usage:
//   await factionCollapse(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generateFactionName } from '@/lib/nameGenerator/faction';

/**
 * 處理崩潰中勢力的崩潰程序。
 * Process faction collapse for collapsing factions.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於崩潰機制的種子 RNG / Seeded RNG for collapse mechanics
 */
export async function factionCollapse(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 找出所有崩潰中的勢力 / Find all collapsing factions
  const collapsingFactions = await prisma.faction.findMany({
    where: {
      worldId,
      collapsing: true,
      alive: true,
    },
    include: {
      characters: {
        where: { alive: true, isKing: false },
      },
    },
  });

  for (const faction of collapsingFactions) {
    if (faction.characters.length === 0) continue;

    // 記錄崩潰開始事件 / Log collapse start event
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'FACTION_COLLAPSE',
        data: {
          factionId: faction.id,
          factionName: faction.name,
          remainingChars: faction.characters.length,
        },
      },
    });

    // 決定本回合有多少人叛逃 / Determine how many will defect this round
    const defectCount = rng.int(
      CONFIG.COLLAPSE_DEFECT_PER_ROUND_MIN,
      CONFIG.COLLAPSE_DEFECT_PER_ROUND_MAX
    );

    // 隨機挑選要叛逃的角色 / Pick random characters to defect
    const toDefect = rng
      .shuffle([...faction.characters])
      .slice(0, defectCount);

    for (const char of toDefect) {
      // 尋找相鄰地點 / Find adjacent places
      const adjacentPlaces = await prisma.road.findMany({
        where: {
          worldId,
          OR: [{ aId: char.placeId }, { bId: char.placeId }],
        },
        include: {
          placeA: { select: { factionId: true } },
          placeB: { select: { factionId: true } },
        },
      });

      // 嘗試加入鄰近勢力 / Try to join nearby faction
      let joinedFaction = false;
      for (const road of adjacentPlaces) {
        const nearbyFactionId =
          road.aId === char.placeId
            ? road.placeA.factionId
            : road.placeB.factionId;

        if (nearbyFactionId && nearbyFactionId !== faction.id) {
          await prisma.character.update({
            where: { id: char.id },
            data: {
              factionId: nearbyFactionId,
              isKing: false,
              ambition: rng.int(
                CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MIN,
                CONFIG.CHAR_NEW_FACTION_AMBITION_RESET_MAX
              ),
            },
          });
          joinedFaction = true;
          break;
        }
      }

      // 若無法加入，則建立新勢力 / If couldn't join, create new faction
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
      }
    }
  }
}
