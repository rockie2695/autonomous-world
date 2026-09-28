// ============================================================================
// 行政官任命輔助 / Administrator Assignment Helpers
// ============================================================================
// 所有「指派 / 免職行政官」路徑共用的邏輯，讓規則只定義一次。
// Shared logic for every "grant / revoke administrator" path, so the rules are
// defined in exactly one place.
//
// 規則 / Rules:
// - 取得行政官職務 → 野心 -CONFIG.AMBITION_ADMIN_ASSIGNED_DELTA（暫時），
//   並在 CONFIG.AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS 回合後自動回復；
//   期間若仍在職，回復 +同一數值；若中途被免職或死亡則不回復
//   （免職本身已給 +CONFIG.AMBITION_ADMIN_REPLACED_DELTA）
//   Granted the post → temporary -AMBITION_ADMIN_ASSIGNED_DELTA ambition that
//   auto-reverts after AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS if the character
//   is still in office; no revert if removed or dead (removal already paid
//   +AMBITION_ADMIN_REPLACED_DELTA).
// - 被免職 → 野心 +CONFIG.AMBITION_ADMIN_REPLACED_DELTA，並取消尚未到期的減免
//   Removed from the post → +AMBITION_ADMIN_REPLACED_DELTA ambition and any
//   pending reduction is cancelled.
// - 任何行政官異動（指派 / 免職 / 清空）都會把 Place.adminChangedRound 更新為
//   該回合；AI 路徑在 ADMIN_CHANGE_COOLDOWN_ROUNDS 回合內不得更換
//   Every change (grant / revoke / clear) stamps Place.adminChangedRound;
//   AI paths may not change it again for ADMIN_CHANGE_COOLDOWN_ROUNDS rounds.
// - Place.administratorId 全域唯一（角色最多管一地），任命前必須先清除
//   該角色在其他地點的職務，避免唯一約束衝突
//   administratorId is globally unique (one seat per character), so a grant
//   must first clear the character's seat anywhere else.
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';

/**
 * 判斷地點是否處於「行政官冷卻期」——AI 不得更換其領導。
 * Whether a place is in the post-leader-change cooldown (AI paths blocked).
 *
 * @param adminChangedRound - 上次行政官異動回合（null = 從未異動）/ Last change round (null = never)
 * @param round - 當前回合數 / Current round
 * @returns true 表示冷卻中，AI 路徑應跳過 / true means AI paths must skip
 */
export function isAdminChangeCoolingDown(
  adminChangedRound: number | null,
  round: number
): boolean {
  if (adminChangedRound === null) return false;
  return round - adminChangedRound < CONFIG.ADMIN_CHANGE_COOLDOWN_ROUNDS;
}

/** 任命所需的地點資訊 / Place info needed for a grant */
export interface GrantAdminPlace {
  id: string;
  name: string;
}

/** 任命所需的角色資訊 / Character info needed for a grant */
export interface GrantAdminChar {
  id: string;
  name: string;
}

export interface GrantAdminParams {
  worldId: string;
  round: number;
  place: GrantAdminPlace;
  char: GrantAdminChar;
  /** 是否記錄 ADMIN_ASSIGNED 事件（取代舊領導時只記 ADMIN_REMOVED）/ Log an ADMIN_ASSIGNED Event (replacements only log ADMIN_REMOVED) */
  logEvent?: boolean;
  /** 額外寫入 ADMIN_ASSIGNED 事件 data 的欄位 / Extra fields merged into the ADMIN_ASSIGNED Event data */
  eventData?: Record<string, unknown>;
}

/**
 * 指派行政官：清掉他在別處的職務 → 更新地點（含冷卻錨點）→
 * 野心暫時 -1（10 回合後自動回復）→ 記錄事件。
 * Grant the administrator post: clear his seat elsewhere → update the place
 * (stamping the cooldown anchor) → temporary -1 ambition (auto-reverting) →
 * log events.
 *
 * 若角色已有尚未到期的減免（表示職務未中斷，例如換地點連任），
 * 只順延到期回合而不再重複扣減。
 * If a reduction is already pending (continuous service, e.g. a seat transfer)
 * the expiry is extended instead of deducting twice.
 */
