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
import { placeIncome } from '@/lib/placeEffects';

/** 一次分配的結果 / The result of one split */
export interface IncomeSplit {
  /** 君王拿到的金錢 / Gold for the king */
  king: number;
  /** 行政官拿到的金錢 / Gold for the administrator */
  admin: number;
  /** 其他人平分的金額 / Amount shared equally among everyone else */
  others: number;
  /**
   * 三份的**有效**比例（含缺位吸收）。缺位者的份額由在場者接手，所以行政官的
   * 比例可能是 40%、70% 甚至 100%——彈窗要印的就是這個有效比例，印死「40%」
   * 會讓分成加總對不上餅，讀者以為錢憑空少了。
   *
   * The three shares' **effective** portions (absorption included). An absent
   * holder's share folds into whoever is present, so the administrator's portion
   * can be 40%, 70% or even 100% — the popup prints exactly these, and a hard
   * "40%" would make the rows fail to sum to the pie, reading as gold vanishing.
   */
  portions: {
    king: number;
    admin: number;
    others: number;
  };
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
 * 一個地方**本回合的實際產出**（整數金幣）：基礎 + 市場，再乘**行政官**的 jing 倍率。
 * A place's **actual output this round** in whole gold: base + market, scaled by the
 * **administrator's** jing multiplier.
 *
 * jing 的收入效果只有這一條——行政官的 jing 放大整塊餅。分配階段（splitIncome）
 * 對行政官不再重複乘，所以倍率在這裡**恰好作用一次**。沒有行政官時是基礎產出
 * （那個地方照樣生產，只是一分不發）。
 *
 * jing's income effect is exactly this: the administrator's jing scales the whole pie.
 * The split (splitIncome) does not multiply the administrator again, so the multiplier
 * applies **precisely once** here. With no administrator the output is the base (the
 * place still produces; it just pays nobody).
 *
 * **取整在這裡**：金幣永遠是整數——`Character.gold` 是 `Int` 欄位，而事件的「收益」
 * 也要印得出人話（不是 12.166666666666666）。
 * **Rounded here**: gold is always whole — `Character.gold` is an `Int` column, and the
 * event's income figure has to read as prose (not 12.166666666666666).
 */
export function placeOutput(market: number, adminJing: number | null): number {
  if (adminJing === null) return placeIncome(market);
  return Math.floor(placeIncome(market) * jingIncomeMultiplier(adminJing));
}

/**
 * 這一筆買多少：**tong 決定基準批量**（統領＝一次能籌集多大规模），隨機只在
 * +/-JITTER 內抖動。金幣與規格上限（100）是硬上限，買不到下限就不買（呼叫端的
 * `maxBuyable >= CHAR_BUY_TROOP_MIN` 閘門負責）。
 *
 * How big one purchase is: **tong decides the base batch** (leadership = the size of
 * a host you can raise at once), with the random only jittering within +/-JITTER.
 * Gold and the spec cap (100) are the hard limits; the caller's
 * `maxBuyable >= CHAR_BUY_TROOP_MIN` gate handles "cannot afford the minimum".
 *
 * 純函式（jitter 由呼叫端從 RNG 取 -1..1），可測：jitter 0 = 恰好基準批量。
 * Pure (the caller draws jitter from the RNG as -1..1), testable: jitter 0 lands
 * exactly on the base batch.
 */
export function purchaseBatch(
  tong: number,
  maxBuyable: number,
  jitter: number
): number {
  const base = Math.round(
    CONFIG.CHAR_BUY_TROOP_BASE * tongPurchaseMultiplier(tong)
  );
  const span = Math.round(base * CONFIG.CHAR_BUY_TROOP_JITTER);
  const raw = base + Math.round(span * jitter);
  // 夾限順序：先「買得起」（maxBuyable），再規格上限，最後批次下限——
  // 下限只在買得起 >= 10 時才可能生效（呼叫端的閘門保證）。
  // Clamp order: affordability first, then the spec cap, then the batch minimum —
  // the minimum can only bind when maxBuyable >= 10 (the caller's gate guarantees it).
  return Math.max(
    CONFIG.CHAR_BUY_TROOP_MIN,
    Math.min(CONFIG.CHAR_BUY_TROOP_MAX, maxBuyable, raw)
  );
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
 * @param income - 地點收入（**已**由呼叫端乘上行政官的 jing 倍率）/ The place's income (**already** scaled by the administrator's jing at the caller)
 * @param kingJing - 君王 jing，無君王時為 null / The king's jing, null when there is no king
 * @param adminJing - 行政官 jing，**只用於在職判定**（null = 缺席）；他的 jing 倍率
 *   已經放大整塊收入，這裡再乘就是平方 / The administrator's jing, used **only for the
 *   vacancy check** (null = absent); his jing multiplier already scaled the whole
 *   income, and applying it here again would square it
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
    return {
      king: 0,
      admin: 0,
      others: 0,
      portions: { king: 0, admin: 0, others: 0 },
    };
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

