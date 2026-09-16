// ============================================================================
// Phase 8: Loyalty Check (Defection)
// ============================================================================
// Checks if characters will defect from their faction.
//
// Rules (from spec):
// - base = ambition × 0.5
// - if loyalty != king.loyalty: base × 1.2
// - if friend defected recently: base × 1.5
// - base × (1 - king.tong × 0.01)
// - if faction.places > 500: base × 0.8
// - if has Discontent: base × 1.3
// - if rand(100) < base: defect!
//   - if admin: create new faction with that place
//   - else: join nearby faction or create new one
//
// Usage:
//   const defections = await loyaltyCheck(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generateFactionName } from '@/lib/nameGenerator/faction';

/**
 * Check for defections and process them.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG for defection rolls
 * @returns Number of characters that defected
 */
export async function loyaltyCheck(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // Get all living characters in factions
  const characters = await prisma.character.findMany({
    where: {
      worldId,
      alive: true,
      factionId: { not: null },
      isKing: false, // Kings don't defect
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

    // Calculate defection probability
    let base = char.ambition * CONFIG.AMBITION_DEFECT_BASE_MULT;

    // Check loyalty difference from king
    if (char.faction.kingId) {
      const king = await prisma.character.findUnique({
        where: { id: char.faction.kingId },
        select: { loyalty: true, tong: true },
      });

      if (king) {
        if (char.loyalty !== king.loyalty) {
          base *= CONFIG.AMBITION_DIFF_LOYALTY_MULT;
        }

        // King's tong reduces defection
        base *= 1 - CONFIG.AMBITION_KING_TONG_REDUCE * king.tong;
      }
    }

    // Check if friend defected recently
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

    // Large faction reduces defection
    const factionCharCount = await prisma.character.count({
      where: {
        factionId: char.factionId!,
        alive: true,
      },
    });

    if (factionCharCount > CONFIG.AMBITION_LARGE_FACTION_THRESHOLD) {
      base *= CONFIG.AMBITION_LARGE_FACTION_MULT;
    }

    // Discontent increases defection
    const hasDiscontent = await prisma.discontent.findFirst({
      where: {
        worldId,
        aId: char.id,
      },
    });

    if (hasDiscontent) {
      base *= CONFIG.DISCONTENT_DEFECT_MULT;
    }

    // Roll for defection
    if (rng.chance(base / 100)) {
      defectionCount++;

      // Determine defection type
      const isAdministrator = await prisma.place.findFirst({
        where: {
          worldId,
          administratorId: char.id,
        },
      });

      if (isAdministrator) {
        // Admin creates new faction with their place
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

        // Transfer the place to new faction
        await prisma.place.update({
          where: { id: isAdministrator.id },
          data: { factionId: newFaction.id },
        });

        // Update character
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

        // Log defection event / 記錄叛變事件
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
        // Join nearby faction or create new one
        // Find adjacent places
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

        // Find a nearby faction to join
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
              (r) =>
                (r.placeA.factionId === nearbyFactionId ||
                  r.placeB.factionId === nearbyFactionId) &&
                r !== road
            )
          ) {
            // Join this faction
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

            // Log defection event / 記錄叛變事件
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

        // If couldn't join nearby, create new faction
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

          // Log defection event / 記錄叛變事件
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