export async function grantAdmin(params: GrantAdminParams): Promise<void> {
  const { worldId, round, place, char, logEvent = true, eventData } = params;

  // 清除該角色在其他地點的總督職（唯一約束），並替那些地點打上冷卻錨點 /
  // Clear the character's seat elsewhere (unique constraint) and stamp the
  // cooldown anchor on those places
  await prisma.place.updateMany({
    where: {
      worldId,
      administratorId: char.id,
      id: { not: place.id },
    },
    data: { administratorId: null, adminChangedRound: round },
  });

  // 地點換領導：記錄行政官 + 冷卻錨點 / Place changes leader: administrator + cooldown anchor
  await prisma.place.update({
    where: { id: place.id },
    data: { administratorId: char.id, adminChangedRound: round },
  });

  const current = await prisma.character.findUnique({
    where: { id: char.id },
    select: { ambition: true, adminAmbitionRevertRound: true },
  });

  // 已有未到期減免 → 視為職務未中斷，只順延到期回合（不再重複扣減）/
  // Reduction still pending → continuous service, extend expiry only
  if (current === null) return;
  if (current.adminAmbitionRevertRound !== null) {
    await prisma.character.update({
      where: { id: char.id },
      data: {
        lastPromotedRound: round,
        adminAmbitionRevertRound:
          round + CONFIG.AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS,
      },
    });
    return;
  }

  const newAmbition = Math.max(
    CONFIG.CHAR_AMBITION_MIN,
    current.ambition - CONFIG.AMBITION_ADMIN_ASSIGNED_DELTA
  );
  const appliedDelta = newAmbition - current.ambition;

  await prisma.character.update({
    where: { id: char.id },
    data: {
      lastPromotedRound: round,
      ambition: newAmbition,
      // 已在最低值時實際未扣減 → 不排定回復（否則到期會憑空 +1）/
      // Already at the floor → no deduction happened, so nothing to revert
      adminAmbitionRevertRound:
        appliedDelta !== 0
          ? round + CONFIG.AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS
          : null,
    },
  });

  if (appliedDelta !== 0) {
    await prisma.ambitionEvent.create({
      data: {
        worldId,
        charId: char.id,
        round,
        delta: appliedDelta,
        reason: `Granted administrator of ${place.name}`,
      },
    });
  }

  if (logEvent) {
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'ADMIN_ASSIGNED',
        data: {
          charId: char.id,
          charName: char.name,
          placeId: place.id,
          placeName: place.name,
          ambitionDelta: appliedDelta,
          ...eventData,
        },
      },
    });
  }
}

export interface RevokeAdminParams {
  worldId: string;
  round: number;
  place: GrantAdminPlace;
  char: GrantAdminChar;
  /** 接任者（未記免職事件時省略）/ The successor (omit when not logging the Event) */
  newAdmin?: GrantAdminChar;
  /** 是否記錄 ADMIN_REMOVED 事件 / Log an ADMIN_REMOVED Event */
  logEvent?: boolean;
  /** 額外寫入 ADMIN_REMOVED 事件 data 的欄位 / Extra fields merged into the ADMIN_REMOVED Event data */
  eventData?: Record<string, unknown>;
}

/**
 * 免職行政官：野心 +1、取消未到期的減免、記錄事件。
 * 免職事件（若記錄）由呼叫端決定，因為「被誰取代」等資訊只有呼叫端有。
 * Revoke the administrator post: +1 ambition, cancel any pending reduction,
 * log the event. Whether an ADMIN_REMOVED Event is written is the caller's
 * choice, since only the caller knows the succession context.
 */
export async function revokeAdmin(params: RevokeAdminParams): Promise<void> {
  const {
    worldId,
    round,
    place,
    char,
    newAdmin,
    logEvent = false,
    eventData,
  } = params;

  const current = await prisma.character.findUnique({
    where: { id: char.id },
    select: { ambition: true },
  });

  if (current !== null) {
    const newAmbition = Math.min(
      CONFIG.CHAR_AMBITION_MAX,
      current.ambition + CONFIG.AMBITION_ADMIN_REPLACED_DELTA
    );
    const appliedDelta = newAmbition - current.ambition;

    // 順帶清掉未到期的減免：免職已給 +1，若再回復會重複計算 /
    // Also cancel the pending reduction: removal already paid +1, so a later
    // revert would double-count
    await prisma.character.update({
      where: { id: char.id },
      data: { ambition: newAmbition, adminAmbitionRevertRound: null },
    });

    if (appliedDelta !== 0) {
      await prisma.ambitionEvent.create({
        data: {
          worldId,
          charId: char.id,
          round,
          delta: appliedDelta,
          reason: newAdmin
            ? `Removed as administrator of ${place.name} by ${newAdmin.name}`
            : `Removed as administrator of ${place.name}`,
        },
      });
    }
  }

  if (logEvent) {
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'ADMIN_REMOVED',
        data: {
          charId: char.id,
          charName: char.name,
          placeId: place.id,
          placeName: place.name,
          newAdminId: newAdmin?.id ?? null,
          newAdminName: newAdmin?.name ?? null,
          ...eventData,
        },
      },
    });
  }
}
