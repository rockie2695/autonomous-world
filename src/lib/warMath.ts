// ============================================================================
// 多回合戰爭的數學（純邏輯）/ Multi-round war math (pure)
// ============================================================================
// 戰鬥不再一回合決勝負：被擊中扣**兵力**（HP 制），戰爭橫跨多個模擬回合，直到
// 一方潰敗。引擎本身（battle.ts）吃資料庫，這裡把**可測的純數學**抽出來：傷害
// 換算、疲勞、結束判定。規則集中一份，引擎與測試引用同一份。
//
// Battles no longer end in one round: a hit costs **troops** (HP-style) and a war
// spans several simulation rounds until one side breaks. The engine (battle.ts)
// touches the database, so the **testable pure math** lives here: strike damage,
// fatigue, and end-of-war decisions. One definition; the engine and the tests share
// it.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

/**
 * 一次出擊造成的**兵力損耗**：攻擊力 ÷ (防禦係數 × HITS_PER_KILL)，取整。
 * 攻擊力 = 兵力 × (1 + 武力/30) × 骰；防禦係數 = (1 + 體魄/30) × 堡壘（守將），
 * 或只有堡壘（駐軍池，沒有指揮官）。
 *
 * The **troop damage** of one strike: attack power ÷ (defence factor × HITS_PER_KILL),
 * floored. Attack power = troops × (1 + wu/30) × roll; the defence factor =
 * (1 + ti/30) × fortress for a leader, or just the fortress for the garrison pool
 * (it has no commander).
 */
export function strikeDamage(
  attackPower: number,
  defenceFactor: number
): number {
  const factor = Math.max(0.0001, defenceFactor);
  const floored = Math.floor(
    attackPower / (factor * CONFIG.BATTLE_HITS_PER_KILL)
  );
  // **命中至少扣 1 兵**：只要這一擊有攻擊力（attackPower > 0），傷害就不會是 0。
  // 否則小部隊的戰爭永遠空轉——1 兵 vs 1 兵的攻擊力約 1.3，除以（防禦 × 8）後取整
  // 恆為 0，打八輪雙方兵力紋絲不動，最後只靠 BATTLE_MAX_ROUNDS 退兵收場（逃亡
  // 擲骰通常就是死）。「8 擊換 1 兵」對 ≥8 兵的軍隊仍然成立：那裡的 floor 本來就 ≥1。
  //
  // **A landed strike always costs at least one troop**: as long as the strike
  // carries any attack power (attackPower > 0), the damage is never 0. Otherwise a
  // small army's war spins forever — 1 troop vs 1 troop is ~1.3 attack power,
  // which divides by (defence × 8) to a floored 0, so eight rounds leave both
  // sides untouched and the war ends only at BATTLE_MAX_ROUNDS with an escape
  // roll that usually kills. "8 hits per troop" still holds for armies of 8+:
  // the floor is already ≥ 1 there.
  if (floored <= 0 && attackPower > 0) return 1;
  return Math.max(0, floored);
}

/**
 * 每輪疲勞：**所有**參戰者（攻守皆然）打完一輪都累——久戰兩敗俱傷，但守方有堡壘
 * 減傷抵消，所以攻方在長戰中吃虧。至少保 1 兵（`survivorTroops` 同一條規則）。
 * Per-round fatigue: **every** combatant tires (both sides), but the fortress's
 * damage reduction offsets it for the defence, so the attacker loses long wars.
 * Floored at 1 (the same rule as `survivorTroops`).
 */
export function warFatigue(troops: number): number {
  return Math.max(1, Math.floor(troops * CONFIG.BATTLE_WAR_FATIGUE));
}

/** 戰爭一輪結束時的判定 / The verdict after one war round */
export type WarVerdict =
  | 'capture' // 守方全空：攻方佔領 / the defence is gone: the attackers take the place
  | 'hold' // 攻方全空：守住了 / the attackers are gone: the defence holds
  | 'rout' // 攻方潰逃（低於門檻）/ the attackers break (below the threshold)
  | 'retreat' // 到達最大輪數：攻方退兵 / the round cap: the attackers retreat
  | 'continue'; // 戰爭繼續 / the war continues

/**
 * 一輪結束後判定戰爭走向。
 * Decide the war's direction after a round.
 *
 * - 守方全空（駐軍 0 且無有兵守將）→ **capture**
 * - 攻方全空（無有兵攻方）→ **hold**
 * - 攻方剩餘總兵力 < 守方剩餘總兵力 × ROUT_RATIO → **rout**（攻方潰逃）
 * - 輪數 ≥ BATTLE_MAX_ROUNDS → **retreat**（攻方退兵）
 * - 其餘 → **continue**（下回合再戰）
 *
 * - defence gone (garrison 0 and no troop-bearing defenders) → **capture**
 * - attackers gone (no troop-bearing attackers) → **hold**
 * - attackers' remaining troops < the defence's × ROUT_RATIO → **rout**
 * - rounds ≥ BATTLE_MAX_ROUNDS → **retreat**
 * - otherwise → **continue** (fight again next round)
 *
 * **無狀態**：戰爭不存表——「敵對將領持續站在敵地」就是戰爭本身，全部由當前
 * 世界狀態推導。增援自然湧現（下一回合趕到的將領直接加入）。
 * **Stateless**: the war is not stored — "hostile leaders keep standing on enemy
 * ground" *is* the war, derived entirely from the current world state.
 * Reinforcements emerge naturally (leaders arriving next round simply join).
 */
export function warVerdict(input: {
  garrison: number;
  /** 有兵的攻方總兵力 / total troops among troop-bearing attackers */
  attackerTroops: number;
  /** 有兵的守方總兵力（不含駐軍）/ total troops among troop-bearing defenders */
  defenderTroops: number;
  /** 這場戰爭已打幾輪（1 起）/ how many rounds the war has fought (1-based) */
  roundsFought: number;
}): WarVerdict {
  const defendersLeft =
    input.garrison + input.defenderTroops > 0 &&
    (input.garrison > 0 || input.defenderTroops > 0);
  const defenceAlive = input.garrison > 0 || input.defenderTroops > 0;
  if (!defenceAlive) return 'capture';
  if (input.attackerTroops <= 0) return 'hold';
  // 潰敗門檻：攻方兵力掉到守方的一半以下——這場仗已經打不贏，全體潰逃 /
  // Rout threshold: the attackers below half the defence — the fight is lost, break
  // 潰敗門檻的守方 = **駐軍 + 守將兵力**（城牆也是防禦）/
  // The rout threshold's defence = **garrison + defending leaders** (the walls count)
  if (
    input.attackerTroops <
    (input.garrison + input.defenderTroops) * CONFIG.BATTLE_ROUT_RATIO
  )
    return 'rout';
  if (input.roundsFought >= CONFIG.BATTLE_MAX_ROUNDS) return 'retreat';
  return 'continue';
}

/**
 * 逃亡機率（多回合版）：與單回合同一條速度差公式，但追擊者是**對方最快**的成員
 * ——大軍追擊更難逃。
 * The escape chance (multi-round): the same speed-difference formula, but the
 * pursuer is the **fastest** member of the other side — an army's pursuit is harder
 * to outrun.
 */
export function warEscapeChance(
  speedDiff: number
): number {
  return Math.max(
    CONFIG.SPEED_ESCAPE_MIN,
    Math.min(
      CONFIG.SPEED_ESCAPE_MAX,
      CONFIG.SPEED_ESCAPE_BASE + speedDiff * CONFIG.SPEED_ESCAPE_PER_DIFF
    )
  );
}