  // 君王份額：有君王就是 30%，沒有就併入行政官。君王的 **jing 值**在這裡不參與——
  // 只判斷他在不在位。一個地方的收入只受**行政官的 jing**影響（呼叫端已用它放大
  // 整塊餅），君王的 30% 是變大後的餅的**固定抽成**。這讓「每個 jing 至多作用一次」
  // 结构上成立：開國君王通常自己就是行政官，同一個人的 jing 若在餅上、又在份額上
  // 各作用一次就是 ×jing²。
  //
  // The king's share: 30% when he exists, otherwise folded into the administrator.
  // The king's **jing value** plays no part here — only whether he is on the throne.
  // A place's income is affected by the **administrator's jing alone** (the caller
  // already scaled the whole pie with it), and the king's 30% is a **flat cut** of
  // that grown pie. This makes "every jing applies at most once" *structural*: the
  // founding king is usually the administrator himself, and the same person's jing
  // acting on both the pie and the share would be ×jing².
  const kingPortion = kingJing === null ? 0 : kingShare;
  // 行政官份額：自己的 40%，外加沒有君王時的 30%、沒有其他人時的 30%
  // The administrator's share: their own 40%, plus the king's 30% when vacant and the
  // others' 30% when there is nobody else to share it with
  const adminPortion =
    CONFIG.INCOME_ADMIN_SHARE + (kingJing === null ? kingShare : 0) + (hasOthers ? 0 : othersShare);

  // 比例是**結構性**的（總和 ≤ 100%）：君王在場時 30 + 40 + 30 = 100；君王缺席時
  // 行政官最多 70 + 30 = 100。沒有任何倍率會再加乘（jing 的收入效果只有「行政官
  // 放大整塊餅」一條，已在呼叫端作用），所以**不需要**比例縮回——floor 的餘數由
  // 「其他人」吸收，三份照樣加總等於收入。
  //
  // The shares are **structural** (their sum ≤ 100%): king present 30 + 40 + 30 = 100;
  // king absent admin at most 70 + 30 = 100. No multiplier adds on top any more (jing's
  // only income effect — the administrator scaling the whole pie — already happened at
  // the caller), so **no proportional scale-back is needed**: the floor remainders are
  // absorbed by "everyone else", and the three shares still sum to the income.
  // 每一份都取整：金幣永遠是整數，**包括**沒有其他人時的 `income − king`（收入若帶
  // 小數，這裡曾經吐出 9.166666666666668）。
  // Every share is floored: gold is always whole — **including** the no-others
  // `income − king` (with a fractional income this branch once produced
  // 9.166666666666668).
  const king = Math.floor(income * kingPortion);
  const admin = Math.floor(income * adminPortion);

  // 有效比例（含缺位吸收）一次算好，三個回傳路徑共用——彈窗印的就是這三個數。
  // The effective portions (absorption included), computed once and shared by all
  // three return paths — these are exactly what the popup prints.
  const portions = {
    king: kingPortion,
    admin: adminPortion,
    others: hasOthers ? othersShare : 0,
  };

  if (!hasOthers) {
    // 沒有其他人可分時，餘額歸行政官——否則那筆錢會**憑空消失**，
    // 而這個函式的整個重點就是總額必定等於 income。
    //
    // With nobody else to share with, the leftover goes to the administrator —
    // otherwise that gold simply **vanishes**, and the whole point of this function is
    // that the shares sum to `income`.
    return { king, admin: Math.floor(income - king), others: 0, portions };
  }

  // 「其他人」永遠是剩餘額，所以三份加起來必定等於 income /
  // "Everyone else" is always the remainder, so the three shares sum to `income`
  return { king, admin, others: Math.floor(income - king - admin), portions };
}

/**
 * 這個地方的「其他人」是誰：**受控勢力**裡、既不是君王也不是行政官的存活將領。
 * 異勢力的將領（入侵者、過客）不領這個地方的錢——他們不是這裡的人；他們站的
 * 地方是別人的，收入自然也是別人的。回傳空陣列代表「其他人」那份無人可分，
 * splitIncome 會把它併給行政官。
 *
 * Who counts as "everyone else" at a place: the **controlling faction's** living
 * leaders other than the king and the administrator. A leader of another faction
 * (an invader, a passer-by) is not paid from this place — they are not its
 * people; the ground they stand on belongs to someone else, and so does its
 * income. An empty array means the "others" bucket has nobody to pay and
 * splitIncome folds it into the administrator's share.
 *
 * 純函式，模擬（economy）與地點彈窗（本回合分成）**共用同一份**——預覽與模擬
 * 各寫一份，遲早會對不上。
 *
 * Pure; the simulation (economy) and the place popup (本回合分成) **share this
 * one definition** — a preview that restates the rule separately will drift.
 */
export function othersOf<T extends { id: string; factionId: string | null }>(
  chars: ReadonlyArray<T>,
  placeFactionId: string | null,
  kingId: string | null,
  adminId: string | null
): T[] {
  if (!placeFactionId) return [];
  return chars.filter(
    (c) => c.factionId === placeFactionId && c.id !== kingId && c.id !== adminId
  );
}
