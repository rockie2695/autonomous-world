// ============================================================================
// 階段 11：建築
// Phase 11: Build
// ============================================================================
// 由總督處理建築升級。
// Handles building upgrades by administrators.
//
// 規則 / Rules:
// - 僅總督可升級建築 / Only administrators can upgrade buildings
// - 費用：BASE × MULT^level（指數）/ Cost: BASE × MULT^level (exponential)
// - 最高等級：所有建築皆為 5 / Max level: 5 for all buildings
// - 建築：堡壘（防禦）、市場（收入）、兵營（招募）/ Buildings: fortress (defense), market (income), barracks (recruitment)
// - **蓋什麼不再是隨機**：受威脅 → 堡壘優先；否則按行政官的消費性格
//   （spending.ts）——武人先兵營、守將先堡壘、商人先市場、均衡補短板。
// - **What gets raised is no longer random**: under threat the fortress comes
//   first; otherwise the administrator's spending posture decides (spending.ts) —
//   aggressive barracks, guardian fortress, merchant market, balanced raises the
//   shortest board.
//
// 使用方式 / Usage:
//   await build(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';
import { BUILDING_MAX_LEVEL, upgradeCost, type BuildingKind } from '@/lib/placeEffects';
import { spendingPosture, preferredBuildings } from '@/lib/spending';
import {
  estimateAttack,
  estimatePlaceDefence,
  isThreatened,
} from '@/lib/warEstimate';

/**
 * 處理所有總督的建築升級。
 * Process building upgrades for all administrators.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（升級決策已改為性格＋威脅，本階段不再畫 RNG）/
 *              Seeded RNG (the choice is posture + threat now; the phase draws no RNG)
 */
export async function build(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  void rng;

  // 建築升級需要的全景：地方（等級/駐軍/堡壘/陣營）、道路（鄰接）、所有人（估威脅）/
  // The full picture an upgrade decision needs: places (levels/garrison/fortress/faction),
  // roads (adjacency), everyone alive (for the threat estimate)
  const [places, roads, everyone] = await Promise.all([
    prisma.place.findMany({
      where: { worldId, administratorId: { not: null } },
      include: {
        administrator: {
          select: { id: true, gold: true, name: true, wu: true, ti: true, jing: true },
        },
      },
    }),
    prisma.road.findMany({
      where: { worldId },
      select: { aId: true, bId: true },
    }),
    prisma.character.findMany({
      where: { worldId, alive: true },
      select: {
        id: true,
        name: true,
        placeId: true,
        factionId: true,
        troops: true,
        wu: true,
        ti: true,
      },
    }),
  ]);

  // 全世界的地方（陣營/駐軍/堡壘）與鄰接表：算威脅用 /
  // Every place (faction/garrison/fortress) and the adjacency map: for the threat estimate
  const allPlaces = await prisma.place.findMany({
    where: { worldId },
    select: { id: true, factionId: true, garrison: true, fortress: true },
  });
  const placeById = new Map(allPlaces.map((p) => [p.id, p] as const));
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }
  const residentsOf = new Map<string, typeof everyone>();
  for (const c of everyone) {
    const list = residentsOf.get(c.placeId) ?? [];
    list.push(c);
    residentsOf.set(c.placeId, list);
  }

  for (const place of places) {
    const admin = place.administrator;
    if (!admin) continue;

    // ── 威脅感知：鄰近敵對將領裡最強者的估計攻擊，蓋得過本地的估計防禦嗎 ──
    // 與 aiMove 的攻方估量**同一份**數字（warEstimate.ts）——守方不會引用模擬
    // 沒用的數字。
    // ── Threat sense: does the strongest adjacent hostile leader's estimated
    // attack clear this place's estimated defence? The **same** numbers as
    // aiMove's attacking side (warEstimate.ts) — the defence never quotes numbers
    // the fight does not use.
    const myDefenders = (residentsOf.get(place.id) ?? []).filter(
      (c) => c.factionId !== null && c.factionId === place.factionId
    );
    const myDefence = estimatePlaceDefence(place, myDefenders);
    const neighbours = adjacent.get(place.id) ?? [];
    let maxHostileAttack = 0;
    for (const n of neighbours) {
      const nPlace = placeById.get(n);
      if (!nPlace || !place.factionId || nPlace.factionId === place.factionId) continue;
      for (const resident of residentsOf.get(n) ?? []) {
        if (resident.factionId === null || resident.factionId === place.factionId) continue;
        maxHostileAttack = Math.max(maxHostileAttack, estimateAttack(resident));
      }
    }
    const threatened = isThreatened(myDefence, maxHostileAttack);

    // ── 蓋什麼：受威脅 → 堡壘永遠最先；否則按性格 ──
    // 順序裡第一座還沒到頂的，買得起就蓋。
    // ── What to raise: under threat the fortress always leads; otherwise the
    // posture decides. The first preference not yet maxed is raised if affordable.
    const posture = spendingPosture(admin);
    const order: BuildingKind[] = threatened
      ? ['fortress', ...preferredBuildings(posture, place)]
      : preferredBuildings(posture, place);

    for (const building of order) {
      const currentLevel = place[building];
      if (currentLevel >= BUILDING_MAX_LEVEL) continue;
      const cost = upgradeCost(currentLevel);
      if (admin.gold < cost) continue;

      // 扣除金幣並升級 / Deduct gold and upgrade
      await prisma.character.update({
        where: { id: admin.id },
        data: { gold: { decrement: cost } },
      });

      await prisma.place.update({
        where: { id: place.id },
        data: { [building]: currentLevel + 1 },
      });

      // 記錄建築升級事件 / Log building upgrade event
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'BUILDING_UPGRADE',
          data: {
            placeId: place.id,
            placeName: place.name,
            building,
            oldLevel: currentLevel,
            newLevel: currentLevel + 1,
            adminId: admin.id,
            adminName: admin.name,
            // 為什麼蓋這座：日誌一行要能回答「憑什麼」，不然讀者只能當它是骰出來的
            // Why this one: the row has to answer "because what", or the reader can
            // only assume it was rolled
            reason: threatened ? ('threatened' as const) : posture,
          },
        },
      });
      // 一個行政官一回合只蓋一座 / One upgrade per administrator per round
      break;
    }
  }
}
