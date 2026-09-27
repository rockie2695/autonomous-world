// ============================================================================
// 階段 9：AI 移動
// Phase 9: AI Movement
// ============================================================================
// 將每個角色朝目標移動（每回合 1 格）。
// Moves each character toward their target (1 tile per turn).
//
// 規則（來自規格）/ Rules (from spec):
// - 每個角色每回合最多移動 1 個地點 / Each character moves at most 1 place per turn
// - 移動順序：速度降序（v1.1）/ Movement order: speed descending (v1.1)
// - 速度相同：以種子 RNG 決定順序 / Same speed: seeded RNG determines order
// - 若角色無目標則原地不動 / If character has no target, they stay put
// - 目標優先順序：號令 > 陣營敵人 > 向最近無主之地行軍 > 原地不動
// - Target priority: Signal > Faction enemy > March to nearest unowned place > Stay put
//
// 使用方式 / Usage:
//   await aiMove(worldId, round, rng);
//   await aiMove(worldId, round, rng, skipIds); // skipIds: 本回合出生者不移動
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { recordMove } from '../moveEvent';

/**
 * 將所有角色朝其目標移動。
 * Move all characters toward their targets.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於打破速度平手的種子 RNG / Seeded RNG for tie-breaking movement order
 * @param skipIds - 本回合不得移動的角色 ID（出生回合原地待命）
 *                  Character IDs that must not move this round (spawn-round stay put)
 */
