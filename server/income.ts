// ============================================================================
// 收入分配（純函式）
// Income Split (pure)
// ============================================================================
// 地點收入怎麼分給君王、行政官與其他角色。獨立成純函式有兩個原因：
//   1. 好測試 —— 不需要資料庫 / testable without a database
//   2. 規則集中 —— 「jing 如何影響收入」只有這裡定義 /
//      the rule lives in exactly one place
//
// 分配比例 / The shares:
//   君王 30% · 行政官 40% · 其他角色 30%（平分）
//   King 30% · Administrator 40% · Everyone else 30% (shared equally)
//
// **沒有行政官就誰都不拿**。這是刻意的：行政官是「實際管事的人」，沒有他代表這個地方
// 根本沒有人治理，把錢自動轉給國王等於讓一個不在場的人白拿。錢留在地方上。
//
// **No administrator means nobody is paid.** This is deliberate: the administrator is the
// person actually running the place, so without one the place is ungoverned, and quietly
// routing the money to a distant king would pay someone who is not there. It stays put.
//
// 其餘兩種缺位：缺席的人那份由**在場的人**接手（因為總額固定，錢不能憑空消失）/
// For the other two gaps: whoever is absent has their share absorbed by whoever is present,
// because the total is fixed and gold cannot vanish.
//
// jing = 經濟（領導者的經濟能力），不是「智力」也不是「策略」。
// jing is a leader's ECONOMIC power — it is not "intelligence" or "strategy".
// 規則 / Rule:
//   領導者份額 = 份額比例 × (1 + (jing − INCOME_JING_MIDPOINT) / CHAR_ABILITY_MAX)
//   A leader's cut = share × (1 + (jing − INCOME_JING_MIDPOINT) / CHAR_ABILITY_MAX)
// 以「平均」為基準，所以一般將領的倍率是 1.0；高 jing 多拿、低 jing 少拿。
// Centred on the average, so an average leader's multiplier is 1.0 — a high-jing leader
// pockets more and a low-jing one less.
// jing 相同時結果也與比例完全一致 / equal jing also reproduces the plain share
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

/** 一次分配的結果 / The result of one split */
export interface IncomeSplit {
  /** 君王拿到的金錢 / Gold for the king */
  king: number;
  /** 行政官拿到的金錢 / Gold for the administrator */
  admin: number;
  /** 其他人平分的金額 / Amount shared equally among everyone else */
  others: number;
}

/**
 * jing 的收入倍率：以平均值為 1，高於平均就放大、低於平均就縮小。
 * The income multiplier a leader's jing buys: 1 at the average, more above, less below.
 *
 * 沿用戰鬥公式的寫法（wu / ti / tong 都是 `× (1 + x/30)`），只是改成以平均值為中心。
 * Follows the battle formulas' shape (wu / ti / tong also use `× (1 + x/30)`), but
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
 * tong（統領）對「單次購兵量」的倍率：以平均值為 1，高於平均就買得到更多、低於平均就少一點。
 * The multiplier tong buys on the size of a **single troop purchase**: 1 at the average,
 * more above, less below.
 *
 * 這裡**刻意**與 {@link jingIncomeMultiplier} 同一個形狀。jin 只決定收入裡分到多少，
 * tong 只決定一次買得到幾個兵 —— 兩者都是「同一個平均值為中心」的乘數，所以規則好記，
 * 數值也對稱。tong **不**影響防禦（那是 體魄 / ti 的事），也**不**影響叛變機率。
 *
 * This is deliberately the same shape as {@link jingIncomeMultiplier}. jing only decides how
 * much of the income a leader pockets, and tong only decides how many troops one purchase
 * can buy — both are multipliers centred on the same average, which keeps the rule easy to
 * remember and symmetric to read. tong does **not** affect defence (that is 體魄 / ti) and
 * does **not** affect defection.
 *
 * 下限 0：倍率不會變成負數 / Floored at 0, so a multiplier can never go negative
 *
 * @param tong - 領導者的 tong / The leader's tong
 * @returns 購兵量倍率（≥ 0）/ The purchase-size multiplier (≥ 0)
 */
