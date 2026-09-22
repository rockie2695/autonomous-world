// ============================================================================
// 階段 4：經濟
// Phase 4: Economy
// ============================================================================
// 分配收入、招募軍隊、處理購兵。
// Distributes income, recruits troops, handles troop purchases.
//
// 規則（來自規格）/ Rules (from spec):
// - 地點收入 = BASE_INCOME + MARKET_LV × MARKET_PER_LV / Place income = BASE_INCOME + MARKET_LV × MARKET_PER_LV
// - 分配：君王 40%、總督 30%、其他人 30%（平分）/ Distribution: King 40%, Admin 30%, Others 30% (shared equally)
// - 若無總督 → 總督份額歸君王 / If no admin → admin's share goes to king
// - 若無君王 → 全部歸總督 / If no king → all goes to admin
// - 招募：BASE_RECRUIT + BARRACKS_LV × BARRACKS_PER_LV / Recruitment: BASE_RECRUIT + BARRACKS_LV × BARRACKS_PER_LV
// - 角色購兵：1 兵 = 2 金，批次 10-100 / Characters buy troops: 1 troop = 2 gold, batch 10-100
//
// 使用方式 / Usage:
//   await economy(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 處理世界中所有地點的經濟。
 * Process economy for all places in the world.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於購兵的種子 RNG / Seeded RNG for troop purchases
 */
export async function economy(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有地點及其角色與陣營資訊 / Get all places with their characters and faction info
  const places = await prisma.place.findMany({
    where: { worldId },
    include: {
      characters: {
        where: { alive: true },
        select: { id: true, gold: true, troops: true },
      },
      faction: {
        select: { kingId: true },
      },
    },
  });

  for (const place of places) {
    // 計算地點收入 / Calculate place income
    const income =
      CONFIG.PLACE_BASE_INCOME +
      place.market * CONFIG.PLACE_MARKET_INCOME_PER_LV;

    // 取得君王與總督 / Get king and admin
    const kingId = place.faction?.kingId ?? null;
    const adminId = place.administratorId;

    // 分配收入 / Distribute income
    if (kingId && adminId) {
      // 君王與總督皆存在 / Both king and admin exist
      const kingShare = Math.floor(income * CONFIG.INCOME_KING_SHARE);
      const adminShare = Math.floor(income * CONFIG.INCOME_ADMIN_SHARE);
      const remaining = income - kingShare - adminShare;

      // 給予君王份額 / Give king's share
      await prisma.character.update({
        where: { id: kingId },
        data: { gold: { increment: kingShare } },
      });

      // 給予總督份額 / Give admin's share
      await prisma.character.update({
        where: { id: adminId },
        data: { gold: { increment: adminShare } },
      });

      // 將剩餘平均分給其他角色 / Distribute remaining to other characters equally
      const otherChars = place.characters.filter(
        (c: { id: string }) => c.id !== kingId && c.id !== adminId
      );
      if (otherChars.length > 0) {
        const perChar = Math.floor(remaining / otherChars.length);
        for (const char of otherChars) {
          await prisma.character.update({
            where: { id: char.id },
            data: { gold: { increment: perChar } },
          });
        }
      }
    } else if (kingId) {
      // 僅君王存在，總督份額歸君王 / Only king exists, admin share goes to king
      await prisma.character.update({
        where: { id: kingId },
        data: { gold: { increment: income } },
      });
    } else if (adminId) {
      // 僅總督存在，全部歸總督 / Only admin exists, all goes to admin
      await prisma.character.update({
        where: { id: adminId },
        data: { gold: { increment: income } },
      });
    }

    // 為駐軍招募士兵 / Recruit troops for the garrison
    const recruits =
      CONFIG.PLACE_BASE_RECRUIT +
      place.barracks * CONFIG.PLACE_BARRACKS_RECRUIT_PER_LV;

    await prisma.place.update({
      where: { id: place.id },
      data: { garrison: { increment: recruits } },
    });

    // 角色以個人金幣購兵 / Characters buy troops with personal gold
    for (const char of place.characters) {
      const maxBuyable = Math.floor(char.gold / CONFIG.CHAR_BUY_TROOP_PRICE);
      if (maxBuyable >= CONFIG.CHAR_BUY_TROOP_MIN) {
        // 購買一批（10-100 兵）/ Buy a batch (10-100 troops)
        const buyCount = rng.int(
          CONFIG.CHAR_BUY_TROOP_MIN,
          Math.min(CONFIG.CHAR_BUY_TROOP_MAX, maxBuyable)
        );

        const cost = buyCount * CONFIG.CHAR_BUY_TROOP_PRICE;

        await prisma.character.update({
          where: { id: char.id },
          data: {
            gold: { decrement: cost },
            troops: { increment: buyCount },
          },
        });
      }
    }
  }
}
