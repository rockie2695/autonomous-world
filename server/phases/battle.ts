// ============================================================================
// Phase 10: Battle
// ============================================================================
// Resolves battles when characters arrive at enemy territories.
//
// Rules (from spec):
// - Attackers arrive at place, fight defenders
// - Attack order: speed descending (v1.1)
// - If multiple attackers, later ones fight the new owner
// - atk = troops × (1 + wu/30) × rand(0.85, 1.15)
// - def = troops × (1 + tong/30) × (1 + fortress×0.2) × rand(0.85, 1.15)
// - Loser: escape based on speed difference
//   - escape = clamp(0.5 + speedDiff × 0.02, 0.1, 0.9)
//   - If escape fails → death
// - Winner: troops ×= 0.9 (fatigue)
// - If all defenders dead: place changes owner
//
// Usage:
//   const battles = await battle(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * Resolve battles at all contested places.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG for battle calculations
 * @returns Number of battles fought
 */
export async function battle(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // Find all places with both friendly and enemy characters
  const places = await prisma.place.findMany({
    where: { worldId, factionId: { not: null } },
    include: {
      characters: {
        where: { alive: true },
        select: { id: true, factionId: true, wu: true, tong: true, speed: true, troops: true, name: true },
      },
    },
  });

  // Get all roads for escape pathfinding
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // Build adjacency map for escape movement
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }

  // Get all places with faction info for escape destination
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

    // Separate defenders (same faction) from attackers (different faction)
    const defenders = place.characters.filter(
      (c) => c.factionId === place.factionId
    );
    const attackers = place.characters.filter(
      (c) => c.factionId !== place.factionId
    );

    if (attackers.length === 0 || defenders.length === 0) continue;

    // Sort attackers by speed descending (v1.1)
    const sortedAttackers = attackers.sort((a, b) => b.speed - a.speed);

    for (const attacker of sortedAttackers) {
      if (attacker.troops <= 0) continue;

      // Fight defenders one by one
      let currentDefenders = [...defenders];

      while (currentDefenders.length > 0 && attacker.troops > 0) {
        // Pick defender: priority to admin, then highest troops
        const defender =
          currentDefenders.find(
            (d) => place.administratorId === d.id
          ) ?? currentDefenders.sort((a, b) => b.troops - a.troops)[0];

        if (!defender) break;

        // Calculate attack power
        const atkRandom = rng.float(
          CONFIG.BATTLE_RANDOM_MIN,
          CONFIG.BATTLE_RANDOM_MAX
        );
        const atk =
          attacker.troops *
          (1 + attacker.wu * CONFIG.BATTLE_ATK_WU_MULT) *
          atkRandom;

        // Calculate defense power
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
          // Attacker wins
          battleCount++;

          // Defender tries to escape
          const speedDiff = defender.speed - attacker.speed;
          const escapeChance = Math.max(
            CONFIG.SPEED_ESCAPE_MIN,
            Math.min(
              CONFIG.SPEED_ESCAPE_MAX,
              CONFIG.SPEED_ESCAPE_BASE + speedDiff * CONFIG.SPEED_ESCAPE_PER_DIFF
            )
          );

          if (rng.chance(escapeChance)) {
            // Escape successful — move to nearby friendly place
            const neighbors = adjacent.get(place.id) ?? [];
            const currentFaction = defender.factionId;

            // Find friendly place (same faction or unowned)
            let escapePlaceId: string | null = null;
            for (const neighbor of neighbors) {
              const neighborFaction = placeFactionMap.get(neighbor);
              if (neighborFaction === currentFaction || neighborFaction === null) {
                escapePlaceId = neighbor;
                break;
              }
            }

            // If no friendly place, just stay at current place (lose troops)
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

            // Log escape event / 記錄逃脫事件
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
            // Escape failed — death
            await prisma.character.update({
              where: { id: defender.id },
              data: {
                alive: false,
                diedAtRound: round,
              },
            });

            // Log death event / 記錄死亡事件
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

          // Remove defender from current list
          currentDefenders = currentDefenders.filter(
            (d) => d.id !== defender.id
          );

          // Attacker loses troops (fatigue)
          attacker.troops = Math.floor(
            attacker.troops * CONFIG.CHAR_FATIGUE_PER_WIN
          );
        } else {
          // Defender wins
          battleCount++;

          // Attacker tries to escape
          const speedDiff = attacker.speed - defender.speed;
          const escapeChance = Math.max(
            CONFIG.SPEED_ESCAPE_MIN,
            Math.min(
              CONFIG.SPEED_ESCAPE_MAX,
              CONFIG.SPEED_ESCAPE_BASE + speedDiff * CONFIG.SPEED_ESCAPE_PER_DIFF
            )
          );

          if (rng.chance(escapeChance)) {
            // Escape successful — move back to friendly place
            const neighbors = adjacent.get(place.id) ?? [];
            const currentFaction = attacker.factionId;

            // Find friendly place (same faction or unowned)
            let escapePlaceId: string | null = null;
            for (const neighbor of neighbors) {
              const neighborFaction = placeFactionMap.get(neighbor);
              if (neighborFaction === currentFaction || neighborFaction === null) {
                escapePlaceId = neighbor;
                break;
              }
            }

            // If no friendly place, just stay at current place (lose troops)
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

            // Log escape event / 記錄逃脫事件
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
            // Escape failed — death
            await prisma.character.update({
              where: { id: attacker.id },
              data: {
                alive: false,
                diedAtRound: round,
              },
            });

            // Log death event / 記錄死亡事件
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

          // Attacker is defeated, stop fighting
          break;
        }
      }

      // If all defenders are dead, place changes owner
      if (currentDefenders.length === 0 && attacker.troops > 0) {
        await prisma.place.update({
          where: { id: place.id },
          data: { factionId: attacker.factionId },
        });

        // Attacker becomes admin if no admin
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
