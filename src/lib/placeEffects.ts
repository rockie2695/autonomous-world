// ============================================================================
// 地方效果（純邏輯）
// Place effects (pure)
// ============================================================================
// 堡壘、市場、兵營各級到底有什麼效果、升一級要多少錢、這個地方每回合產出多少駐軍與
// 收入——全部集中在這裡，UI、`build.ts`、`economy.ts` 與 `battle.ts` 都讀同一份。
//
// What each fortress / market / barracks level actually does, what the next upgrade costs,
// and how much garrison and income a place yields per round. One definition, read by the UI,
// `build.ts`, `economy.ts` and `battle.ts` — so the popup can never quote a number the
// simulation does not actually use.
//
// 不碰 React、也不碰 canvas，所以可以直接測。/ No React and no canvas, so it is testable as-is.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

/** 三種建築 / The three buildings */
export type BuildingKind = 'fortress' | 'market' | 'barracks';

/** 所有建築的等級上限；`build.ts` 也讀這裡 / Max level for every building; `build.ts` reads this too */
export const BUILDING_MAX_LEVEL = 5;

/** 升到下一級要多少金（`level` 是**目前**等級）/ Gold to reach the next level, from the current one */
export function upgradeCost(level: number): number {
  return CONFIG.BUILDING_UPGRADE_COST_BASE * Math.pow(CONFIG.BUILDING_UPGRADE_COST_MULT, level);
}

/**
 * 從 `level - 1` 升到 `level` 這**一步**要多少金；0 級沒有前一步，回傳 null。
 * Gold for the **single step** from `level - 1` up to `level`; null at level 0, which has
 * no step before it.
 *
 * **為什麼是「一步」而不是累計？** 這正是讀者回報的那個錯誤：等級清單原本印
 * `totalCostToReach(2)` = 300（100 + 200），而同一個目標在卡片上印 200，`build.ts`
 * 也真的收 200。於是同一件事有兩個價錢，其中一個還不是會被收到的。
 *
 * **Why one step and not a running total?** This is the bug the reader reported. The level
 * list used to print `totalCostToReach(2)` = 300 (100 + 200) while the card beside it
 * printed 200 — and 200 is what `build.ts` actually charges. Two prices for one upgrade,
 * one of which nobody is ever billed.
 *
 * 一張列出各級價格的表，印的必須是**會被收到的**那個數字；否則它就不是價格表。
 * A price list has to print the number that gets charged, or it is not a price list.
 *
 * 這個 `- 1` 之前直接寫在 JSX 裡，所以「清單印的」與「收費的」是兩個各自寫死的表達式，
 * 沒有任何東西把它們綁在一起——這正是分歧能存在的原因。收進來之後兩邊共用同一個函式。
 * The `- 1` used to sit inline in the JSX, so "what the list prints" and "what gets
 * charged" were two independently written expressions with nothing binding them — which is
 * how they came to disagree.
 */
export function costToReachLevel(level: number): number | null {
  if (level <= 0) return null;
  return upgradeCost(level - 1);
}

/**
 * 這一級的**每級**效果，單位隨建築而異。
 * The per-level effect of one building. The unit differs per building, so it is returned
 * alongside a key rather than a bare number.
 */
export function buildingPerLevel(kind: BuildingKind): { value: number; unit: 'percent' | 'gold' | 'troops' } {
  switch (kind) {
    case 'fortress':
      // 堡壘：每級 +20% 防禦力（乘在守軍上）
      // Fortress: +20% defence per level, multiplied onto the garrison
      return { value: CONFIG.BATTLE_FORTRESS_DEF_MULT * 100, unit: 'percent' };
    case 'market':
      // 市場：每級 +5 金收入
      // Market: +5 gold of income per level
      return { value: CONFIG.PLACE_MARKET_INCOME_PER_LV, unit: 'gold' };
    case 'barracks':
      // 兵營：每級 +3 名徵兵
      // Barracks: +3 recruits per level
      return { value: CONFIG.PLACE_BARRACKS_RECRUIT_PER_LV, unit: 'troops' };
  }
}

/** 累積到 `level` 級的**總效果** / The total effect accumulated up to `level` */
export function buildingTotal(kind: BuildingKind, level: number): number {
  return buildingPerLevel(kind).value * level;
}

/** 堡壘等級帶來的防禦倍率（`def` 乘上它）/ The defence multiplier a fortress level grants */
export function fortressDefenceMult(fortress: number): number {
  return 1 + buildingTotal('fortress', fortress) / 100;
}

