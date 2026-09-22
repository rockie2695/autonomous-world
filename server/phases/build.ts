// ============================================================================
// 階段 11：建築
// Phase 11: Build
// ============================================================================
// 由總督處理建築升級。
// Handles building upgrades by administrators.
//
// 規則（來自規格）/ Rules (from spec):
// - 僅總督可升級建築 / Only administrators can upgrade buildings
// - 費用：BASE × MULT^level（指數）/ Cost: BASE × MULT^level (exponential)
// - 最高等級：所有建築皆為 5 / Max level: 5 for all buildings
// - 建築：堡壘（防禦）、市場（收入）、兵營（招募）/ Buildings: fortress (defense), market (income), barracks (recruitment)
//
// 使用方式 / Usage:
//   await build(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 處理所有總督的建築升級。
 * Process building upgrades for all administrators.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於升級決策的種子 RNG / Seeded RNG for upgrade decisions
 */
export async function build(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有有總督的地點 / Get all places with administrators
  const places = await prisma.place.findMany({
    where: {
      worldId,
      administratorId: { not: null },
    },
    include: {
      administrator: {
        select: { id: true, gold: true, name: true },
      },
    },
  });

  for (const place of places) {
    if (!place.administrator) continue;

    // 決定要升級哪座建築 / Determine which building to upgrade
    const buildings = ['fortress', 'market', 'barracks'] as const;
    const building = rng.pick([...buildings]);
    if (!building) continue;

    // 檢查當前等級 / Check current level
    const currentLevel = place[building];
    if (currentLevel >= 5) continue; // 最高等級 / Max level

    // 計算費用 / Calculate cost
    const cost =
      CONFIG.BUILDING_UPGRADE_COST_BASE *
      Math.pow(CONFIG.BUILDING_UPGRADE_COST_MULT, currentLevel);

    // 檢查總督是否負擔得起 / Check if administrator can afford it
    if (place.administrator.gold < cost) continue;

    // 扣除金幣並升級 / Deduct gold and upgrade
    await prisma.character.update({
      where: { id: place.administrator.id },
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
          adminId: place.administrator.id,
          adminName: place.administrator.name,
        },
      },
    });
  }
}
