// ============================================================================
// 戰力估量（純邏輯）/ War estimates (pure)
// ============================================================================
// 攻方（aiMove 開打前估量）與守方（行政官的威脅感知）必須引用**同一組**數字——
// 估量引用模擬沒用的數字，跟彈窗引用模擬沒用的數字是同一種錯。這裡是唯一來源：
// 係數讀 battle.ts 用的同一份 CONFIG 常數，隨機骰取期望值 1.0（骰值 0.85–1.15
// 對稱，兩邊抵消）。
//
// The attacker (aiMove's pre-battle gate) and the defender (an administrator's
// threat sense) must quote the **same** numbers — an estimate citing numbers the
// fight does not use is the same class of error as a popup citing them. This
// module is the single source: coefficients read the same CONFIG constants
// battle.ts reads, with the rolls at their expected 1.0 (0.85–1.15 is symmetric,
// so both sides cancel).
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';
import { fortressDefenceMult } from '@/lib/placeEffects';

/** 估量用的最小角色切面 / The slice of a character the estimates need */
export interface EstimateChar {
  troops: number;
  wu: number;
  ti: number;
  factionId: string | null;
  placeId: string;
}

/** 估量用的最小地點切面 / The slice of a place the estimates need */
export interface EstimatePlace {
  id: string;
  garrison: number;
  fortress: number;
  factionId: string | null;
}

/**
 * 一位將領的估計攻擊戰力：battle.ts 的攻擊式去掉隨機骰。
 * One leader's estimated attack: battle.ts's attack formula with the roll at 1.0.
 */
export function estimateAttack(char: { troops: number; wu: number }): number {
  return char.troops * (1 + char.wu * CONFIG.BATTLE_ATK_WU_MULT);
}

/**
 * 一個地點的估計防禦：駐軍 + 同陣營守軍將領（體魄加成），**都**乘同一個堡壘倍率
 * ——battle.ts 的兩條防禦式各帶一次，所以先累加、最後乘一次。
 * A place's estimated defence: garrison plus same-faction defending leaders (physique
 * scaled), **both** multiplied by the one fortress multiplier — battle.ts's two
 * defence formulas each carry it, so accumulate first, multiply once.
 */
export function estimatePlaceDefence(
  place: { garrison: number; fortress: number },
  defenders: ReadonlyArray<{ troops: number; ti: number }>
): number {
  let d = place.garrison;
  for (const defender of defenders) {
    d += defender.troops * (1 + defender.ti * CONFIG.BATTLE_DEF_TI_MULT);
  }
  return d * fortressDefenceMult(place.fortress);
}

/**
 * 這個地方此刻**受威脅**嗎：相鄰敵對將領中，最強者的估計攻擊力 ≥ 本地估計防禦
 * ——他不需要運氣就贏得動，這是行政官該感到威脅的門檻（比 aiMove 的開打門檻
 * AI_ATTACK_ADVANTAGE 低：防守要比進攻更早警覺）。毫無防禦（0）時，任何敵鄰
 * 都算威脅。
 * Whether the place is **threatened** right now: the strongest adjacent hostile
 * leader's estimated attack clears this place's estimated defence — they win
 * without luck. That is the bar at which an administrator should feel threatened
 * (lower than aiMove's engagement bar AI_ATTACK_ADVANTAGE: defence wakes before
 * offence commits). With no defence at all (0), any hostile neighbour counts.
 */
export function isThreatened(myDefence: number, maxAdjacentHostileAttack: number): boolean {
  if (myDefence <= 0) return maxAdjacentHostileAttack > 0;
  return maxAdjacentHostileAttack >= myDefence;
}
