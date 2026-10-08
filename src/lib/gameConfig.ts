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
//
// 隨機數生成器（RNG / Random Number Generator）
// 使用 mulberry32 演算法，透過 seed 確保可重現性。
// 同樣的 seed 會產生完全相同的隨機序列。
// 使用方式：const rng = createRng('my-seed');
//   rng.random()    → 0-1 均勻分佈
//   rng.int(1, 10)  → 1-10 整數
//   rng.gaussian(17, 5, 5, 30) → 常態分佈，限制在 5-30
// ============================================================================

export const CONFIG = {
  // ── 自動播放 / Autoplay ───────────────────────────────────────────────────
  // 每次前進都會打一次 API，所以最短間隔必須留夠網路時間（5 秒），
  // 太短只會一直撞 rate limit / Each tick hits the API, so the floor has to
  // leave room for the request — shorter just spams the endpoint
  AUTOPLAY_MIN_MS: 5000,
  AUTOPLAY_MAX_MS: 15000,
  AUTOPLAY_DEFAULT_MS: 5000,

  // ── 地點 / Places ────────────────────────────────────────────────────────
  // 控制地圖成長：從 100 開始，每回合增加 1，最大 2000。
  // Controls map growth: starts at 100, grows by 1 per round, max 2000.
  PLACE_INITIAL_COUNT: 100, // 世界建立時有多少地點 / How many places exist at world creation
  PLACE_MAX_COUNT: 2000, // 地點總數上限 / Hard cap on total places
  PLACE_NEW_PER_ROUND: 1, // 每回合新增的地點數 / New places added each round
  PLACE_INITIAL_FORTRESS: 1, // 國王初始地點堡壘（新地點皆 0）/ King's starting place fortress (new places all 0)
  PLACE_INITIAL_MARKET: 1, // 國王初始地點市場（新地點皆 0）/ King's starting place market (new places all 0)
  PLACE_INITIAL_BARRACKS: 1, // 國王初始地點兵營（新地點皆 0）/ King's starting place barracks (new places all 0)
  PLACE_INITIAL_GARRISON: 10, // 國王初始地點駐軍（新地點無駐軍）/ King's starting place garrison (new places get none)

  // ── 道路 / Roads ─────────────────────────────────────────────────────────
  // 每個地點連接 1-4 個其他地點。道路使移動成為可能。
  // Each place connects to 1-4 other places. Roads enable movement.
  ROAD_MAX_PER_PLACE: 4, // 單一地點最多連接的道路數 / Max roads connected to any single place
  ROAD_NEW_PER_PLACE_MIN: 1, // 地點建立時最少新增道路數 / Min new roads when a place is created
  ROAD_NEW_PER_PLACE_MAX: 4, // 地點建立時最多新增道路數 / Max new roads when a place is created

  // ── 命名 / Naming ─────────────────────────────────────────────────────────
  // 名稱有兩種風格，兩者會混合產生 / Two name styles, mixed together:
  //   傳統 / classic  — 人名「張飛」（姓+名）、勢力「蒼龍盟」（修飾+名詞+後綴）、地名「青碧城」（形容詞×2+地形）
  //   稱號 / epithet  — 人名「霜狼·蓋爾」（稱號+外來名）、勢力「霜脊議會」（稱號+組織類型）、地名「霜狼關」（稱號+地形）
  // 設為 0 可完全關閉稱號風格 / Set to 0 to disable the epithet style entirely
  PERSON_EPITHET_NAME_RATE: 0.35, // 人名使用稱號風格的機率 / Chance a person name uses the epithet style
  FACTION_EPITHET_NAME_RATE: 0.35, // 勢力名使用稱號風格的機率 / Chance a faction name uses the epithet style
  PLACE_EPITHET_NAME_RATE: 0.35, // 地名使用稱號風格的機率 / Chance a place name uses the epithet style

  // ── 角色 / Characters ────────────────────────────────────────────────────
  // 屬性 (wu/tong/jing/speed) 使用均勻分佈 5-30。
  // Stats (wu/tong/jing/speed) use uniform distribution 5-30.
  //
  // 常態分佈（Normal Distribution / Gaussian Distribution）
  // 又稱高斯分佈，特徵：
  // - μ (mu) = 平均值，控制分佈中心位置
  // - σ (sigma) = 標準差，控制分佈寬度（越大越分散）
  // - 68% 的值落在 μ±1σ 範圍內
  // - 95% 的值落在 μ±2σ 範圍內
  // - 99.7% 的值落在 μ±3σ 範圍內
  //
  // 例如：CHAR_SPEED_MEAN=17, CHAR_SPEED_SIGMA=5
  // → 大多數角色速度在 12-22 之間（μ±1σ）
  // → 很少角色速度 <7 或 >27（μ±2σ 之外）
  //
  // 野心使用常態分佈 μ=17, σ=5（截斷至 5-30）。
  // Ambition uses normal distribution μ=17, σ=5 (clamped to 5-30).
  CHAR_START_AGE: 20, // 所有角色起始年齡為 20 / All characters start at age 20
  CHAR_MAX_AGE_MIN: 50, // 最小隨機最大年齡（因年老死亡）/ Min random maxAge (death from old age)
  CHAR_MAX_AGE_MAX: 80, // 最大隨機最大年齡 / Max random maxAge

  CHAR_ABILITY_MIN: 5, // wu, tong, jing 最小值 / Min value for wu, tong, jing
  CHAR_ABILITY_MAX: 30, // wu, tong, jing 最大值 / Max value for wu, tong, jing

  CHAR_SPEED_MIN: 5, // 最小速度 (v1.1) / Min speed (v1.1)
  CHAR_SPEED_MAX: 30, // 最大速度 (v1.1) / Max speed (v1.1)
  CHAR_SPEED_MEAN: 17, // 常態分佈平均值 / Normal distribution mean
  CHAR_SPEED_SIGMA: 5, // 常態分佈標準差 / Normal distribution std dev

  CHAR_AMBITION_MIN: 5, // 最小野心值 / Min ambition value
  CHAR_AMBITION_MAX: 30, // 最大野心值 / Max ambition value
  CHAR_AMBITION_MEAN: 17, // 常態分佈平均值 (μ) / Normal distribution mean (μ)
  CHAR_AMBITION_SIGMA: 5, // 常態分佈標準差 (σ) / Normal distribution std dev (σ)

  // 生成率隨世界成長而降低（後期遊戲新角色更少）
  // Spawn rate decreases as the world grows (fewer new characters late game)
  CHAR_SPAWN_RATE_START: 0.05, // 100 個地點時每個地點 5% 機率 / 5% chance per place at 100 places
  CHAR_SPAWN_RATE_END: 0.01, // 2000 個地點時每個地點 1% 機率 / 1% chance per place at 2000 places

  CHAR_TROOP_CAP_BASE: 100, // 每個角色基礎兵力容量 / Base troop capacity per character
  CHAR_TROOP_CAP_PER_TONG: 20, // 每點 tong 額外容量 / Extra capacity per point of tong

  // 戰鬥傷亡 / Battle casualties
  CHAR_FATIGUE_PER_WIN: 0.9, // 獲勝後兵力乘以此值 / Troops multiplied by this after winning

  // 用個人金錢購買士兵 / Buying troops from personal gold
  CHAR_BUY_TROOP_PRICE: 2, // 每個士兵的金錢成本 / Gold cost per troop
  CHAR_BUY_TROOP_MIN: 10, // 每次購買最少士兵數 / Min troops per purchase
  CHAR_BUY_TROOP_MAX: 100, // 每次購買最多士兵數 / Max troops per purchase

  // 建立新勢力時的野心重置 / Ambition reset when creating a new faction
  CHAR_NEW_FACTION_AMBITION_RESET_MIN: 5,
  CHAR_NEW_FACTION_AMBITION_RESET_MAX: 15,

  // ── 速度 / 逃脫 (v1.1) ──────────────────────────────────────────────────
  // 逃脫機率 = clamp(0.5 + speedDiff × 0.02, 0.1, 0.9)
  // Escape probability = clamp(0.5 + speedDiff × 0.02, 0.1, 0.9)
  // speedDiff = 防禦者速度 - 攻擊者速度（正數 = 防禦者較快）
  // speedDiff = defender.speed - attacker.speed (positive = defender faster)
  SPEED_ESCAPE_BASE: 0.5, // 基礎逃脫機率（速度相同）/ Base escape probability (equal speed)
  SPEED_ESCAPE_PER_DIFF: 0.02, // 每點速度差異的逃脫機率 / Escape chance per speed point difference
  SPEED_ESCAPE_MIN: 0.1, // 最小逃脫機率 / Min escape probability
  SPEED_ESCAPE_MAX: 0.9, // 最大逃脫機率 / Max escape probability
  SPEED_TIEBREAK_BY_RNG: true, // 速度相同時使用 RNG 決定順序 / When speeds equal, use RNG for order

  // ── 野心事件 / Ambition Events ──────────────────────────────────────────
  // 野心如何根據遊戲事件變化 / How ambition changes based on game events
  AMBITION_DEFECT_BASE_MULT: 0.5, // 叛變的基礎野心乘數 / Base ambition multiplier for defection
  AMBITION_DIFF_LOYALTY_MULT: 1.2, // 忠誠與國王不同時的乘數 / Multiplier when loyalty differs from king
  AMBITION_FRIEND_DEFECT_MULT: 1.5, // 朋友最近叛變時的乘數 / Multiplier when friend recently defected
  AMBITION_KING_TONG_REDUCE: 0.01, // 國王的 tong 降低野心 / King's tong reduces ambition
  AMBITION_LARGE_FACTION_MULT: 0.8, // 大勢力降低野心成長 / Large factions reduce ambition growth
  AMBITION_LARGE_FACTION_THRESHOLD: 500, // 「大」= 500+ 角色 / "Large" = 500+ characters
  AMBITION_NO_PROMOTION_ROUNDS: 20, // 未晉升回合數 → 野心上升 / Rounds without promotion → ambition up
  AMBITION_NO_PROMOTION_DELTA: 0.5, // 每 20 回合野心增加量 / Ambition increase per 20 rounds
  AMBITION_FRIEND_DEFECT_DELTA: 2, // 朋友叛變時 +2 野心 / +2 ambition when friend defects
  AMBITION_KING_TONG_DELTA: 0.5, // 國王強時 -0.5 × (king.tong/30) / -0.5 × (king.tong/30) when king strong
  AMBITION_ADMIN_REPLACED_DELTA: 1, // 被免去行政官職務時野心 +1 / +1 ambition when removed as administrator
  AMBITION_ADMIN_ASSIGNED_DELTA: 1, // 取得行政官職務時野心 -1（暫時）/ -1 ambition when granted administrator post (temporary)
  AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS: 10, // 減免持續回合數；到期若仍在職則 +1 回復 / Rounds before the -1 reverts if still in office

  // ── 行政官冷卻 / Administrator Cooldown ────────────────────────────────────
  ADMIN_CHANGE_COOLDOWN_ROUNDS: 10, // 換領導後 N 回合內 AI 不得再更換 / AI paths blocked for N rounds after a leader change

  // ── 友誼 / 不滿 ─────────────────────────────────────────────────────────
  // 關係每回合在附近角色間隨機形成
  // Relationships form randomly between nearby characters each round
  FRIEND_FORM_CHANCE: 0.05, // 每對合適配對 5% 機率 / 5% chance per eligible pair
  DISCONTENT_FORM_CHANCE: 0.05, // 每對合適配對 5% 機率 / 5% chance per eligible pair
  DISCONTENT_DEFECT_MULT: 1.3, // 不滿使叛變機率增加 30% / Discontent increases defection by 30%

  // ── 經濟 / Economy ───────────────────────────────────────────────────────
  // 收入分配：國王 40%、行政官 30%、其他 30%
  // Income distribution: king 40%, admin 30%, others 30%
  PLACE_BASE_INCOME: 10, // 每回合每個地點基礎金錢 / Base gold per round per place
  PLACE_MARKET_INCOME_PER_LV: 5, // 每級市場額外金錢 / Extra gold per market level
  INCOME_KING_SHARE: 0.4, // 國王的收入份額（可被 jing 放大）/ King's cut of place income (scaled by jing)
  INCOME_ADMIN_SHARE: 0.3, // 行政官的收入份額（可被 jing 放大）/ Administrator's cut (scaled by jing)
  INCOME_OTHER_SHARE: 0.3, // 其他角色共享 / Shared among other characters
  // jing（經濟）以「平均」為基準放大或縮小領導者的份額：一般將領與舊規則完全相同，
  // 高 jing 多拿、低 jing 少拿。17.5 是 jing 均勻分佈 (5–30) 的平均值。
  // jing (economy) scales a leader's cut around the average: an average leader is
  // unchanged from the old rule, a high-jing one pockets more, a low-jing one less.
  // 17.5 is the mean of jing's uniform 5–30 distribution.
  INCOME_JING_MIDPOINT: 17.5,

  // 建築成本（指數成長：base × 2^level）
  // Building costs (exponential: base × 2^level)
  BUILDING_UPGRADE_COST_BASE: 100,
  BUILDING_UPGRADE_COST_MULT: 2, // 成本 = base × mult^level / Cost = base × mult^level

  // ── 軍事 / Military ──────────────────────────────────────────────────────
  // 徵兵：基礎 + 兵營加成
  // Recruitment: base + barracks bonus
  PLACE_BASE_RECRUIT: 2, // 每回合基礎徵兵數 / Base troops recruited per round
  PLACE_BARRACKS_RECRUIT_PER_LV: 3, // 每級兵營額外徵兵數 / Extra recruits per barracks level

  // ── 戰鬥 / Battle ────────────────────────────────────────────────────────
  // atk = attacker.troops × (1 + wu/30) × rand(0.85, 1.15)
  // def = defender.troops × (1 + tong/30) × (1 + fortress×0.2) × rand(0.85, 1.15)
  BATTLE_RANDOM_MIN: 0.85, // 隨機變異下限 / Random variance lower bound
  BATTLE_RANDOM_MAX: 1.15, // 隨機變異上限 / Random variance upper bound
  BATTLE_ATK_WU_MULT: 1 / 30, // wu 對攻擊力的貢獻 / Wu contribution to attack power
  BATTLE_DEF_TONG_MULT: 1 / 30, // tong 對防禦力的貢獻 / Tong contribution to defense power
  BATTLE_FORTRESS_DEF_MULT: 0.2, // 堡壘等級防禦加成（每級 20%）/ Fortress level defense bonus (20% per level)

  // ── 信號 / Signals ───────────────────────────────────────────────────────
  // 信號集結附近友軍到目標地點
  // Signals rally nearby friendly troops to a target place
  SIGNAL_RANGE: 2, // 信號發送者最大道路跳數 / Max road-hops from signal sender
  SIGNAL_DURATION: 5, // 信號過期前的回合數 / Rounds before signal expires
  SIGNAL_COOLDOWN: 10, // 同一角色再次發送信號前的回合數 / Rounds before same character can signal again

  // ── 勢力瓦解 / Faction Collapse ──────────────────────────────────────────
  // 當國王死亡，勢力逐漸解散（每回合 1-3 次叛變）
  // When king dies, faction gradually dissolves (1-3 defections per round)
  COLLAPSE_DEFECT_PER_ROUND_MIN: 1,
  COLLAPSE_DEFECT_PER_ROUND_MAX: 3,

  // ── 世界佈局 / World Layout ──────────────────────────────────────────────
  // ForceAtlas2 佈局重新計算間隔
  // ForceAtlas2 layout recalculation interval
  LAYOUT_RECALC_INTERVAL: 100, // 每 100 回合重新計算 / Recalc every 100 rounds
  COLOR_NEIGHBOR_RANGE: 2, // 檢查 2 跳內的顏色衝突 / Check 2 hops for color conflicts

  // ── 增量佈局 / Incremental Layout ────────────────────────────────────────
  // 新節點放在鄰居重心附近 + 隨機偏移
  // New nodes placed near neighbor centroid + random offset
  NODE_SPAWN_RADIUS_MIN: 20, // 新節點距鄰居重心的最小距離 / Min distance from neighbor centroid
  NODE_SPAWN_RADIUS_MAX: 50, // 新節點距鄰居重心的最大距離 / Max distance from neighbor centroid
  NODE_COLLISION_MIN_DIST: 15, // 節點最小間距 / Minimum distance between nodes
  NODE_COLLISION_MAX_RETRY: 10, // 碰撞重試次數 / Collision retry count

  // ── ForceAtlas2（每 100 回合全域重算）/ ForceAtlas2 (full recalc every 100 rounds) ──
  FA2_ITERATIONS: 300,                      // 迭代次數 / Number of iterations
  FA2_GRAVITY: 0.3,                         // 向心力，低 → 避免塌向中心 / Gravity, low = avoid collapse to center
  FA2_SCALING_RATIO: 30,                    // 斥力，高 → 不相連的推遠 / Repulsion, high = push non-linked away
  FA2_BARNES_HUT: true, // O(n log n) 優化，2000 節點必開 / Barnes-Hut optimization
  FA2_BARNES_HUT_THETA: 0.5, // Barnes-Hut 精度 / Barnes-Hut precision
  FA2_LIN_LOG_MODE: true, // 稀疏圖更均勻 / More uniform for sparse graphs
  FA2_ADJUST_SIZES: true, // 節點大小影響佈局 / Node size affects layout
  FA2_EDGE_WEIGHT_INFLUENCE: 0, // 不看權重，只看有無邊 / Ignore weight, only edge existence
  FA2_OUTBOUND_ATTRACTION_DISTRIBUTION: true, // 讓高度數節點不要被拉太遠
  FA2_STRONG_GRAVITY_MODE: false, // 明確關閉，避免中心過重

  // ── 初始佈局 / Initial Layout ────────────────────────────────────────────
  INITIAL_LAYOUT_ITERATIONS: 200, // 迭代次數，越大越收斂但有遞減報酬 / Iterations, higher = more convergence but diminishing returns
  INITIAL_LAYOUT_RADIUS: 500, // 初始散佈半徑 / Initial spread radius

  // ── 地圖聚光燈 / Map Spotlight ─────────────────────────────────────────────
  // 新生成 / 被攻擊的地點顯示發光環的回合數（1 = 僅當前顯示回合）
  // Rounds a newly created / attacked place keeps its glowing ring (1 = displayed round only)
  SPOTLIGHT_ROUNDS: 1,

  // 聚光燈環幾何（覆蓋畫布）/ Spotlight ring geometry (overlay canvas)
  // 環半徑 = scaleSize(節點尺寸) + OFFSET + PULSE_AMP * 脈動
  // Ring radius = scaleSize(node size) + OFFSET + PULSE_AMP * pulse
  // scaleSize 讓環隨鏡頭縮放，OFFSET 讓環永遠落在節點圓外
  // scaleSize tracks zoom; OFFSET keeps the ring outside the node circle
  SPOTLIGHT_RING_OFFSET: 4,        // 環與節點邊緣的間距（px）/ Gap outside the node edge (px)
  SPOTLIGHT_RING_PULSE_AMP: 3,     // 脈動幅度（px）/ Pulse amplitude (px)
  SPOTLIGHT_RING_PULSE_MS: 1000,   // 脈動半週期（毫秒）/ Half pulse period (ms)
  SPOTLIGHT_RING_WIDTH: 2.5,       // 環線寬（px）/ Ring stroke width (px)
  SPOTLIGHT_RING_SHADOW: 6,        // 發光模糊基礎強度 / Base glow blur strength
  SPOTLIGHT_RING_SHADOW_PULSE: 8,  // 發光模糊脈動幅度 / Glow blur pulse amplitude

  // ── 移動動畫 / Move Animation ──────────────────────────────────────────────
  MOVE_ANIM_DURATION: 1500, // 移動點行進時間（毫秒）/ Travel time of the move dot (ms)
  MOVE_ANIM_PAUSE: 2500, // 每週期停頓（毫秒）/ Pause between animation cycles (ms)

  // ── 艦隊交戰 / Battle Fleet ───────────────────────────────────────────────
  // 首頁與遊戲頁共用的戰艦動畫。交戰**不是**靠事件推播，而是直接由「誰控制哪裡」
  // 推導：兩端屬於不同勢力的道路就是戰線。現實資料一變，戰線跟著變，所以這個動畫
  // 永遠跟得上模擬，而且兩個頁面用的是同一段純邏輯。
  //
  // The fleet animation shared by the home page and the game page. Engagements are
  // **not** driven by an event stream but derived from who owns what: a road whose
  // two ends belong to rival factions *is* a front line. Real data changes, the
  // front lines change with it, so the animation always matches the simulation —
  // and both pages run the same pure logic.

  /** 同時作戰的戰線上限，超出的依駐軍總和取大者 / Max simultaneous front lines; the rest are dropped smallest-first */
  BATTLE_FLEET_MAX_FRONTS: 24,
  /** 每條戰線上各方各幾艘 / Ships per side on one front line */
  BATTLE_FLEET_SHIPS_PER_SIDE: 2,
  /** 艦隊沿戰線巡航速度（世界單位 / 秒）/ Cruise speed along the line (world units/sec) */
  BATTLE_FLEET_SPEED: 42,
  /** 開火間隔（毫秒）/ Interval between shots (ms) */
  BATTLE_FLEET_FIRE_MS: 700,
  /** 曳光飛彈速度（世界單位 / 秒）/ Tracer speed (world units/sec) */
  BATTLE_FLEET_BOLT_SPEED: 320,
  /** 交戰雙方各自的航道偏移（世界單位），避免疊在一起 / Per-side lane offset so the two sides do not overlap */
  BATTLE_FLEET_LANE: 9,
  /** 艦體長度（螢幕像素）/ Ship length in screen pixels */
  BATTLE_FLEET_SHIP_PX: 8,
  /** 戰線底線透明度 / Opacity of the front-line base stroke */
  BATTLE_FLEET_LINE_ALPHA: 0.14,
  /** 曳光飛彈拖尾長度（世界單位）/ Tracer tail length in world units */
  BATTLE_FLEET_BOLT_LEN: 26,
  /** 頭像呼吸：胸口在 SVG 單位的起伏量 / Avatar breathing: chest rise, in SVG units */
  AVATAR_BREATH_RISE: 0.012,
  /** 頭像呼吸：胸口上移量（SVG 單位）/ Avatar breathing: chest lift, in SVG units */
  AVATAR_BREATH_LIFT: 0.9,
  /** 頭像呼吸：頭部後仰量（SVG 單位），必須小於胸口才不會像整張圖在動 /
   *  Avatar breathing: head tilt in SVG units; must be smaller than the chest or
   *  the whole image reads as one moving mass */
  AVATAR_BREATH_HEAD_LIFT: 0.45,

  // ── 太空塵埃背景 / Space dust background ───────────────────────────────────
  // 氣氛，不是主角：地圖上的圓點與道路才是資訊。所以顆粒小、暗、慢、少。
  //
  // Atmosphere, not the protagonist: the dots and roads on the map are the
  // information. So the particles are small, dim, slow and few.
  //
  // 刻意留在這一份 CONFIG 裡，不另開 UI_CONFIG —— 專案只有一份 CONFIG。
  //
  // Deliberately in this one CONFIG rather than a separate `UI_CONFIG`: the project
  // keeps exactly one.
  SPACE_PARTICLE_COUNT: 300,        // 粒子數（上限 800）/ particle count (hard cap 800)
  SPACE_PARTICLE_MAX_SPEED: 0.15,   // 每幀最大位移（px）/ max travel per frame, px
  SPACE_PARTICLE_MIN_SIZE: 0.5,     // 最小半徑 / min radius
  SPACE_PARTICLE_MAX_SIZE: 1.8,     // 最大半徑 / max radius
  SPACE_PARTICLE_MIN_ALPHA: 0.15,   // 最小不透明度 / min opacity
  SPACE_PARTICLE_MAX_ALPHA: 0.7,    // 最大不透明度 / max opacity
  SPACE_PARTICLE_TWINKLE: 0.01,     // 閃爍速度 / twinkle rate
  SPACE_PARTICLE_RGB: '180, 220, 255', // 基礎色（不透明度另外乘）/ base colour, opacity applied separately
  SPACE_DPR_CAP: 2,                 // DPR 上限，4K 螢幕不要用原值 / DPR cap; do not use the native value on 4K
  // 顏色一律放在 config，元件裡不得硬編碼任何顏色 /
  // Every colour lives in config; no component may hard-code one.

  // ── 流場塵埃 / Flow-field dust ────────────────────────────────────────────
  // 取代線性漂移的塵埃：粒子沿著 Simplex noise 場移動，所以會自然聚成絲帶、渦流與
  // 空洞——「隨機但有結構」。鄰近位置的 noise 值相近，所以粒子不會互相撞開。
  //
  // Replaces the linear drift: particles move along a Simplex noise field, so they
  // gather into ribbons, vortices and voids — random but structured. Neighbouring
  // positions have similar noise, so particles do not scatter randomly.
  //
  // ── 流場塵埃的顏色 / Flow-field dust colours ───────────────────────────────
  // **所有顏色都在這裡**，方便開發者直接調整：色相範圍、飽和度、亮度、不透明度上
  // 限，以及每個色階的 RGB。元件裡沒有任何硬編碼的顏色。
  //
  // **Every colour lives here**, so a developer can retune the whole layer without
  // touching a component: the hue range, saturation, lightness, the alpha ceiling,
  // and the RGB of every step. No colour is hard-coded in the component.
  //
  // 色相範圍可以拉大到 0–360 拿到彩虹，但要先想清楚：地圖本身已經有勢力色（金色
  // 君王、青色強調色、綠色領地），飽和度越高，道路的對比越容易被吃掉。要更亮，
  // 優先調 `SPACE_FLOW_LIGHTNESS` 與 `SPACE_FLOW_MAX_ALPHA`，而不是飽和度。
  //
  // Widening the hue range to 0–360 gives a rainbow, but weigh it first: the map
  // already carries faction colour (gold kings, cyan accents, green territory), and
  // the higher the saturation the more road contrast it eats. To go brighter,
  // raise `SPACE_FLOW_LIGHTNESS` or `SPACE_FLOW_MAX_ALPHA` before saturation.
  /**
   * 色相範圍。**預設 0–320**，所以紅、橘、黃、綠、藍、靛、紫都在內。
   *
   * 只看到紫、粉、藍是因為舊值是 `195 → 320`：那正好切掉 0–195 那一半，而 195–320
   * 裡面只有藍、青、紫與一點洋紅。綠（~120）、黃（~55）、橘（~30）、紅（~0）全被切掉
   * 了。
   *
   * **Defaults to 0–320** so red, orange, yellow, green, blue, indigo and violet are
   * all present.
   *
   * Only purple, pink and blue appeared because the old range was `195 → 320`, which
   * cuts off everything below 195 — and 195–320 contains only blue, cyan, violet and a
   * little magenta. Green (~120), yellow (~55), orange (~30) and red (~0) were all
   * excluded by the range itself.
   *
   * 想回到窄版冷色調就設成 `195` → `320`。/
   * Set `195` → `320` to go back to the narrow cool palette.
   */
  SPACE_FLOW_HUE_MIN: 0,
  SPACE_FLOW_HUE_MAX: 320,
  SPACE_FLOW_SATURATION: 78,        // 飽和度（%）/ saturation %
  SPACE_FLOW_LIGHTNESS: 66,         // 亮度（%）/ lightness %
  SPACE_FLOW_MAX_ALPHA: 0.72,       // 不透明度上限 / alpha ceiling
  /**
   * 每個色階的 RGB（不用 HSL，讓開發者能直接指定想要的顏色）。
   * 逗號分隔的 `r,g,b`，依 `SPACE_FLOW_HUE_STEPS` 平分色階；不給就自動由
   * 色相範圍生成。
   *
   * The RGB of each step, so a developer can name exact colours instead of
   * describing them as a hue range. Comma-separated `r,g,b`, spread across
   * `SPACE_FLOW_HUE_STEPS`; leave empty to derive them from the hue range.
   */
  SPACE_FLOW_COLORS: [] as string[],

  SPACE_FLOW_NOISE_SCALE: 0.0018,   // 越小絲帶越長 / smaller = longer ribbons
  SPACE_FLOW_TIME_SCALE: 0.00015,   // 場演化速度 / field evolution rate
  // 刻意比原本的 0.9 慢很多。使用者要求「慢」：塵埃是背景，動得太快會跟地圖爭
  // 注意力，而且拖曳地圖時會看起來像整片都在抖。
  //
  // Deliberately far slower than the original 0.9. The dust is background: too fast and
  // it competes with the map for attention, and a drag reads as the whole layer shaking.
  SPACE_FLOW_SPEED: 0.22,
  /**
   * 拖曳 / 縮放時的**視差**：粒子跟著鏡頭移動的比例。
   * 1 = 完全跟著地圖走（像貼在地圖上）；0 = 完全不動（像遠處的星）。
   * 0.35 讓它有「浮在地圖上方一點點」的深度感——完全跟著走會失去空間感，完全不動
   * 又會讓拖曳時地圖在滑而塵埃沒反應。
   *
   * **Parallax**: how much the dust follows the camera. 1 = locked to the map, 0 = fixed
   * like distant stars. 0.35 reads as floating just above the map: fully locked loses
   * the sense of depth, fully fixed makes the map slide under inert dust.
   */
  SPACE_FLOW_PARALLAX: 0.35,
  /**
   * 「基準」鏡頭比例，也就是粒子看起來**沒有被縮放**的那個比例。
   *
   * 這是 sigma「剛好裝滿整個世界」的比例（見 `resetView`：scale 1 就是全覽）。粒子以
   * 它為 1 倍，於是拉近時放大、拉遠時縮小，而不是永遠不動——那正是「縮放時位置與
   * 大小不對」的原因：粒子原本完全不理會鏡頭比例。
   *
   * The "reference" camera ratio, i.e. the ratio at which the particles appear
   * **unscaled**.
   *
   * It is sigma's "fit the whole world" ratio (see `resetView`: scale 1 is the full
   * view). Particles are 1× at this ratio, so they grow when you zoom in and shrink
   * when you zoom out instead of staying fixed — which was exactly the "wrong position
   * and scale when zooming" complaint: the dust previously ignored the camera ratio
   * entirely.
   */
  SPACE_FLOW_REF_RATIO: 1.18,
  /**
   * 群聚的「揉圓」程度，0..1。單純的 noise 流場只會形成**細長的線**；加上一個以噪聲
   * 值為中心的徑向拉力，粒子就會聚成團塊與渦流，而不是只有絲帶。值越大越團。
   *
   * How much the flow is "rounded", 0..1. A plain noise field only ever makes *thin
   * lines*. Adding a gentle pull toward high-noise centres makes the particles gather
   * into blobs and vortices too, rather than ribbons alone. Higher clumps harder.
   */
  SPACE_FLOW_CLUMP: 0.55,
  SPACE_FLOW_PARTICLE_COUNT: 520,   // 粒子數（硬上限 1000）/ count (hard cap 1000)
  // 色相「跟著場走」/ Hue follows the field.
  // 色相不再由粒子自己抽，而是取它**所在位置**的噪聲值。於是同一條絲帶上的粒子共享
  // 色相——分組一改變，顏色分組也跟著改。這才是「顏色跟隨流動」的真正意思。
  //
  // The hue is no longer the particle's own draw: it is read from the noise at the
  // particle's **position**. Every particle on one ribbon then shares a hue, so as
  // the grouping changes the colour grouping changes with it. That is what "colour
  // follows the flow" actually has to mean.
  SPACE_FLOW_HUE_SCALE: 0.0011,     // 色相取樣的空間尺度，比流動更細 / hue sample scale, finer than the flow
  SPACE_FLOW_HUE_TIME_SCALE: 0.00008, // 色相隨場漂移，比流動慢 / hue drift, slower than the flow
  SPACE_FLOW_HUE_STEPS: 24,         // 量化階數，每幀零配置 / quantisation steps, so a frame allocates nothing
  SPACE_FLOW_MIN_SIZE: 0.6,         // 最小半徑 / min radius
  SPACE_FLOW_MAX_SIZE: 1.9,         // 最大半徑（刻意小於 2.2）/ max radius (deliberately under 2.2)
  SPACE_FLOW_MIN_LIFE: 200,         // 最短生命（幀）/ shortest life, frames
  SPACE_FLOW_MAX_LIFE: 600,         // 最長生命（幀）/ longest life, frames
  SPACE_FLOW_FADE_FRACTION: 0.15,   // 淡入與淡出各佔生命的比例 / fade in and out share
  SPACE_FLOW_SEED: 'space-flow',    // 噪聲種子，讓場可重現 / noise seed, so the field is reproducible
  /** 艦隊的前後深度展開（世界單位），給 3D 場景分層用 / Depth spread for layering the fleet in 3D */
  BATTLE_FLEET_DEPTH: 40,

  // ── 地名標籤顯示 / Place Label Visibility ──────────────────────────────────
  // 純粹依「鏡頭縮放」決定：camera.ratio ≤ 此值才顯示地名，與兵力無關。
  // 舊做法用 sigma 的 labelRenderedSizeThreshold（比節點螢幕尺寸），結果是
  // 兵多的地方在拉遠時仍留著名字，看起來像沒遵守規則；而且比例被
  // itemSizesReference 抵消，那道門檻根本不是縮放門檻。
  // Purely zoom-driven: names show only while camera.ratio ≤ this value,
  // independent of garrison. The old labelRenderedSizeThreshold compared
  // on-screen node SIZE, so garrisoned places kept their names when zoomed out
  // (it read as "no rule at all"), and the ratio cancels out of that comparison
  // anyway, so it was never a zoom threshold to begin with.
  // 必須大於「聚焦單一地點」的 ratio（MAP_FIT_PADDING × MAP_FOCUS_ZOOM = 0.531），
  // 否則點擊一個地點會聚焦它、卻連那個地名都不顯示 / Must stay above the focus
  // ratio (MAP_FIT_PADDING × MAP_FOCUS_ZOOM = 0.531), otherwise clicking a place
  // would zoom right in on it and still show no name for it
  LABEL_ZOOM_RATIO: 0.6,

  // ── 節點發光與陰影 / Node Glow & Shadow ────────────────────────────────────
  // 靜態裝飾層（第二張覆蓋畫布）：節點後方先畫陰影再畫發光，營造「發亮」的層次。
  // Static decoration layer (a second overlay canvas): a shadow pass then a glow
  // pass behind every node, so the map reads as lit rather than flat.
  // 螢幕半徑低於 GLOW_MIN_RADIUS_PX 的節點不畫（太小看不出來，且省下 drawImage）。
  // Nodes whose on-screen radius is below GLOW_MIN_RADIUS_PX are skipped (invisible
  // at that size, and it saves a drawImage each).
  MAP_GLOW_SCALE: 3.2,           // 發光外徑 = 節點螢幕半徑 × 此值 / Glow diameter = node screen radius × this
  MAP_GLOW_ALPHA: 0.55,          // 發光峰值透明度（再依節點大小縮放）/ Glow peak alpha (then scaled by node size)
  MAP_GLOW_MIN_ALPHA: 0.18,      // 小節點的發光下限，避免整片糊成霧 / Floor for small nodes so the map doesn't haze over
  MAP_GLOW_MIN_RADIUS_PX: 2,     // 低於此螢幕半徑就不畫發光 / Skip glow below this screen radius
  MAP_GLOW_REFERENCE_PX: 10,     // 節點螢幕半徑達此值時發光達到峰值 / Screen radius at which glow reaches full strength
  MAP_SHADOW_SCALE: 1.5,         // 陰影外徑 = 節點螢幕半徑 × 此值 / Shadow diameter = node screen radius × this
  MAP_SHADOW_ALPHA: 0.5,         // 陰影峰值透明度 / Shadow peak alpha
  MAP_SHADOW_OFFSET_PX: 2,       // 陰影往右下偏移（px），製造立體感 / Shadow offset down-right (px) for depth

  // ── 鏡頭動畫 / Camera Animation ─────────────────────────────────────────────
  MAP_CAMERA_ANIM_MS: 480,       // 聚焦地點 / 全覽的鏡頭動畫時間（毫秒）/ Camera animation duration (ms)
  // ── 鏡頭比例（framed 空間）/ Camera ratios (framed space) ────────────────
  // Sigma 的正規化把整張圖映射成「以 (0.5,0.5) 為中心、較大軸恰為 1」的
  // 單位方形，所以「全覽整個世界」永遠是固定的 ratio 1 —— 與世界大小、
  // 節點數量都無關。這兩個值都是相對全覽的倍數，不要填絕對座標比例。
  // Sigma's normalisation maps the graph into a unit square centred on
  // (0.5, 0.5) whose larger axis is exactly 1, so "fit everything" is always
  // the constant ratio 1 — independent of world size and node count. Both
  // values below are multiples of that baseline, never absolute coordinates.
  MAP_FIT_PADDING: 1.18,         // 全覽時的留白倍數（>1 = 四周留白）/ Padding factor when fitting the whole world (>1 = margin)
  // 縮放滑桿的上下限（ratio：越小越近）。sigma 沒設定 min/maxCameraRatio 時
  // 用這兩個值當後備 / Slider bounds as camera ratios (smaller = closer). Used as
  // the fallback when Sigma leaves min/maxCameraRatio unset
  MAP_ZOOM_MIN_RATIO: 0.05,
  // 拉遠上限。「整個世界剛好放得下」是 1.18，所以這個值代表最多再多拉遠到幾倍。
  // 過去是 8 —— 但 8 倍會把整張地圖縮成一個小點，看起來就像地圖消失；而且
  // sigma 的 min/maxCameraRatio 當時並沒有真的設到鏡頭上，滾輪可以無限制地
  // 繼續拉遠。現在上限同時餵給鏡頭與滑桿，兩者行為一致。
  // Zoom-out limit, as a multiple of "the whole world just fits" (1.18). This used
  // to be 8, which shrank the world to a speck that read as the map vanishing — and
  // the bounds were never actually applied to the camera, so the wheel could run
  // arbitrarily far past it. The same limit now feeds both the camera and the
  // slider, so they agree.
  MAP_ZOOM_MAX_RATIO: 3,
  MAP_FOCUS_ZOOM: 0.45,          // 聚焦地點時相對「全覽」的放大倍數（<1 = 拉近）/ Zoom-in factor when focusing a place, relative to the fit view (<1 = closer)

  // ── 事件日誌 / Event log ──
  // 分批載入的筆數；事件總數可能上萬，一次掛載全部 DOM 會卡住 /
  // Rows loaded per page; the total can reach tens of thousands and mounting it all
  EVENT_LOG_PAGE_SIZE: 60,

  // ── 統計圖表 / Stats charts ──
  // 圖表是純 SVG，用 viewBox 座標畫，所以這些是 viewBox 單位而非 px；
  // 實際顯示大小由容器寬度決定（圖表 w-full，約 240px 寬）。
  // The charts are plain SVG drawn in viewBox units, not px; the on-screen size
  // comes from the container (the chart is w-full, roughly 240px wide).
  CHART_W: 280,                   // viewBox 寬度 / viewBox width
  CHART_H: 120,                   // viewBox 高度 / viewBox height
  CHART_PAD: 26,                  // 四邊留白，容納座標軸標籤 / Padding on all sides for axis labels
  BAR_MAX_ROUNDS: 24,             // 長條圖最多顯示的回合數，較早的回合省略 / Max rounds in bar charts, older rounds are dropped
  TREEMAP_W: 280,                 // 勢力 treemap 的 viewBox 寬度 / Faction treemap viewBox width
  TREEMAP_H: 190,                 // 勢力 treemap 的 viewBox 高度 / Faction treemap viewBox height
  TREEMAP_MAX_FACTIONS: 12,       // treemap 最多顯示的勢力數，太多會糊成一片 / Max factions drawn before it turns to mush
  RADAR_SIZE: 210,                // 雷達圖的 viewBox 尺寸 / Radar viewBox size
  RADAR_RADIUS: 68,               // 雷達圖外圈半徑 / Radar outer ring radius
  RADAR_MAX_FACTIONS: 6,          // 雷達圖最多疊加的勢力多邊形，太多會互相蓋住 / Max faction polygons overlaid before they overlap into noise
  // 游標 X 超過這個值就把提示翻到游標左側。圖表在面板裡約 240px 寬，提示最少
  // 144px（min-w-[9rem]）再加 12px 間距，所以超過約 85px 就不該再往右放；取 110px
  // 留一點餘裕給較長的勢力名。
  // Past this cursor X the tooltip flips to the cursor's left. The chart is ~240px
  // wide inside the panel and the tooltip is at least 144px plus a 12px gap, so
  // anything past ~85px will not fit on the right; 110px leaves slack for longer
  // faction names.
  CHART_TIP_FLIP_AT: 110,

  // ── 領地圖（拉遠時的面積視圖）/ Territory view (the area map when zoomed out) ──
  // 拉遠到 TERRITORY_ZOOM_RATIO 以上就把「節點 + 道路」換成「每個地方的面積」，
  // 依 owner 著色 —— 类似 Stellaris 星系圖或 CK3 省份圖。兩個值之間是淡入淡出帶，
  // 用的是 smoothstep，所以兩端都不會出現半透明的瞬間。
  // Past TERRITORY_ZOOM_RATIO the "nodes + roads" graph is replaced by the *area*
  // each place covers, coloured by its owner — like a Stellaris galaxy map or
  // CK3's province map. The band between the two values is the cross-fade, and
  // territoryAlpha() smoothsteps it so neither end has a half-transparent moment.
  TERRITORY_ZOOM_RATIO: 1.02,     // 到此比例領地圖完全顯示（全覽 1.18，所以預設視圖就是領地圖）/ Territory fully visible at this ratio (fit is 1.18, so the default view is the territory map)
  TERRITORY_FADE_RATIO: 0.74,     // 低於此比例完全消失 / Fully gone below this
  // 領地範圍往外擴張的比例（每邊）。格子邊界若剛好停在最外側的地方上，畫面會
  // 出現一條明顯的直邊；每一格都歸給最近的地方，所以外圈會自然往外延伸。
  // Grow the territory extent per side. Without this the grid stops exactly at
  // the outermost place and the view shows a hard straight edge; since every
  // cell belongs to its nearest place, the outer ring extends outward by itself.
  TERRITORY_MARGIN: 0.45,
  // 每個地方宣稱的半徑 = 半徑因子 × 最近鄰平均距離。用相對尺度（而不是固定世界
  // 座標）是因為世界密度會變：地方多時固定半徑會糊成一片，地方少時又小到看不見。
  // 每個地方的宣稱半徑 = 半徑因子 × 最近鄰平均距離 / Claim radius per place = factor × mean
  // nearest-neighbour distance. A *relative* scale, because world density changes:
  // a fixed radius smears everything when places are dense and vanishes when sparse
  TERRITORY_BLOB_RADIUS: 2.4,
  // 每軸的格數上限；實際解析度還會再依地方數量縮小 /
  // Cap on cells per axis; the real resolution also scales down with place count
  // 每軸的格數上限。格數越多，邊界曲線越平滑（放大後不會看到階梯），但密度場是
  // 每格計算，成本隨格數線性成長。560 時曲線已經相當平滑，調到 720 略為更細，
  // 再往上只是線性變慢而肉眼幾乎看不出差異。
  // Cap on cells per axis. More cells means a smoother border curve (no visible
  // stepping once upscaled), but the field is computed per cell so the cost grows
  // linearly. 560 is already smooth; 720 is slightly finer, and beyond that it is
  // just linear cost for no visible gain.
  TERRITORY_MAX_RESOLUTION: 720,
  // 領地底圖的不透明度，讓底下的星點背景仍透得出來 /
  // Base opacity of the territory fill, so the starfield behind still shows through
  // 領地是**蓋在原圖上的半透明色層**，不是重新畫一張地圖：CK3 的 map mode 就是這樣，
  // 無主之地不上色、原圖（道路／節點／地形）仍然看得見。調高就會把地圖蓋掉。
  // The territory is a translucent tint *over* the map, not a repaint of it — the
  // same idea as CK3's map modes. Unowned land is never tinted, so the roads,
  // nodes and terrain stay visible. Raise this too far and the map is buried.
  TERRITORY_FILL_ALPHA: 0.42,
  // hover 中的領地疊加亮度 /
  // Brightness of the hovered faction's overlay
  TERRITORY_HOVER_ALPHA: 0.35,
  // 邊界亮邊：往白色混多少。**逐邊**套用，所以只要薄就不會糊成一團 /
  // Rim light: mixed toward white. Applied **per side**, so keep it thin or it smears
    // Rim light: mixed toward white. Drawn on the cell's **own** pixel, so it costs one
  // cell of thickness — raise it for contrast, not for width.
  // 邊界往白色混合。畫在格子**自己**的像素上，所以厚度只有一格 —— 這個值調的是
  // 對比，不是粗細。
  TERRITORY_RIM_LIGHT: 0.78,
  // ── 領地邊界 / Territory border ───────────────────────────────────────────
  // 邊界是一條**半透明的線**，不是把勢力色提亮。提亮只是在同一塊色裡加白，看起來像
  // 漸層；一條獨立顏色的線才讀得出「這裡是邊界」。顏色與透明度都在這裡調。
  //
  // The border is a **semi-transparent line**, not a lightened faction colour.
  // Lightening adds white to the same hue and reads as a gradient; a line of its own
  // colour is what actually reads as a boundary. Both are tunable here.
  TERRITORY_BORDER_RGB: '226, 240, 255',
  TERRITORY_BORDER_ALPHA: 0.5,
  /** 邊界線寬（**螢幕像素**，與縮放無關）/ border stroke width in **screen pixels**, independent of zoom */
  TERRITORY_BORDER_PX: 1.4,
  TERRITORY_BORDER_HOVER_ALPHA: 0.85,
  // Extra rim brightness for the hovered faction, so the region you are pointing at
  // has a clearly brighter outline than its neighbours
  // 被 hover 勢力的邊界額外加亮，讓指到的區域輪廓比鄰居明顯
  TERRITORY_HOVER_RIM_LIGHT: 0.15,
  // 少於這麼多格子的勢力不標名字，否則小領地上會疊成一團 /
  // Factions below this cell count get no label, or tiny holdings stack up
  TERRITORY_MIN_LABEL_CELLS: 10,
  // 最多標幾個勢力，畫面才不會變成地名牆 /
  // Cap the labelled factions so the map does not become a wall of names
  TERRITORY_MAX_LABELS: 12,
  // 領地視圖下每「格」滾輪的縮放倍率。sigma 的 ratio 越小越近，所以往上滾
  // （deltaY < 0）要讓 ratio 變小，也就是這個倍率要 < 1。
  // Wheel zoom rate per notch while the territory layer owns the wheel. Sigma's
  // ratio is smaller when closer, so wheel up (deltaY < 0) must *reduce* the
  // ratio, which means this rate has to be below 1.
  TERRITORY_ZOOM_RATE: 1.18,
  // 一格要被算成「已佔領」所需的最低力量。沒有門檻的話任何微弱正值都會贏過「沒有
  // 勢力」，領地永遠等於各地方圓盤的聯集，勢力大小對面積毫無影響。門檻讓累積的力
  // 真的決定能推多遠：一個地方靠自己維持到約 65% 半徑，四個地方合力推到約 83%。
  // 調高 → 領地收縮、界線明確；調低 → 領地膨脹、彼此擠壓。
  // Minimum force for a cell to count as held. Without it any faint positive force
  // beats "no faction", the territory is just the union of the per-place discs, and
  // faction size has no effect on the area. This is what makes accumulated force
  // decide reach: a lone place holds ~65% of the radius, four together ~83%. Raise
  // it for tighter, clearer borders; lower it for sprawling, overlapping regions.
  TERRITORY_MIN_FORCE: 0.12,
  // 領地視圖裡，游標離地方節點多近算「指到它」。用**螢幕像素**而不是圖座標距離：
  // 這個視圖的節點很小而且會隨縮放變大變小，用圖座標的話同一個門檻在拉遠時會大到
  // 整片區域都被當成「指到某個地方」，於是勢力提示永遠出來不了。
  // How close the cursor must be to a place node for it to count as "pointing at it",
  // measured in **screen pixels** rather than graph units. The nodes are tiny here and
  // scale with zoom, so a graph-space threshold would become so large when zoomed out
  // that the whole region counts as "a place" and the faction readout could never appear.
  TERRITORY_PLACE_HOVER_PX: 14,

  // ─── 地圖顏色 / Map colours ────────────────────────────────────────────────
  // SigmaMap 裡所有硬編碼的顏色都搬到這裡。改這些值就能重新配色整張地圖，不必動
  // 元件。勢力色本身是**執行期資料**（資料庫的 hsl），不在此列。
  //
  // Every colour that was hard-coded in SigmaMap lives here. Retune the whole map by
  // editing these values, not the component. Faction colour itself is **runtime data**
  // (an hsl string from the database) and is deliberately not listed here.
  /** 道路 / roads */
  MAP_ROAD_COLOR: '#1e3a5f',
  /** 無主據點 / unclaimed settlements */
  MAP_UNOWNED_COLOR: '#374151',
  /** 據點的預設色（無勢力）/ the default node colour when unaffiliated */
  MAP_UNOWNED_NODE_COLOR: '#4a5568',
  /** 勢力標籤與地名的螢光青 / the neon cyan used for place labels */
  MAP_LABEL_COLOR: '#1EBDD6',
  /** 沒有勢力名稱時的預設文字色 / default text colour when a faction has no name */
  MAP_LABEL_FALLBACK_COLOR: '#e2e8f0',
  /** 地名缺少勢力色時的預設色 / fallback colour for a label with no faction colour */
  MAP_LABEL_FALLBACK_FACTION: '#94a3b8',
  /** territory tooltip 在無主土地上的高亮色 / the highlight used over unowned land */
  MAP_TERRITORY_FALLBACK: '#38bdf8',
  /** 聚光燈：地點「新建」的環 / spotlight ring for a newly created place */
  MAP_SPOTLIGHT_CREATED: '#22d3ee',
  /** 聚光燈：地點「被攻擊」的環 / spotlight ring for an attacked place */
  MAP_SPOTLIGHT_ATTACKED: '#f87171',
  /** 移動動畫：隊伍圓點的預設色 / the travel dot's colour when unaffiliated */
  MAP_MOVE_DOT_FALLBACK: '#5eead4',
  /**
   * 覆蓋層文字陰影與發光陰影的備援色。
   * 正常情況下應該讀取 `@theme static` 的 token（`--color-ds-void`）；只有在 token
   * 還沒被讀到（例如 canvas 初始化得太早）才會用到這個後備值，所以它必須與該
   * token 同色，否則會出現一瞬間閃爍的不同色陰影。
   *
   * Fallback for the overlay text shadow and the glow's drop shadow. The token in
   * `@theme static` (`--color-ds-void`) is the real source; this only applies if it
   * cannot be read yet (the canvas can initialise very early), so it must match that
   * token or a differently-coloured shadow will flash for a frame.
   */
  MAP_SHADOW_FALLBACK: '#020617',
} as const;

// ─── 動態佈局函數 / Dynamic Layout Functions ─────────────────────────────
// 根據節點數量動態調整 ForceAtlas2 參數
// Dynamically adjust ForceAtlas2 parameters based on node count

/**
 * 根據節點數量動態計算 scalingRatio。
 * Dynamic scalingRatio based on node count.
 * 100 節點 → 15，2000 節點 → 30
 * 避免節點太少時太散、太多時太擠
 * Prevents too-sparse at low count, too-dense at high count
 */
export function getScalingRatio(nodeCount: number): number {
  const min = 15;
  const max = 30;
  const minNodes = 100;
  const maxNodes = 2000;
  if (nodeCount <= minNodes) return min;
  if (nodeCount >= maxNodes) return max;
  return min + ((nodeCount - minNodes) / (maxNodes - minNodes)) * (max - min);
}

/**
 * rng.gaussian() 使用 truncate（截斷）而非 resample（重抽）。
 * 這意味為邊界值（CHAR_ABILITY_MIN=5 和 CHAR_ABILITY_MAX=30）會累積。
 * 若需避免邊界值偏多，改用 resample 並在 Rng.gaussian() 中實作。
 * rng.gaussian() uses truncate, not resample. Boundary values accumulate.
 */

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
