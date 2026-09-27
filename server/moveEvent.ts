// ============================================================================
// 移動事件記錄 / Move Event Recording
// ============================================================================
// 記錄角色每回合的地點移動（CHARACTER_MOVED 事件），
// 供前端地圖播放「從 → 到」的移動動畫。
// Records a character's per-round place move (CHARACTER_MOVED event) so the
// frontend map can play a from → to travel animation.
//
// 由 aiMove（一般移動）與 battle（逃跑移動）呼叫。
// Called by aiMove (normal movement) and battle (escape movement).
// ============================================================================

import { prisma } from '@/lib/prisma';

/**
 * 記錄一次移動事件。起點與終點相同時不記錄。
 * Record a move event. No-op when origin equals destination.
 */
export async function recordMove(params: {
  worldId: string;
  round: number;
  charId: string;
  charName: string;
  factionId: string | null;
  fromPlaceId: string;
  toPlaceId: string;
}): Promise<void> {
  if (params.fromPlaceId === params.toPlaceId) return;

  await prisma.event.create({
    data: {
      worldId: params.worldId,
      round: params.round,
      type: 'CHARACTER_MOVED',
      data: {
        charId: params.charId,
        charName: params.charName,
        factionId: params.factionId,
        fromPlaceId: params.fromPlaceId,
        toPlaceId: params.toPlaceId,
      },
    },
  });
}
