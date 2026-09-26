// ============================================================================
// 階段 12：指派總督
// Phase 12: Assign Admins
// ============================================================================
// AI 自動為地點指派總督。
// AI auto-assigns administrators to places.
//
// 規則（來自規格）/ Rules (from spec):
// - 每個地點有 1 名總督 / Each place has 1 administrator
// - 君王可同時管理多個地點 / King can administer multiple places
// - AI 指派各地點統率最高的角色 / AI assigns the character with highest tong at each place
// - 若君王閒置，則管理其當前地點 / If king is idle, they administer their current place
//
// 使用方式 / Usage:
//   await assignAdmins(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';

/**
 * 自動為地點指派總督。
 * Auto-assign administrators to places.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（本階段未使用）/ Seeded RNG (unused for this phase)
 */
export async function assignAdmins(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有沒有總督的地點 / Get all places without administrators
  const unassignedPlaces = await prisma.place.findMany({
    where: {
      worldId,
      administratorId: null,
    },
  });

  for (const place of unassignedPlaces) {
    // 尋找此地點統率最高的角色 / Find the character with highest tong at this place
    const bestCandidate = await prisma.character.findFirst({
      where: {
        worldId,
        placeId: place.id,
        alive: true,
      },
      orderBy: { tong: 'desc' },
      select: { id: true, name: true },
    });

    if (bestCandidate) {
      // 先清除該角色在其他地點的總督職，避免 Place.administratorId 唯一約束衝突
      // (角色可能帶著總督身分移動到新地點，造成同時被兩地點指名)
      // Clear the character's admin role at other places first to avoid the
      // Place.administratorId unique constraint conflict (a character may have
      // moved to a new place while still listed as admin of their old one)
      await prisma.place.updateMany({
        where: {
          worldId,
          administratorId: bestCandidate.id,
          id: { not: place.id },
        },
        data: { administratorId: null },
      });

      await prisma.place.update({
        where: { id: place.id },
        data: {
          administratorId: bestCandidate.id,
        },
      });

      // 更新角色的 lastPromotedRound / Update character's lastPromotedRound
      await prisma.character.update({
        where: { id: bestCandidate.id },
        data: { lastPromotedRound: round },
      });

      // 記錄管理員指派事件 / Log admin assignment event
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'ADMIN_ASSIGNED',
          data: {
            charId: bestCandidate.id,
            charName: bestCandidate.name,
            placeId: place.id,
            placeName: place.name,
          },
        },
      });
    }
  }
}