export function tongPurchaseMultiplier(tong: number): number {
  const centred =
    1 +
    (Math.max(0, tong) - CONFIG.INCOME_TONG_MIDPOINT) / CONFIG.CHAR_ABILITY_MAX;
  return Math.max(0, centred);
}

/**
 * 把一筆地點收入分給君王、行政官與其他人。
 * Split one place's income between the king, the administrator and everyone else.
 *
 * `null` 代表該位置沒有這個人；`0` 代表「有這個人但 jing 未知／為零」。
 * `null` means the seat is vacant; `0` means the leader exists with unknown or
 * zero jing.
 *
 * 保證：分配總額永遠等於 income，或在沒有行政官時等於 0（不會印錢、不會有負數）/
 * Guarantees the shares always sum to `income` — or to 0 when there is no
 * administrator. No gold is created and no share can go negative.
 *
 * @param income - 地點收入 / The place's income
 * @param kingJing - 君王 jing，無君王時為 null / The king's jing, null when there is no king
 * @param adminJing - 行政官 jing，無行政官時為 null / The admin's jing, null when there is no admin
 * @param othersCount - 其他角色人數（決定 30% 給誰）/ How many other characters there are
 * @returns 三方應得的金額 / What each side receives
 */
export function splitIncome(
  income: number,
  kingJing: number | null,
  adminJing: number | null,
  othersCount: number = 0
): IncomeSplit {
  // ── 沒有行政官 → 誰都不拿 ──
  // 這個判斷必須在最前面：它是唯一會讓總額變成 0 的分支，後面每個算式都假定總額要分完。
  //
  // No administrator → nobody is paid. This test has to come first: it is the only branch
  // that zeroes the total, and every calculation below assumes the total gets distributed.
  if (adminJing === null) {
    return { king: 0, admin: 0, others: 0 };
  }

  // 缺席者的份額由在場者接手，比例先合併再套倍率。這樣「沒有其他人」時行政官拿到
  // 30% + 40% = 70%，而倍率只作用一次，不會被重複放大。
  //
  // An absent holder has their share folded into whoever is present, and the multiplier is
  // applied once to the combined figure. So with no other characters the administrator
  // receives 30% + 40% = 70%, and their jing scales that 70% exactly once rather than twice.
  const kingShare = CONFIG.INCOME_KING_SHARE;
  const othersShare = CONFIG.INCOME_OTHER_SHARE;
  const hasOthers = othersCount > 0;

  // 君王份額：有君王就是 30%，沒有就併入行政官 /
  // The king's share: 30% when he exists, otherwise folded into the administrator
  const kingPortion = kingJing === null ? 0 : kingShare;
  // 行政官份額：自己的 40%，外加沒有君王時的 30%、沒有其他人時的 30%
  // The administrator's share: their own 40%, plus the king's 30% when vacant and the
  // others' 30% when there is nobody else to share it with
  const adminPortion =
    CONFIG.INCOME_ADMIN_SHARE + (kingJing === null ? kingShare : 0) + (hasOthers ? 0 : othersShare);

  const kingRaw = income * kingPortion * jingIncomeMultiplier(kingJing ?? 0);
  const adminRaw = income * adminPortion * jingIncomeMultiplier(adminJing);
  const requested = kingRaw + adminRaw;

  // 兩人同時高 jing 時加總可能超過地點收入：按比例縮回，維持兩人的相對高低 /
  // Two high-jing leaders can together exceed the place's income, so scale both
  // back proportionally — that preserves which of the two is richer
  const scale = requested > income ? income / requested : 1;
  const king = Math.floor(kingRaw * scale);

  if (!hasOthers) {
    // 沒有其他人可分時，縮回剩下的餘額歸行政官——否則那筆錢會**憑空消失**，
    // 而這個函式的整個重點就是總額必定等於 income。
    //
    // With nobody else to share with, the leftover from the scale-back goes to the
    // administrator — otherwise that gold simply **vanishes**, and the whole point of this
    // function is that the shares sum to `income`.
    return { king, admin: income - king, others: 0 };
  }

  // 「其他人」永遠是剩餘額，所以三份加起來必定等於 income /
  // "Everyone else" is always the remainder, so the three shares sum to `income`
  const admin = Math.floor(adminRaw * scale);
  return { king, admin, others: income - king - admin };
}