/** 這個地方每回合的總收入 / This place's total income per round */
export function placeIncome(market: number): number {
  return CONFIG.PLACE_BASE_INCOME + buildingTotal('market', market);
}

/** 這個地方每回合徵到的駐軍 / The garrison this place recruits per round */
export function placeRecruits(barracks: number): number {
  return CONFIG.PLACE_BASE_RECRUIT + buildingTotal('barracks', barracks);
}

/** 升到下一級會多出多少（已是最高級則為 null）/ What the next upgrade adds, or null at max */
export function nextUpgradeGain(kind: BuildingKind, level: number): number | null {
  if (level >= BUILDING_MAX_LEVEL) return null;
  return buildingPerLevel(kind).value;
}

/**
 * 這一級時，這個地方**每回合實際產出多少**（不是這一棟建築自己的貢獻）。
 *
 * 這一點很容易搞錯，而錯的結果不是難看而是**誤導**：市場 0 級時
 * `buildingTotal` 是 0，但地方每回合照樣有 `PLACE_BASE_INCOME` 的基礎收入。
 * 提示若印 0，讀者會以為市場 0 等於零收入，於是低估這一棟建築一點用都沒有。
 * 印 10 才是「此地此刻每回合總共產出多少」。
 *
 * What this place actually yields per round at `level` — not this one building's own
 * contribution.
 *
 * The distinction is easy to get wrong, and getting it wrong misleads rather than just
 * looking bad: at market level 0 `buildingTotal` is 0, but the place still earns
 * `PLACE_BASE_INCOME` every round. Printing 0 would tell the reader a level-0 market earns
 * nothing at all. Printing 10 answers the question actually being asked: how much does this
 * place bring in per round, right now.
 *
 * 堡壘不在此列：防禦是乘在守軍上的倍率，沒有「總產出」可言，所以沿用累積百分比。
 * Fortress is absent on purpose: defence is a multiplier on the garrison rather than an
 * output, so it keeps its cumulative percentage.
 */
export function placeOutputAt(
  kind: BuildingKind,
  level: number
): { value: number; unit: 'gold' | 'troops' } | null {
  switch (kind) {
    case 'market':
      return { value: placeIncome(level), unit: 'gold' };
    case 'barracks':
      return { value: placeRecruits(level), unit: 'troops' };
    case 'fortress':
      // 防禦是乘在守軍上的倍率，不是產出，所以沒有「總共產出多少」可印 /
      // Defence is a multiplier on the garrison, not an output, so there is no total to print
      return null;
  }
}

/**
 * 這一級要**印給讀者**的數字：能印「這個地方每回合的總產出」就印那個，否則印累積效果。
 *
 * The number to **print** for a level: the place's total per-round output when there is one,
 * otherwise the cumulative effect.
 *
 * **為什麼需要這一层？** 同一個元件裡有三個地方印同一個東西：展開的等級表、行內的
 * 「目前 → 下一級」、以及等級圓點的 tooltip。等级表已經用 `placeOutputAt` 印總產出，
 * 但行與圓點卻用 `buildingTotal` 印這一棟建築自己的貢獻 —— 於是**同一個等級有兩個數字**：
 * 市場 1 級，表格說「15 金錢 / 每回合」，行卻說「+5 金錢」。兩個都是真的，兩個都不是
 * 對方。讀者看到 1 級只值 5 金，就會以為 0 級是 0 金，而地方照樣有基礎收入。
 *
 * **Why this layer exists.** One component prints the same thing in three places: the
 * expanded level table, the row's "current → next", and the level dots' tooltips. The table
 * already printed the place's total via `placeOutputAt`, while the row and the dots printed
 * this one building's own contribution via `buildingTotal` — so **one level had two numbers**:
 * at market level 1 the table said "15 gold / round" and the row said "+5 gold". Both are true
 * and neither matches the other, and a reader who takes "+5" at level 1 concludes level 0
 * earns nothing, when the place still earns its base income.
 *
 * 三個呼叫點全部走這裡，所以三個地方不可能再各說各話 /
 * All three call sites go through here, so they cannot drift apart again.
 */
export function placeEffectLabel(
  kind: BuildingKind,
  level: number
): { value: number; unit: 'percent' | 'gold' | 'troops' } {
  const total = placeOutputAt(kind, level);
  if (total) return total;
  return { value: buildingTotal(kind, level), unit: buildingPerLevel(kind).unit };
}