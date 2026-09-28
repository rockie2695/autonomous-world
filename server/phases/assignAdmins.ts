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
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { grantAdmin } from '../adminAssign';

/**
 * 自動為地點指派總督。
 * Auto-assign administrators to places.
 *
 * 冷卻規則 / Cooldown rule:
 * - 地點在 ADMIN_CHANGE_COOLDOWN_ROUNDS 回合內換過領導者 → 本階段跳過
 *   （佔領奪取與手動指派不受此限制，只有 AI 路徑受限）
 *   Places that changed leader within ADMIN_CHANGE_COOLDOWN_ROUNDS are skipped
 *   (battle captures and manual assignment are exempt — only AI paths block)
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
  // 取得所有「有勢力控制、沒有總督、且不在冷卻期」的地點——無主之地不可被指派 /
  // Get faction-controlled, admin-less, non-cooling places — unowned places
  // can never be assigned
  const unassignedPlaces = await prisma.place.findMany({
    where: {
      worldId,
      administratorId: null,
      factionId: { not: null },
      OR: [
        { adminChangedRound: null },
        {
          adminChangedRound: {
            lte: round - CONFIG.ADMIN_CHANGE_COOLDOWN_ROUNDS,
          },
        },
      ],
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
      // grantAdmin 會先清除候選人在其他地點的總督職（避免 Place.administratorId
      // 唯一約束衝突：角色可能帶著總督身分移動到新地點），再任命並記錄事件 /
      // grantAdmin clears the candidate's seat at other places first to avoid
      // the Place.administratorId unique constraint conflict (a character may
      // have moved to a new place while still listed as admin of their old one)
      await grantAdmin({
        worldId,
        round,
        place: { id: place.id, name: place.name },
        char: { id: bestCandidate.id, name: bestCandidate.name },
      });
    }
  }
}
