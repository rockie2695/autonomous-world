// ============================================================================
// 屬性效果（純邏輯）/ Ability effects (pure)
// ============================================================================
// 彈窗必須引用「模擬實際使用」的數字，而那些算式散在 battle.ts 與 income.ts。
// 這裡把**彈窗會引用**的部分收攏：攻擊與防禦倍率在這裡定義——讀的是 battle.ts
// 用的**同一份** CONFIG 常數（`BATTLE_ATK_WU_MULT` / `BATTLE_DEF_TI_MULT`），不是
// 重述一個魔術數字；購兵與收入倍率直接轉出 server/income.ts 的既有定義；叛變
// 機率轉出 src/lib/defection.ts。規則只有一份，彈窗不重述公式。
//
// A popup may only quote a number the simulation actually uses, and those
// formulas live in battle.ts and income.ts. This module collects what a popup
// quotes: the attack and defence multipliers are defined here — reading the
// *same* CONFIG constants battle.ts reads (`BATTLE_ATK_WU_MULT` /
// `BATTLE_DEF_TI_MULT`), not restating a magic number; the purchase and income
// multipliers are re-exported from server/income.ts; the defection chance from
// src/lib/defection.ts. One definition; popups never restate a formula.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

export { jingIncomeMultiplier, tongPurchaseMultiplier } from '../../server/income';
export { defectionChance } from '@/lib/defection';

/**
 * 武力對攻擊力的倍率：battle.ts 算 `兵力 × (1 + wu × BATTLE_ATK_WU_MULT)`，
 * 這裡回傳其中 `(1 + wu × BATTLE_ATK_WU_MULT)` 的部分 /
 * The wu part of battle.ts's `troops × (1 + wu × BATTLE_ATK_WU_MULT)` —
 * this returns that `(1 + wu × BATTLE_ATK_WU_MULT)` factor.
 */
export function attackMultiplier(wu: number): number {
  return 1 + wu * CONFIG.BATTLE_ATK_WU_MULT;
}

/**
 * 體魄對防禦力的倍率：battle.ts 算 `兵力 × (1 + ti × BATTLE_DEF_TI_MULT)`，
 * 這裡回傳其中 `(1 + ti × BATTLE_DEF_TI_MULT)` 的部分 /
 * The ti part of battle.ts's `troops × (1 + ti × BATTLE_DEF_TI_MULT)` —
 * this returns that `(1 + ti × BATTLE_DEF_TI_MULT)` factor.
 */
export function defenceMultiplier(ti: number): number {
  return 1 + ti * CONFIG.BATTLE_DEF_TI_MULT;
}
