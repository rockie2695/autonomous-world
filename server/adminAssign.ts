// ============================================================================
// 行政官任命輔助 / Administrator Assignment Helpers
// ============================================================================
// 所有「指派 / 免職行政官」路徑共用的邏輯，讓規則只定義一次。
// Shared logic for every "grant / revoke administrator" path, so the rules are
// defined in exactly one place.
//
// 規則 / Rules:
// - 取得行政官職務 → 寫入一筆 -DEFECTION_ADMIN_ASSIGNED_DELTA 的 DefectionEvent
//   Granted the post → writes a -DEFECTION_ADMIN_ASSIGNED_DELTA DefectionEvent
//
//   **這是永久的帳本項目，沒有自動回復。** 「暫時減免、到期 +1 回復」整組機制已經移除：
//   欄位 `adminAmbitionRevertRound`（已刪）、`AMBITION_RECOVERED` 事件型態（從未被任何程式
//   寫出）、以及消費它的三個 UI 分支，都已一併刪除。不要在沒有讀過這段的情況下把它加回去。
//
//   This is a **permanent** ledger entry with no revert. The whole deduct-then-revert
//   machinery is gone: the `adminAmbitionRevertRound` column (dropped), the
//   `AMBITION_RECOVERED` event type (never emitted by anything) and the three UI branches
//   that consumed it were all deleted together. Do not reintroduce the revert without
//   reading this first.
// - 被免職 → 寫入一筆 +DEFECTION_ADMIN_REPLACED_DELTA 的 DefectionEvent
//   Removed from the post → writes a +DEFECTION_ADMIN_REPLACED_DELTA DefectionEvent
// - 指派與免職都會把該地的 Place.adminChangedRound 更新為該回合；**搬 seats 的清空
//   動作刻意不打點**（見 grantAdminTx）——舊地從來沒有過任何比較或 contest，只是
//   被人帶走了，它應該立刻就有資格被 AI 指派新領導
//   A grant or revoke stamps that place's adminChangedRound; the seat-clearing that
//   *moves* a seat deliberately does NOT stamp (see grantAdminTx) - the old place saw
//   no comparison and no contest, someone simply took the leader away, so it should be
//   immediately eligible for a new AI assignment
// - Place.administratorId 全域唯一（角色最多管一地），任命前必須先清除
//   該角色在其他地點的職務，避免唯一約束衝突
//   administratorId is globally unique (one seat per character), so a grant
//   must first clear the character's seat anywhere else.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';
import { inTransaction, type TxClient } from './tx';


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
 * 指派行政官：清掉他在別處的職務（**不打冷卻錨點**，見下）→ 更新地點
 * （含冷卻錨點）→ 更新升遷回合 → 記錄事件。
 * Grant the administrator post: clear his seat elsewhere (**without** a cooldown
 * stamp, see below) → update the place (stamping the cooldown anchor on the NEW
 * place) → record the promotion round → log events.
 *
 * 清空舊地為什麼**不**打點：搬 seat 不是舊地的「異動」——那裡沒有比較、沒有
 * 戰鬥，行政官只是把職務帶去了新地。冷卻的目的是「剛換過領導，讓安排安定」，
 * 而舊地什麼都沒換，只是空了；蓋上錨點會把它凍結十回合，40% 的行政官分成跟著
 * 沒人領。空出來的舊地因此在**下一回合**就重新有資格被 AI 指派（assignAdmins 的
 * `where` 過濾只看 `adminChangedRound`）。新地照樣打點——那裡才真的換了領導。
 *
 * Why clearing the old place does **not** stamp: moving a seat is not a "change" at
 * the old place — nothing was compared there, nothing was fought there, the
 * administrator simply carried the post to the new place. The cooldown exists so a
 * freshly changed seat settles; the old seat did not change, it merely emptied, and
 * stamping it would freeze the place for ten rounds with its 40% administrator share
 * left unpocketed. So the vacated place is eligible for a new AI assignment again as
 * early as **next round** (`assignAdmins`'s `where` filter reads only
 * `adminChangedRound`). The NEW place is stamped as before — that is where the leader
 * actually changed.
 */
export async function grantAdmin(params: GrantAdminParams): Promise<void> {
  await inTransaction((tx) => grantAdminTx(tx, params));
}

/**
 * 實際寫入 / The body, run inside one transaction.
 *
 * 岗位搬過了而野心沒扣是最害的半寫入：它會永久沒有回歸的回毫。 /
 * A seat that moves without the defectionBase delta is the worst kind of half-write: there
 * is then no scheduled revert, so the deduction is simply permanent.
 * 實際寫入 / The body, run inside one transaction.
 *
 * 岗位搬過了而野心沒扣，就永不會有回歸排安排。 /
 * A seat that moves without the defectionBase delta is the worst kind of half-write: no
 * revert is ever scheduled, so the deduction is simply permanent.
 */
