// ============================================================================
// 戰報的建構 / Building a battle report
// ----------------------------------------------------------------------------
// 純邏輯，不碰資料庫，所以可以直接測。
//
// Pure logic with no database access, so it is directly testable.
//
// 為什麼要抽出來 / Why this is its own module
// 佔領事件的算式原本寫在 `battle.ts` 裡的三個分支（攻下、被擊退、無守軍）。那支檔案在
// 載入時就建立 prisma client，所以想測這段邏輯就必須連上資料庫——而「無守軍時 report
// 必須是 null」正是最需要被鎖住的一條規則。抽成純函式之後，三種情況都能在沒有資料庫的
// 情況下斷言。
//
// The arithmetic used to live in three branches inside `battle.ts` (assault, repelled, no
// defenders). That file builds a prisma client at import time, so testing the logic meant
// needing a database — and "report must be null when there were no defenders" is exactly
// the rule most worth locking down. As a pure function, all three cases can be asserted
// with no database at all.
// ============================================================================

/**
 * 一場交戰的算式 / the arithmetic of one engagement.
 *
 * `[key: string]` 是為了讓這個物件能直接存進 Prisma 的 `Json` 欄位：`InputJsonObject`
 * 需要索引簽章，否則型別不相容（而且不該用 `as any` 繞過）。
 *
 * The index signature is what lets this object be stored straight into a Prisma `Json`
 * column: `InputJsonObject` requires one, and the alternative would be an `as any` cast.
 */
export interface BattleReportParts {
  [key: string]: number;
  attackerTroops: number;
  attackerWu: number;
  attackRoll: number;
  attackPower: number;
  defenderGarrison: number;
  defenderFortress: number;
  defenceRoll: number;
  defencePower: number;
}

/** 戰報的結果 / the outcome of an engagement */
export type BattleOutcome = 'assault' | 'repelled' | 'no_defenders';

/** 戰報：算式 + 結果，或 `null`（無守軍）/ a report, or `null` for the no-defender case */
export interface BattleReport {
  [key: string]: number | string;
  attackerTroops: number;
  attackerWu: number;
  attackRoll: number;
  attackPower: number;
  defenderGarrison: number;
  defenderFortress: number;
  defenceRoll: number;
  defencePower: number;
  outcome: BattleOutcome;
}

/**
 * 建立戰報 / Build a battle report.
 *
 * **無守軍回傳 `null`，那是刻意的**：那一格空著就是「根本沒打過」這個事實。若給它一組
 * 全 0 的算式，戰報會顯示一場「0 打 0」的戰鬥，而那不是發生過的事。
 *
 * **No defenders returns `null`, deliberately**: the blank *is* the fact that no fight
 * happened. Filling in zeros would show a "0 vs 0" battle, which is not what occurred.
 *
 * @param outcome - 結果 / the outcome
 * @param parts - 算式；無守軍時為 null / the arithmetic, null when there were no defenders
 * @returns 戰報或 null / the report, or null
 */
export function buildBattleReport(
  outcome: BattleOutcome,
  parts: BattleReportParts | null,
): BattleReport | null {
  // 兩個條件任一成立都回 null：沒有算式，或結果本身就是「無守軍」。兩者都代表沒打過，
  // 所以不該有算式。/ Either condition yields null: no arithmetic, or the outcome *is* the
  // no-defender case. Both mean no fight happened, so there must be no arithmetic.
  if (outcome === 'no_defenders' || parts === null) return null;
  return { ...parts, outcome };
}
