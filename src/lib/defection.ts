import { CONFIG } from '@/lib/gameConfig';

// ============================================================================
// 叛變值與叛變機率（純邏輯）/ Defection value and chance (pure)
// ============================================================================
//
// 野心 `Character.defectionBase` 是**固定的初始值**（5-30，和 ti／wu／tong 一樣），
// 不再被事件改寫。真正每回合變動的是「叛變值」，而它是**算出來的，不存資料庫**。
//
// The defection base is a fixed initial stat (5-30, like ti / wu / tong) and is no longer rewritten by
// events. What actually moves each round is the **defection value**, which is *computed* and
// deliberately **never stored**.
//
// 為什麼不存 / Why it is not stored
// ---------------------------------------------------------------------------
// 存下來等於多一份必須同步的狀態：忠誠標籤可能換、DefectionEvent 可能被補登或回填，
// 而這個值是它們的**函數**。把它算出來，就沒有東西可能不同步。
//
// Storing it would mean a second piece of state that has to be kept in sync: the loyalty tag
// can change, an DefectionEvent can be backfilled, and this value is a *function* of both.
// Computing it means there is nothing that can drift.
//
// 公式 / The formula
// ---------------------------------------------------------------------------
//     value  = defectionBase
//            + (忠誠標籤與君王不同 ? 2 : 0)
//            + 本回合的 DefectionEvent 筆數 × 1
//
//     chance = (value − 17.5) / 17.5 × 0.05
//
// 17.5 是 5–30 的中點，所以**平均野心恰好等於基底機率**，而且離平均越遠機率越線性。
// 這個中點是從範圍推出來的，不是寫死的魔術數字——改了野心上下限，這裡會跟著動。
//
// 17.5 is the midpoint of 5-30, so **an average defection base is exactly the base rate** and the
// chance scales linearly either side of it. The midpoint is derived from the range rather
// than hardcoded, so changing the defectionBase bounds moves it automatically.
// ============================================================================

/**
 * 野心 5–30 的中點；叛變機率以它為零點 / Midpoint of the 5–30 defectionBase range; the chance's zero point
 */
export const DEFECTION_MIDPOINT =
  (CONFIG.CHAR_DEFECTION_BASE_MIN + CONFIG.CHAR_DEFECTION_BASE_MAX) / 2;

/** 計算叛變值所需的輸入 / What the defection value is computed from */
export interface DefectionInput {
  /** 固定的初始野心 / The fixed initial defectionBase */
  defectionBase: number;
  /** 忠誠標籤與君王不同 / The loyalty tag differs from the king's */
  loyaltyMismatch: boolean;
  /**
   * 本回合此人的 DefectionEvent **delta 總和**（不是筆數）。
   *
   * 每筆事件各有各的差值，所以這裡加總 delta：+1 的兩筆就是 +2，但 -2 的一筆就是 -2。
   * 這是「照著資料算」而不是「照著規則猜」。
   *
   * The **sum of the deltas** of this character's DefectionEvents this round, not a count.
   *
   * Each event carries its own magnitude, so the deltas are summed: two +1 events are +2,
   * while a single -2 is -2. That is reading the data rather than guessing a rule.
   */
  eventDeltaSum: number;
}

/**
 * 叛變值 / The defection value
 *
 * 只有忠誠標籤是寫死的：它是 `Loyalty` 標籤的**比較**，不會產生 DefectionEvent，
 * 所以沒有 delta 可加，只能用常數。而事件影響全部來自資料庫的真實 delta。
 *
 * Only the loyalty tag is hardcoded: it is a *comparison* of `Loyalty` tags that never
 * produces an DefectionEvent, so there is no delta to add and a constant is the only option.
 * Everything event-shaped comes from real deltas in the database.
 */
export interface DefectionBreakdown {
  /** 基礎：野心（固定初始值）/ the base: the fixed initial ambition */
  base: number;
  /** 忠誠標籤與君王不同的罰分（CONFIG.DEFECTION_VALUE_LOYALTY_PENALTY）/
   * The loyalty-mismatch penalty (CONFIG.DEFECTION_VALUE_LOYALTY_PENALTY) */
  loyaltyPenalty: number;
  /** 本回合帳本 delta 總和（可負）/ this round's ledger delta total (can be negative) */
  eventDelta: number;
  /** 合計 / the total */
  total: number;
}

/**
 * 叛變值的**構成**：三個部分各自攤開，讓彈窗的 tooltip 能顯示「怎麼算出來的」。
 * `defectionValue` 委托這裡——值與明細**同出一源**，不可能漂移。
 *
 * The **breakdown** of the defection value: the three parts laid out so the popup's
 * tooltip can show *how it was computed*. `defectionValue` delegates here — the
 * value and the breakdown come from **one source** and cannot drift.
 */
export function defectionBreakdown(input: DefectionInput): DefectionBreakdown {
  const loyaltyPenalty = input.loyaltyMismatch
    ? CONFIG.DEFECTION_VALUE_LOYALTY_PENALTY
    : 0;
  return {
    base: input.defectionBase,
    loyaltyPenalty,
    eventDelta: input.eventDeltaSum,
    total: input.defectionBase + loyaltyPenalty + input.eventDeltaSum,
  };
}

export function defectionValue(input: DefectionInput): number {
  return defectionBreakdown(input).total;
}

/**
 * 叛變值 → 每回合機率（0..1）/ Defection value to a per-round probability (0..1)
 *
 * 低於中點時是 0，而不是負數：負的機率在擲骰上沒有意義，而「低於平均就不叛變」正是
 * 這條規則想說的話。回傳 0 也讓呼叫端不必自己判斷。
 *
 * Below the midpoint it is 0 rather than negative: a negative probability is meaningless to
 * roll against, and "below average, no defection" is exactly what the rule is saying.
 * Returning 0 also saves the caller from checking.
 */
export function defectionChance(value: number): number {
  const scaled =
    (value - DEFECTION_MIDPOINT) / DEFECTION_MIDPOINT * CONFIG.DEFECTION_BASE_RATE;
  return scaled > 0 ? Math.min(scaled, 1) : 0;
}