async function grantAdminTx(
  tx: TxClient,
  { worldId, round, place, char, logEvent = true, eventData }: GrantAdminParams
): Promise<void> {
  // 清除該角色在其他地點的總督職（唯一約束）。**刻意不搬動 adminChangedRound**：
  // 搬 seat 不是舊地的「異動」——那裡沒有比較也沒有戰鬥，行政官只是把職務帶走了。
  // 打上錨點會讓 assignAdmins 把空著的舊地凍結整整十回合（`where` 只讀
  // `adminChangedRound`），40% 的行政官分成跟著沒人領。舊地下一回合立刻有資格
  // 被指派新行政官。
  //
  // Clear the character's seat elsewhere (unique constraint). **adminChangedRound is
  // deliberately left alone here**: moving a seat is not a "change" at the old place —
  // nothing was compared and nothing was fought there, the administrator simply carried
  // the post away. Stamping the anchor would freeze the now-empty old place for a full
  // ten rounds in `assignAdmins` (its `where` reads only `adminChangedRound`), with the
  // 40% administrator share left unpocketed the whole time. The old place becomes
  // eligible for a new administrator as early as next round.
  await tx.place.updateMany({
    where: {
      worldId,
      administratorId: char.id,
      id: { not: place.id },
    },
    data: { administratorId: null },
  });

  // 地點換領導：記錄行政官 + 冷卻錨點 / Place changes leader: administrator + cooldown anchor
  await tx.place.update({
    where: { id: place.id },
    data: { administratorId: char.id, adminChangedRound: round },
  });

  // 野心是**固定初始值**，不再被改寫。這裡因此只剩「記錄升遷回合」一件事：
  // 原本的「暫時扣 1、十回合後回 1」連同 adminAmbitionRevertRound 一併退休，
  // 而「升遷過沒有」仍會影響叛變值，所以 lastPromotedRound 必須照舊更新。
  //
  // The defection base is a fixed initial stat and is no longer rewritten. All that is left here is
  // recording the promotion round: the old temporary -1 and its scheduled revert, along with
  // adminAmbitionRevertRound, are retired together. "Has gone a while without promotion"
  // still feeds the defection value, so lastPromotedRound is still updated.
  await tx.character.update({
    where: { id: char.id },
    data: { lastPromotedRound: round },
  });

  if (logEvent) {
    await tx.event.create({
      data: {
        worldId,
        round,
        type: 'ADMIN_ASSIGNED',
        data: {
          charId: char.id,
          charName: char.name,
          placeId: place.id,
          placeName: place.name,
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
  /**
   * 這筆 delta 要餵給**哪一回合**的忠誠檢查；預設 = `round`（免職與檢查同一回合：
   * 出生指派是階段 2、手動指派寫的是下一個將跑的回合）。**佔領路徑必須傳
   * `round + 1`**：佔領發生在階段 10，而忠誠檢查是階段 8——同回合的檢查已經跑過，
   * 帳本行又只在它 `round` 欄位所指的那一回合被加總，不 +1 的話這筆
   * +DEFECTION_ADMIN_REPLACED_DELTA 永遠不會被任何一次擲骰算到。
   *
   * Which round's loyalty check this delta feeds; defaults to `round` (the removal
   * and the check share a round: the spawn path is phase 2, and the manual API
   * writes the next round that will run). **The capture path must pass
   * `round + 1`**: a capture happens in phase 10 while the loyalty check is phase
   * 8 — that round's check has already run, and a ledger row is only summed on the
   * round its `round` names, so without the +1 this
   * +DEFECTION_ADMIN_REPLACED_DELTA would never be counted by any roll.
   */
  ledgerRound?: number;
}

/**
 * 免職行政官：野心 +1、取消未到期的減免、記錄事件。
 * 免職事件（若記錄）由呼叫端決定，因為「被誰取代」等資訊只有呼叫端有。
 * Revoke the administrator post: +1 defectionBase, cancel any pending reduction,
 * log the event. Whether an ADMIN_REMOVED Event is written is the caller's
 * choice, since only the caller knows the succession context.
 */
export async function revokeAdmin(params: RevokeAdminParams): Promise<void> {
  await inTransaction((tx) => revokeAdminTx(tx, params));
}

/**
 * 實際寫入 / The body, run inside one transaction.
 *
 * 岗位搬過了而野心沒扣是最害的半寫入：它會永久沒有回歸的回毫。 /
 * A seat that moves without the defectionBase delta is the worst kind of half-write: there
 * is then no scheduled revert, so the deduction is simply permanent.
 * 實際寫入 / The body, run inside one transaction.
 *
 * 免職不搬岗位，風險在另一個地方： +1 已經入責，却沒清掉未到期的氚免。 /
 * Revoking moves no seat. The risk is the other one: the +1 lands but the pending
 * reduction is not cleared, so the scheduled revert would credit a second +1.
 */
async function revokeAdminTx(
  tx: TxClient,
  { worldId,
    round,
    place,
    char,
    newAdmin,
    logEvent = false,
    eventData,
    ledgerRound }: RevokeAdminParams
): Promise<void> {
  // 野心是**固定初始值**，免職不再改寫它；這裡只寫一筆帳本，讓忠誠檢查下回合把這筆
  // delta 加進叛變值。原本「順帶清掉未到期減免」的連帶動作也一起退休：現在根本不會
  // 再排定減免，所以沒有東西需要清。
  //
  // The defection base is a fixed initial stat, so removal no longer rewrites it; this only writes a
  // ledger row for `loyaltyCheck` to fold into next round's defection value. The old
  // side-effect of clearing a pending reduction retires with it: no reduction is ever
  // scheduled now, so there is nothing to clear.
  await tx.defectionEvent.create({
    data: {
      worldId,
      charId: char.id,
      // 帳本行記在**要餵的那一回合**（預設 = 免職的回合；佔領路徑 = 下一回合）/
      // The ledger row is stamped with the round it feeds (default: the removal's
      // round; the capture path: the next one)
      round: ledgerRound ?? round,
      delta: CONFIG.DEFECTION_ADMIN_REPLACED_DELTA,
      reason: newAdmin
        ? `Removed as administrator of ${place.name} by ${newAdmin.name}`
        : `Removed as administrator of ${place.name}`,
    },
  });

  if (logEvent) {
    await tx.event.create({
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
