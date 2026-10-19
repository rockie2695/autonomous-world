// ============================================================================
// 消費性格（純邏輯）/ Spending posture (pure)
// ============================================================================
// 「每個將領花錢的方式不一樣」**不需要新資料庫欄位**——五維屬性本來就人各不同。
// 性格從武/體/經的**嚴格主導**推導：最高的一項明顯高於其餘兩項才成立，平手或
// 接近都是均衡。統領已經決定單次購兵量（income.ts），速度決定逃脫——這裡補上
// 的只是「錢在兵與建築之間怎麼分」。
//
// "Each leader spends differently" needs **no new database column** — the five
// stats already differ per person. The posture is derived from a **strict**
// dominance of wu / ti / jing: the top stat must clearly beat the other two, and
// ties or near-ties are balanced. tong already scales the troop purchase
// (income.ts) and speed the escape — this adds only how money splits between
// soldiers and buildings.
//
// 為什麼是純函式 / Why pure
// ---------------------------------------------------------------------------
// 經濟階段（留儲備）與建築階段（挑要蓋的）必須讀**同一份**性格——各寫一份就會
// 漂移，跟 placeEffects 存在的理由一模一樣。
// The economy phase (keeping a reserve) and the build phase (choosing what to
// raise) must read the **same** posture — two copies drift, for exactly the reason
// placeEffects exists.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';
import type { BuildingKind } from '@/lib/placeEffects';

/** 消費性格 / Spending posture */
export type SpendingPosture = 'aggressive' | 'guardian' | 'merchant' | 'balanced';

/**
 * 從武/體/經推導消費性格。**嚴格**主導才成立：最高的一項要同時高於其餘兩項，
 * 任何平手都是均衡——「勉強最高」不該讓將領押上全部性格。
 * Derive the posture from wu / ti / jing. Dominance must be **strict** — the top
 * stat has to beat both others, and any tie is balanced: a marginal lead should
 * not commit a leader to a full personality.
 */
export function spendingPosture(stats: {
  wu: number;
  ti: number;
  jing: number;
}): SpendingPosture {
  const { wu, ti, jing } = stats;
  if (wu > ti && wu > jing) return 'aggressive';
  if (ti > wu && ti > jing) return 'guardian';
  if (jing > wu && jing > ti) return 'merchant';
  return 'balanced';
}

/**
 * 買兵前保留在口袋裡的比例（**只對行政官生效**——只有他們有建築要蓋；非行政官
 * 沒有建築可買，儲備只是死錢）。數值是 gameConfig 的 `SPEND_RESERVE_*`。
 * The fraction of gold kept aside before buying troops (**administrators only** —
 * only they have a building to raise; for anyone else a reserve is dead money).
 * The values are gameConfig's `SPEND_RESERVE_*`.
 */
export function troopReserveRate(posture: SpendingPosture): number {
  switch (posture) {
    case 'aggressive':
      return CONFIG.SPEND_RESERVE_AGGRESSIVE;
    case 'guardian':
      return CONFIG.SPEND_RESERVE_GUARDIAN;
    case 'merchant':
      return CONFIG.SPEND_RESERVE_MERCHANT;
    case 'balanced':
      return CONFIG.SPEND_RESERVE_BALANCED;
  }
}

/**
 * 想優先升級的建築順序（威脅下永遠是堡壘先行，見 build 階段）。
 * 武人要兵營（軍備）、守將要堡壘、商人要市場、均衡補**等級最低**的那座。
 * Preferred upgrade order (under threat the fortress always comes first — see the
 * build phase). Aggressive wants barracks (armament), guardian the fortress,
 * merchant the market, balanced whichever is **lowest level**.
 */
export function preferredBuildings(
  posture: SpendingPosture,
  levels: { fortress: number; market: number; barracks: number }
): BuildingKind[] {
  switch (posture) {
    case 'aggressive':
      return ['barracks', 'fortress', 'market'];
    case 'guardian':
      return ['fortress', 'barracks', 'market'];
    case 'merchant':
      return ['market', 'barracks', 'fortress'];
    case 'balanced': {
      // 最低的先蓋：把短板補起來 /
      // Raise the shortest board first
      const entries: Array<[BuildingKind, number]> = [
        ['fortress', levels.fortress],
        ['market', levels.market],
        ['barracks', levels.barracks],
      ];
      return entries.sort((a, b) => a[1] - b[1]).map(([kind]) => kind);
    }
  }
}
