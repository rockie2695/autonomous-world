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