// ============================================================================
// Phase 13: Faction Collapse
// ============================================================================
// Processes faction collapse when king dies.
//
// Rules (from spec):
// - King death → collapsing = true
// - Each round: 1-3 characters defect randomly
// - Defections continue until 0 characters remain
// - Characters join nearby factions or create new ones
//
// Usage:
//   await factionCollapse(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generateFactionName } from '@/lib/nameGenerator/faction';

/**
 * Process faction collapse for collapsing factions.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG for collapse mechanics
 */
export async function factionCollapse(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Find all collapsing factions
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

    // Log collapse start event / 記錄崩潰開始事件
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

    // Determine how many will defect this round
    const defectCount = rng.int(
      CONFIG.COLLAPSE_DEFECT_PER_ROUND_MIN,
      CONFIG.COLLAPSE_DEFECT_PER_ROUND_MAX
    );

    // Pick random characters to defect
    const toDefect = rng
      .shuffle([...faction.characters])
      .slice(0, defectCount);

    for (const char of toDefect) {
      // Find adjacent places
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

      // Try to join nearby faction
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

      // If couldn't join, create new faction
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