export async function aiMove(
  worldId: string,
  round: number,
  rng: Rng,
  skipIds?: ReadonlySet<string>
): Promise<void> {
  // 取得所有存活角色及其所在地與陣營 / Get all living characters with their current locations and faction
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: {
      id: true,
      name: true,
      placeId: true,
      speed: true,
      factionId: true,
      troops: true,
    },
  });

  // 依速度降序排序（v1.1）/ Sort by speed descending (v1.1)
  // 速度相同時用種子 RNG 做確定性平手裁決 / For same speed, use seeded RNG for deterministic tie-breaking
  const sorted = characters.sort((a, b) => {
    if (a.speed !== b.speed) return b.speed - a.speed;
    // 速度相同：使用 RNG / Same speed: use RNG
    return rng.random() - 0.5;
  });

  // 取得所有道路以進行路徑尋找 / Get all roads for pathfinding
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // 建立鄰接表 / Build adjacency map
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }

  // 取得本回合的有效號令 / Get active signals for this round
  const activeSignals = await prisma.signal.findMany({
    where: {
      worldId,
      active: true,
      expireRound: { gte: round },
    },
    select: {
      fromId: true,
      targetPlaceId: true,
    },
  });

  // 建立號令對照：characterId -> targetPlaceId / Build signal map: characterId -> targetPlaceId
  const signalTargets = new Map<string, string>();
  for (const signal of activeSignals) {
    signalTargets.set(signal.fromId, signal.targetPlaceId);
  }

  // 取得所有地點及陣營資訊以偵測敵人 / Get all places with their faction info for enemy detection
  const places = await prisma.place.findMany({
    where: { worldId },
    select: {
      id: true,
      factionId: true,
    },
  });

  // 建立地點→陣營對照 / Build place faction map
  const placeFactionMap = new Map<string, string | null>();
  for (const place of places) {
    placeFactionMap.set(place.id, place.factionId);
  }

  // 多源 BFS：從所有無主之地起算，每個地點到最近無主之地的距離
  // Multi-source BFS from all unowned places: distance to nearest unowned place
  // 用於「向無主之地行軍」（距離 d 的地點走一步到距離 d-1 的鄰居）
  // Used for marching on unowned land (step from distance d to a neighbor at d-1)
  const distToUnowned = new Map<string, number>();
  const bfsQueue: string[] = [];
  for (const place of places) {
    if (place.factionId === null) {
      distToUnowned.set(place.id, 0);
      bfsQueue.push(place.id);
    }
  }
  for (let qi = 0; qi < bfsQueue.length; qi++) {
    const cur = bfsQueue[qi];
    const d = distToUnowned.get(cur)!;
    for (const nb of adjacent.get(cur) ?? []) {
      if (!distToUnowned.has(nb)) {
        distToUnowned.set(nb, d + 1);
        bfsQueue.push(nb);
      }
    }
  }

  // 移動每個角色 / Move each character
  for (const char of sorted) {
    // 本回合出生的角色原地待命（出生回合不移動）/
    // Spawned this round: stay put (no movement in spawn round)
    if (skipIds?.has(char.id)) continue;

    const currentPlaceFaction = placeFactionMap.get(char.placeId);

    // 1. 檢查角色是否有號令目標 / Check if character has a target from signal
    const signalTarget = signalTargets.get(char.id);
    if (signalTarget) {
      // 朝號令目標移動 / Move toward signal target
      const neighbors = adjacent.get(char.placeId) ?? [];
      if (neighbors.includes(signalTarget)) {
        // 可直接移至目標 / Can move directly to target
        await prisma.character.update({
          where: { id: char.id },
          data: { placeId: signalTarget },
        });
        await recordMove({
          worldId,
          round,
          charId: char.id,
          charName: char.name,
          factionId: char.factionId,
          fromPlaceId: char.placeId,
          toPlaceId: signalTarget,
        });
        continue;
      }

      // 尋找可更接近目標的相鄰地點（BFS 深度 1）/ Find adjacent place that gets closer to target (BFS depth 1)
      // 目前先移至任一非敵方佔領的相鄰地點 / For now, just move to any adjacent place that's not owned by enemy
      for (const neighbor of neighbors) {
        const neighborFaction = placeFactionMap.get(neighbor);
        if (neighborFaction !== currentPlaceFaction) continue; // 跳過敵方地點 / Skip enemy places
        await prisma.character.update({
          where: { id: char.id },
          data: { placeId: neighbor },
        });
        await recordMove({
          worldId,
          round,
          charId: char.id,
          charName: char.name,
          factionId: char.factionId,
          fromPlaceId: char.placeId,
          toPlaceId: neighbor,
        });
        break;
      }
      continue;
    }

    // 2. 若無號令，檢查陣營附近是否有敵人 / If no signal, check if faction has enemies nearby
    if (char.factionId) {
      const neighbors = adjacent.get(char.placeId) ?? [];

      // 尋找敵方地點（不同陣營或無主）/ Find enemy places (different faction or unowned)
      const enemyPlaces = neighbors.filter((n) => {
        const nFaction = placeFactionMap.get(n);
        return nFaction !== currentPlaceFaction;
      });

      if (enemyPlaces.length > 0) {
        // 朝隨機敵方地點移動 / Move toward random enemy place
        const target = rng.pick(enemyPlaces);
        if (target) {
          await prisma.character.update({
            where: { id: char.id },
            data: { placeId: target },
          });
          await recordMove({
            worldId,
            round,
            charId: char.id,
            charName: char.name,
            factionId: char.factionId,
            fromPlaceId: char.placeId,
            toPlaceId: target,
          });
        }
        continue;
      }

      // 3. 無相鄰敵人：向最近的無主之地行軍（每回合 1 格）/
      // No adjacent enemy: march toward the nearest unowned place (1 hop per round)
      // 僅限有陣營的將領（無陣營者不參與佔領）/ Only faction members (factionless chars never capture)
      const dist = distToUnowned.get(char.placeId);
      if (char.factionId && dist !== undefined && dist > 0 && char.troops > 0) {
        // 走到距離減一的鄰居，若有多个選擇則用 RNG 決定 /
        // Step to a neighbor at distance-1; RNG breaks ties
        const nextHops = (adjacent.get(char.placeId) ?? []).filter(
          (n) => distToUnowned.get(n) === dist - 1
        );
        const next = rng.pick(nextHops);
        if (next) {
          await prisma.character.update({
            where: { id: char.id },
            data: { placeId: next },
          });
          await recordMove({
            worldId,
            round,
            charId: char.id,
            charName: char.name,
            factionId: char.factionId,
            fromPlaceId: char.placeId,
            toPlaceId: next,
          });
        }
      }
    }

    // 4. 若無目標則原地不動（不移動）/ If no target, stay put (no movement)
  }
}
