// ============================================================================
// 收入分配（純函式）
// Income Split (pure)
// ============================================================================
// 地點收入怎麼分給君王、總督與其他角色。獨立成純函式有兩個原因：
//   1. 好測試 —— 不需要資料庫 / testable without a database
//   2. 規則集中 —— 「jing 如何影響收入」只有這裡定義 /
//      the rule lives in exactly one place
//
// jing = 經濟（領導者的經濟能力），不是「智力」也不是「策略」。
// jing is a leader's ECONOMIC power — it is not "intelligence" or "strategy".
// 規則 / Rule:
//   領導者份額 = 份額比例 × (1 + (jing − INCOME_JING_MIDPOINT) / CHAR_ABILITY_MAX)
//   A leader's cut = share × (1 + (jing − INCOME_JING_MIDPOINT) / CHAR_ABILITY_MAX)
// 以「平均」為基準，所以一般將領與舊規則完全相同；高 jing 多拿、低 jing 少拿。
// Centred on the average, so an average leader matches the old rule exactly —
// a high-jing leader pockets more and a low-jing one less.
// jing 相同時結果也與舊規則相同 / equal jing also reproduces the old split
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

/** 一次分配的結果 / The result of one split */
export interface IncomeSplit {
  /** 君王拿到的金錢 / Gold for the king */
  king: number;
  /** 總督拿到的金錢 / Gold for the administrator */
  admin: number;
  /** 其他人平分的金額 / Amount shared equally among everyone else */
  others: number;
}

/**
 * jing 的收入倍率：以平均值為 1，高於平均就放大、低於平均就縮小。
 * The income multiplier a leader's jing buys: 1 at the average, more above, less below.
 *
 * 沿用戰鬥公式的寫法（wu / tong 也是 `× (1 + x/30)`），只是改成以平均值為中心。
 * Follows the battle formulas' shape (wu / tong also use `× (1 + x/30)`), but
 * centred on the average instead of zero.
 *
 * 下限 0：倍率不會變成負數 / Floored at 0, so a multiplier can never go negative
 *
 * @param jing - 領導者的 jing / The leader's jing
 * @returns 收入倍率（≥ 0）/ The multiplier (≥ 0)
 */
export function jingIncomeMultiplier(jing: number): number {
  const centred =
    1 +
    (Math.max(0, jing) - CONFIG.INCOME_JING_MIDPOINT) / CONFIG.CHAR_ABILITY_MAX;
  return Math.max(0, centred);
}

/**
 * 把一筆地點收入分給君王、總督與其他人。
 * Split one place's income between the king, the administrator and everyone else.
 *
 * `null` 代表該位置沒有這個人；`0` 代表「有這個人但 jing 未知／為零」。
 * `null` means the seat is vacant; `0` means the leader exists with unknown or
 * zero jing.
 *
 * 保證：分配總額永遠等於 income（不會印錢、也不會出現負數）/
 * Guarantees the three shares always sum to `income` — no gold is created and no
 * share can go negative.
 *
 * @param income - 地點收入 / The place's income
 * @param kingJing - 君王 jing，無君王時為 null / The king's jing, null when there is no king
 * @param adminJing - 總督 jing，無總督時為 null / The admin's jing, null when there is no admin
 * @returns 三方應得的金額 / What each side receives
 */
export function splitIncome(
  income: number,
  kingJing: number | null,
  adminJing: number | null
): IncomeSplit {
  // 單一領導者本來就獨得全部，不套倍率（否則會印錢）/
  // A lone leader already receives everything, so no multiplier (it would mint gold)
  if (kingJing === null && adminJing === null) {
    return { king: 0, admin: 0, others: income };
  }
  if (adminJing === null) {
    return { king: income, admin: 0, others: 0 };
  }
  if (kingJing === null) {
    return { king: 0, admin: income, others: 0 };
  }

  const kingRaw =
    income * CONFIG.INCOME_KING_SHARE * jingIncomeMultiplier(kingJing);
  const adminRaw =
    income * CONFIG.INCOME_ADMIN_SHARE * jingIncomeMultiplier(adminJing);
  const requested = kingRaw + adminRaw;

  // 兩人同時高 jing 時加總可能超過地點收入：按比例縮回，維持兩人的相對高低 /
  // Two high-jing leaders can together exceed the place's income, so scale both
  // back proportionally — that preserves which of the two is richer
  const scale = requested > income ? income / requested : 1;
  const king = Math.floor(kingRaw * scale);
  const admin = Math.floor(adminRaw * scale);

  return { king, admin, others: income - king - admin };
}
