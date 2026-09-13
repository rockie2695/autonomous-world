// ============================================================================
// Phase 4: Economy
// ============================================================================
// Distributes income, recruits troops, handles troop purchases.
//
// Rules (from spec):
// - Place income = BASE_INCOME + MARKET_LV × MARKET_PER_LV
// - Distribution: King 40%, Admin 30%, Others 30% (shared equally)
// - If no admin → admin's share goes to king
// - If no king → all goes to admin
// - Recruitment: BASE_RECRUIT + BARRACKS_LV × BARRACKS_PER_LV
// - Characters buy troops: 1 troop = 2 gold, batch 10-100
//
// Usage:
//   await economy(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * Process economy for all places in the world.
 *
 * @param worldId - The world to process
 * @param round - Current round number
 * @param rng - Seeded RNG for troop purchases
 */
export async function economy(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // Get all places with their characters and faction info
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
    // Calculate place income
    const income =
      CONFIG.PLACE_BASE_INCOME +
      place.market * CONFIG.PLACE_MARKET_INCOME_PER_LV;

    // Get king and admin
    const kingId = place.faction?.kingId ?? null;
    const adminId = place.administratorId;

    // Distribute income
    if (kingId && adminId) {
      // Both king and admin exist
      const kingShare = Math.floor(income * CONFIG.INCOME_KING_SHARE);
      const adminShare = Math.floor(income * CONFIG.INCOME_ADMIN_SHARE);
      const remaining = income - kingShare - adminShare;

      // Give king's share
      await prisma.character.update({
        where: { id: kingId },
        data: { gold: { increment: kingShare } },
      });

      // Give admin's share
      await prisma.character.update({
        where: { id: adminId },
        data: { gold: { increment: adminShare } },
      });

      // Distribute remaining to other characters equally
      const otherChars = place.characters.filter(
        (c) => c.id !== kingId && c.id !== adminId
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
      // Only king exists, admin share goes to king
      await prisma.character.update({
        where: { id: kingId },
        data: { gold: { increment: income } },
      });
    } else if (adminId) {
      // Only admin exists, all goes to admin
      await prisma.character.update({
        where: { id: adminId },
        data: { gold: { increment: income } },
      });
    }

    // Recruit troops for the garrison
    const recruits =
      CONFIG.PLACE_BASE_RECRUIT +
      place.barracks * CONFIG.PLACE_BARRACKS_RECRUIT_PER_LV;

    await prisma.place.update({
      where: { id: place.id },
      data: { garrison: { increment: recruits } },
    });

    // Characters buy troops with personal gold
    for (const char of place.characters) {
      const maxBuyable = Math.floor(char.gold / CONFIG.CHAR_BUY_TROOP_PRICE);
      if (maxBuyable >= CONFIG.CHAR_BUY_TROOP_MIN) {
        // Buy a batch (10-100 troops)
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
