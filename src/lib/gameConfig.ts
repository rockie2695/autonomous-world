// ============================================================================
// 遊戲設定 — 所有可調整數值的唯一真實來源
// Game Configuration — Single Source of Truth for All Tunable Values
// ============================================================================
// 遊戲中的每個數值都在此定義。程式碼庫中其他地方不應有魔法數字。
// Every numeric value in the game is defined here. No magic numbers anywhere
// 在此修改數值，會傳播到所有地方。
// else in the codebase. Change a value here, and it propagates everywhere.
//
// 命名規則 / Naming convention:
//   CATEGORY_DETAIL_DESCRIPTION
//
// 單位在註解中標註。"lv" = 等級, "mult" = 乘數,
// Units are noted in comments. "lv" = level, "mult" = multiplier,
// "rate" = 機率 (0-1), "rounds" = 回合數。
// "rate" = probability (0-1), "rounds" = round count.
// ============================================================================

export const CONFIG = {
  // ── 地點 / Places ────────────────────────────────────────────────────────
  // 控制地圖成長：從 100 開始，每回合增加 1，最大 2000。
  // Controls map growth: starts at 100, grows by 1 per round, max 2000.
  PLACE_INITIAL_COUNT: 100,       // 世界建立時有多少地點 / How many places exist at world creation
  PLACE_MAX_COUNT: 2000,          // 地點總數上限 / Hard cap on total places
  PLACE_NEW_PER_ROUND: 1,         // 每回合新增的地點數 / New places added each round

  // ── 道路 / Roads ─────────────────────────────────────────────────────────
  // 每個地點連接 1-3 個其他地點。道路使移動成為可能。
  // Each place connects to 1-3 other places. Roads enable movement.
  ROAD_MAX_PER_PLACE: 3,          // 單一地點最多連接的道路數 / Max roads connected to any single place
  ROAD_NEW_PER_PLACE_MIN: 1,      // 地點建立時最少新增道路數 / Min new roads when a place is created
  ROAD_NEW_PER_PLACE_MAX: 3,      // 地點建立時最多新增道路數 / Max new roads when a place is created

  // ── 角色 / Characters ────────────────────────────────────────────────────
  // 屬性 (wu/tong/jing/speed) 使用均勻分佈 5-30。
  // Stats (wu/tong/jing/speed) use uniform distribution 5-30.
  // 野心使用常態分佈 μ=17, σ=5（限制在 5-30）。
  // Ambition uses normal distribution μ=17, σ=5 (clamped to 5-30).
  CHAR_START_AGE: 20,             // 所有角色起始年齡為 20 / All characters start at age 20
  CHAR_MAX_AGE_MIN: 50,           // 最小隨機最大年齡（因年老死亡）/ Min random maxAge (death from old age)
  CHAR_MAX_AGE_MAX: 80,           // 最大隨機最大年齡 / Max random maxAge

  CHAR_ABILITY_MIN: 5,            // wu, tong, jing 最小值 / Min value for wu, tong, jing
  CHAR_ABILITY_MAX: 30,           // wu, tong, jing 最大值 / Max value for wu, tong, jing

  CHAR_SPEED_MIN: 5,              // 最小速度 (v1.1) / Min speed (v1.1)
  CHAR_SPEED_MAX: 30,             // 最大速度 (v1.1) / Max speed (v1.1)
  CHAR_SPEED_MEAN: 17,            // 常態分佈平均值 / Normal distribution mean
  CHAR_SPEED_SIGMA: 5,            // 常態分佈標準差 / Normal distribution std dev

  CHAR_AMBITION_MIN: 5,           // 最小野心值 / Min ambition value
  CHAR_AMBITION_MAX: 30,          // 最大野心值 / Max ambition value
  CHAR_AMBITION_MEAN: 17,         // 常態分佈平均值 (μ) / Normal distribution mean (μ)
  CHAR_AMBITION_SIGMA: 5,         // 常態分佈標準差 (σ) / Normal distribution std dev (σ)

  // 生成率隨世界成長而降低（後期遊戲新角色更少）
  // Spawn rate decreases as the world grows (fewer new characters late game)
  CHAR_SPAWN_RATE_START: 0.05,    // 100 個地點時每個地點 5% 機率 / 5% chance per place at 100 places
  CHAR_SPAWN_RATE_END: 0.01,      // 2000 個地點時每個地點 1% 機率 / 1% chance per place at 2000 places

  CHAR_TROOP_CAP_BASE: 100,       // 每個角色基礎兵力容量 / Base troop capacity per character
  CHAR_TROOP_CAP_PER_TONG: 20,    // 每點 tong 額外容量 / Extra capacity per point of tong

  // 戰鬥傷亡 / Battle casualties
  CHAR_FATIGUE_PER_WIN: 0.90,     // 獲勝後兵力乘以此值 / Troops multiplied by this after winning

  // 用個人金錢購買士兵 / Buying troops from personal gold
  CHAR_BUY_TROOP_PRICE: 2,        // 每個士兵的金錢成本 / Gold cost per troop
  CHAR_BUY_TROOP_MIN: 10,         // 每次購買最少士兵數 / Min troops per purchase
  CHAR_BUY_TROOP_MAX: 100,        // 每次購買最多士兵數 / Max troops per purchase

  // 建立新勢力時的野心重置 / Ambition reset when creating a new faction
  CHAR_NEW_FACTION_AMBITION_RESET_MIN: 5,
  CHAR_NEW_FACTION_AMBITION_RESET_MAX: 15,

  // ── 速度 / 逃脫 (v1.1) ──────────────────────────────────────────────────
  // 逃脫機率 = clamp(0.5 + speedDiff × 0.02, 0.1, 0.9)
  // Escape probability = clamp(0.5 + speedDiff × 0.02, 0.1, 0.9)
  // speedDiff = 防禦者速度 - 攻擊者速度（正數 = 防禦者較快）
  // speedDiff = defender.speed - attacker.speed (positive = defender faster)
  SPEED_ESCAPE_BASE: 0.50,        // 基礎逃脫機率（速度相同）/ Base escape probability (equal speed)
  SPEED_ESCAPE_PER_DIFF: 0.02,    // 每點速度差異的逃脫機率 / Escape chance per speed point difference
  SPEED_ESCAPE_MIN: 0.10,         // 最小逃脫機率 / Min escape probability
  SPEED_ESCAPE_MAX: 0.90,         // 最大逃脫機率 / Max escape probability
  SPEED_TIEBREAK_BY_RNG: true,    // 速度相同時使用 RNG 決定順序 / When speeds equal, use RNG for order

  // ── 野心事件 / Ambition Events ──────────────────────────────────────────
  // 野心如何根據遊戲事件變化 / How ambition changes based on game events
  AMBITION_DEFECT_BASE_MULT: 0.5,           // 叛變的基礎野心乘數 / Base ambition multiplier for defection
  AMBITION_DIFF_LOYALTY_MULT: 1.2,          // 忠誠與國王不同時的乘數 / Multiplier when loyalty differs from king
  AMBITION_FRIEND_DEFECT_MULT: 1.5,         // 朋友最近叛變時的乘數 / Multiplier when friend recently defected
  AMBITION_KING_TONG_REDUCE: 0.01,          // 國王的 tong 降低野心 / King's tong reduces ambition
  AMBITION_LARGE_FACTION_MULT: 0.8,         // 大勢力降低野心成長 / Large factions reduce ambition growth
  AMBITION_LARGE_FACTION_THRESHOLD: 500,    // 「大」= 500+ 角色 / "Large" = 500+ characters
  AMBITION_NO_PROMOTION_ROUNDS: 20,         // 未晉升回合數 → 野心上升 / Rounds without promotion → ambition up
  AMBITION_NO_PROMOTION_DELTA: 0.5,         // 每 20 回合野心增加量 / Ambition increase per 20 rounds
  AMBITION_FRIEND_DEFECT_DELTA: 2,          // 朋友叛變時 +2 野心 / +2 ambition when friend defects
  AMBITION_KING_TONG_DELTA: 0.5,            // 國王強時 -0.5 × (king.tong/30) / -0.5 × (king.tong/30) when king strong

  // ── 友誼 / 不滿 ─────────────────────────────────────────────────────────
  // 關係每回合在附近角色間隨機形成
  // Relationships form randomly between nearby characters each round
  FRIEND_FORM_CHANCE: 0.05,                 // 每對合適配對 5% 機率 / 5% chance per eligible pair
  DISCONTENT_FORM_CHANCE: 0.05,             // 每對合適配對 5% 機率 / 5% chance per eligible pair
  DISCONTENT_DEFECT_MULT: 1.3,              // 不滿使叛變機率增加 30% / Discontent increases defection by 30%

  // ── 經濟 / Economy ───────────────────────────────────────────────────────
  // 收入分配：國王 40%、行政官 30%、其他 30%
  // Income distribution: king 40%, admin 30%, others 30%
  PLACE_BASE_INCOME: 10,                    // 每回合每個地點基礎金錢 / Base gold per round per place
  PLACE_MARKET_INCOME_PER_LV: 5,            // 每級市場額外金錢 / Extra gold per market level
  INCOME_KING_SHARE: 0.40,                  // 國王的收入份額 / King's cut of place income
  INCOME_ADMIN_SHARE: 0.30,                 // 行政官的收入份額 / Administrator's cut
  INCOME_OTHER_SHARE: 0.30,                 // 其他角色共享 / Shared among other characters

  // 建築成本（指數成長：base × 2^level）
  // Building costs (exponential: base × 2^level)
  BUILDING_UPGRADE_COST_BASE: 100,
  BUILDING_UPGRADE_COST_MULT: 2,            // 成本 = base × mult^level / Cost = base × mult^level

  // ── 軍事 / Military ──────────────────────────────────────────────────────
  // 徵兵：基礎 + 兵營加成
  // Recruitment: base + barracks bonus
  PLACE_BASE_RECRUIT: 2,                    // 每回合基礎徵兵數 / Base troops recruited per round
  PLACE_BARRACKS_RECRUIT_PER_LV: 3,         // 每級兵營額外徵兵數 / Extra recruits per barracks level

  // ── 戰鬥 / Battle ────────────────────────────────────────────────────────
  // atk = attacker.troops × (1 + wu/30) × rand(0.85, 1.15)
  // def = defender.troops × (1 + tong/30) × (1 + fortress×0.2) × rand(0.85, 1.15)
  BATTLE_RANDOM_MIN: 0.85,                  // 隨機變異下限 / Random variance lower bound
  BATTLE_RANDOM_MAX: 1.15,                  // 隨機變異上限 / Random variance upper bound
  BATTLE_ATK_WU_MULT: 1 / 30,              // wu 對攻擊力的貢獻 / Wu contribution to attack power
  BATTLE_DEF_TONG_MULT: 1 / 30,            // tong 對防禦力的貢獻 / Tong contribution to defense power
  BATTLE_FORTRESS_DEF_MULT: 0.20,          // 堡壘等級防禦加成（每級 20%）/ Fortress level defense bonus (20% per level)

  // ── 信號 / Signals ───────────────────────────────────────────────────────
  // 信號集結附近友軍到目標地點
  // Signals rally nearby friendly troops to a target place
  SIGNAL_RANGE: 2,                         // 信號發送者最大道路跳數 / Max road-hops from signal sender
  SIGNAL_DURATION: 5,                      // 信號過期前的回合數 / Rounds before signal expires
  SIGNAL_COOLDOWN: 10,                     // 同一角色再次發送信號前的回合數 / Rounds before same character can signal again

  // ── 勢力瓦解 / Faction Collapse ──────────────────────────────────────────
  // 當國王死亡，勢力逐漸解散（每回合 1-3 次叛變）
  // When king dies, faction gradually dissolves (1-3 defections per round)
  COLLAPSE_DEFECT_PER_ROUND_MIN: 1,
  COLLAPSE_DEFECT_PER_ROUND_MAX: 3,

  // ── 世界佈局 / World Layout ──────────────────────────────────────────────
  // ForceAtlas2 佈局重新計算間隔
  // ForceAtlas2 layout recalculation interval
  LAYOUT_RECALC_INTERVAL: 100,              // 每 100 回合重新計算 / Recalc every 100 rounds
  COLOR_NEIGHBOR_RANGE: 2,                  // 檢查 2 跳內的顏色衝突 / Check 2 hops for color conflicts
} as const;

// ─── 型別匯出 / Type Exports ──────────────────────────────────────────────
// 派生型別以確保 TypeScript 安全性
// Derived types for TypeScript safety
export type ConfigKey = keyof typeof CONFIG;

/**
 * 帶型別安全地取得設定值。
 * Get a config value with type safety.
 * 使用方式 / Usage: getConfig('PLACE_INITIAL_COUNT') → 100
 */
export function getConfig<K extends ConfigKey>(key: K): (typeof CONFIG)[K] {
  return CONFIG[key];
}
