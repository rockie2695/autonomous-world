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
  // 屬性 (wu/tong/ti/jing/speed) 使用均勻分佈 5-30。
  // Stats (wu/tong/ti/jing/speed) use uniform distribution 5-30.
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
  // The defection base uses a normal distribution μ=17, σ=5 (clamped to 5-30).
  CHAR_START_AGE: 20, // 所有角色起始年齡為 20 / All characters start at age 20
  CHAR_START_TROOPS: 1, // 新角色至少帶 1 名士兵，避免剛出現時完全無人 /
    // A new leader starts with at least 1 soldier, so they are never completely empty on arrival
  CHAR_MAX_AGE_MIN: 50, // 最小隨機最大年齡（因年老死亡）/ Min random maxAge (death from old age)
  CHAR_MAX_AGE_MAX: 80, // 最大隨機最大年齡 / Max random maxAge

  // ── 生育 / Childbirth ─────────────────────────────────────────────
  // 年齡落在 [CHILD_PARENT_AGE_MIN, CHILD_PARENT_AGE_MAX] 之間的存活將領，
  // 每回合有 CHILD_BIRTH_CHANCE 的機率生下一名成年子女。子女一出生就是
  // CHILD_START_AGE 歲（已成年），並且已經繼承父親的勢力與所在地。
  // A living leader aged within [CHILD_PARENT_AGE_MIN, CHILD_PARENT_AGE_MAX] has
  // CHILD_BIRTH_CHANCE per round of having a child. A child is born already mature
  // at CHILD_START_AGE and has already joined the father's faction and place.
  CHILD_BIRTH_CHANCE: 0.06, // 每回合生子機率 / per-round chance of a child
  CHILD_MIN_COUNT: 0, // 最少子女數 / minimum children
  CHILD_MAX_COUNT: 3, // 最多子女數 / maximum children
  CHILD_PARENT_AGE_MIN: 40, // 可生子的最小年齡 / youngest age that can father a child
  CHILD_PARENT_AGE_MAX: 70, // 可生子的最大年齡 / oldest age that can father a child
  CHILD_START_AGE: 20, // 子女出生年齡（成年）/ age a child is born at (already mature)
  // 子女姓父亲的姓（傳統風格取首字；稱號風格取「·」之前的部分），名不同。
  // A child takes the father's surname (first character in classic style, the part
  // before "·" in epithet style) with a different given name.

  CHAR_ABILITY_MIN: 5, // wu, tong, ti, jing 最小值 / Min value for wu, tong, ti, jing
  CHAR_ABILITY_MAX: 30, // wu, tong, ti, jing 最大值 / Max value for wu, tong, ti, jing

  CHAR_SPEED_MIN: 5, // 最小速度 (v1.1) / Min speed (v1.1)
  CHAR_SPEED_MAX: 30, // 最大速度 (v1.1) / Max speed (v1.1)
  CHAR_SPEED_MEAN: 17, // 常態分佈平均值 / Normal distribution mean
  CHAR_SPEED_SIGMA: 5, // 常態分佈標準差 / Normal distribution std dev

  CHAR_DEFECTION_BASE_MIN: 5, // 最小野心值 / Min defectionBase value
  CHAR_DEFECTION_BASE_MAX: 30, // 最大野心值 / Max defectionBase value
  CHAR_DEFECTION_BASE_MEAN: 17, // 常態分佈平均值 (μ) / Normal distribution mean (μ)
  CHAR_DEFECTION_BASE_SIGMA: 5, // 常態分佈標準差 (σ) / Normal distribution std dev (σ)

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
  CHAR_BUY_TROOP_BASE: 30, // tong 倍率作用的基準批量（tong 決定一次買多少）/ The base batch the tong multiplier scales
  CHAR_BUY_TROOP_JITTER: 0.25, // 基準批量上下抖動比例 / Jitter fraction around the base batch
  CHAR_BUY_TROOP_MAX: 100, // 每次購買最多士兵數 / Max troops per purchase

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

  // ── 野心事件 / Defection Events ──────────────────────────────────────────
  // 野心如何根據遊戲事件變化 / How defectionBase changes based on game events
  // (tong no longer suppresses defection, at all. Two keys are gone: the original
  // `AMBITION_KING_TONG_REDUCE` multiplier, and then `AMBITION_KING_TONG_DELTA`, which kept
  // living on in the ledger after the multiplier was retired and so still quietly fed the
  // defection value every round. Leadership now only decides how many troops one purchase can
  // buy — see `tongPurchaseMultiplier` in server/income.ts.)
  //
  // 兩個都拿掉了：原本的 `AMBITION_KING_TONG_REDUCE` 乘數，之後是 `AMBITION_KING_TONG_DELTA`
  // —— 後者在前者退休之後仍然留在帳本裡，所以每回合都還在餵著叛變值。統領現在只決定「一次能買
  // 多少兵」（見 server/income.ts 的 `tongPurchaseMultiplier`）。
  DEFECTION_NO_PROMOTION_ROUNDS: 20, // 未晉升回合數 → 野心上升 / Rounds without promotion → defectionBase up
  DEFECTION_NO_PROMOTION_DELTA: 1, // 每 20 回合野心增加量（整數）/ Defection-value increase per 20 rounds (integer)
  DEFECTION_ADMIN_REPLACED_DELTA: 1, // 被免去行政官職務時野心 +1 / +1 defectionBase when removed as administrator
  DEFECTION_ADMIN_ASSIGNED_DELTA: 1, // 取得行政官職務 → 帳本 -1（永久，沒有自動回復）/ granted administrator -> -1 on the ledger (permanent, no revert)
  // 叛變後的冷卻：叛變本身**不再**重骰野心，改成往帳本寫一筆負的 delta，
  // 忠誠檢查把它加總進叛變值，于是這段期間內此人較不容易再叛變。
  //
  // Defection cooling: defecting no longer re-rolls defectionBase. Instead a negative delta is
  // written to the ledger, which loyaltyCheck sums into the defection value, so for the
  // next few rounds that leader is markedly less likely to defect again.
  //
  // **每次叛變各自記一筆，所以會疊加**：短時間內叛變兩次就是 −4，冷卻是疊加的，
  // 不是「最多 −2」——這是刻意的，因為連續叛變代表的是更強的傾向。
  // One row per defection, so they **stack**: two defections in quick succession is -4.
  // The cooling is additive rather than capped at -2 on purpose — defecting twice in a
  // row is evidence of a stronger tendency, and clamping it would throw that away.
  //
  // 只寫帳本、不寫可見 Event：一個世界每回合會有上百人符合條件，逐筆寫進事件日誌
  // 只會淹掉其他資訊。DefectionEvent.reason 已經記錄原因。
  // Ledger only, no visible Event: a hundred-odd leaders would match per round and the
  // event log would drown. `DefectionEvent.reason` already carries the reason.
  DEFECTION_COOLING_DELTA: -2, // 每次叛變寫入的 delta / Delta written per defection
  DEFECTION_COOLING_ROUNDS: 20, // 影響持續回合數 / Rounds the -2 keeps applying

  // ── 朋友叛逃 / A friend defects ──────────────────────────────────────────
  // 朋友叛逃會**提高**他的叛變值——與冷卻相反，正向的。身邊的人走了，
  // 自己也更想走。
  //
  // A friend's defection **raises** yours — the opposite sign to the cooling, which is
  // negative. People around you leaving makes you likelier to leave too.
  //
  // **每個朋友各自計算、所以會疊加**：兩位朋友叛逃是 +4。這與冷卻同一條規則
  // （「每次事件各自帶 delta」），因為兩者都是同一份帳本的加項。
  //
  // **Stacks per friend**, so two friends defecting is +4 — the same rule as the cooling,
  // because both are just addends on the same ledger.
  //
  // 但**同一位朋友叛逃兩次只算一次**：重複的背叛已經由冷卻記過一次帳，在兩條規則下
  // 各記一次是重複計數。
  //
  // One friend defecting **twice still counts once**: the repeat is already billed by the
  // cooling, and billing it a second time under a second rule is double-counting.
  DEFECTION_FRIEND_DELTA: 2, // 每位叛逃的朋友寫入的 delta / Delta written per friend who defected
  DEFECTION_FRIEND_ROUNDS: 10, // 影響持續回合數 / Rounds a friend's defection keeps counting

  // ── 新王登基 / A new king ascends ────────────────────────────────────────
  // 勢力換了新君王（老王過世或戰死，最年長子女繼位）之後是權力交接的窗口：
  // 手下將領更想動。帳本形制與冷卻相同——**每回合各寫一筆**，窗口過了自然停止；
  // 君王本人不在名單上（他不會叛變，而且他是交接的受益人）。
  //
  // A faction with a freshly ascended king (an heir after a natural or battle
  // death) is in a hand-over window: its leaders are likelier to move. The ledger
  // shape matches the cooling — **one row per round**, stopping on its own when the
  // window closes. The king himself is not on the list (he never defects, and he
  // is the transition's beneficiary, not the wavering party).
  DEFECTION_NEW_KING_DELTA: 2, // 新王窗口內每回合的 delta / Delta per round inside the new-king window
  DEFECTION_NEW_KING_ROUNDS: 10, // 窗口持續回合數 / Rounds the window stays open

  // ── 叛變 / Defection ─────────────────────────────────────────────────────
  // 野心是**固定的初始值**（和 ti／wu／tong 一樣），不再隨事件被改寫；會變的是
  // 「叛變值」，而它**不存資料庫**、每回合重算。
  //
  // The defection base is a fixed initial stat (like ti / wu / tong) and is no longer rewritten by
  // events. What moves is the **defection value**, which is recomputed every round and
  // deliberately **not stored**.
  //
  // 機率是線性的：平均（17.5）時剛好等於基底機率，遠高於平均才明顯上升。
  // The chance is linear: exactly the base rate at the mean (17.5), rising noticeably only
  // well above it.
  DEFECTION_BASE_RATE: 0.05, // 叛變值等於平均值時的每回合機率 / Per-round chance at the mean defection value
  DEFECTION_VALUE_LOYALTY_PENALTY: 2, // 忠誠標籤與君王不同 → 叛變值 +2 / Loyalty tag differs from the king's -> +2
  // 事件影響**不設常數**：每筆 DefectionEvent 自帶 delta，直接從資料庫加總。
  // 只有忠誠標籤是寫死的，因為它是標籤比較、不會產生 DefectionEvent，沒有 delta 可加。
  // No constant for events: each DefectionEvent carries its own delta, summed straight from
  // the database. Only the loyalty tag is hardcoded, being a tag comparison that never
  // produces an DefectionEvent and so has no delta to read. if still in office

  // ── 行政官冷卻 / Administrator Cooldown ────────────────────────────────────
  ADMIN_CHANGE_COOLDOWN_ROUNDS: 10, // 換領導後 N 回合內 AI 不得再更換 / AI paths blocked for N rounds after a leader change

  // ── 友誼 / 不滿 ─────────────────────────────────────────────────────────
  // 關係每回合在附近角色間隨機形成
  // Relationships form randomly between nearby characters each round
  FRIEND_FORM_CHANCE: 0.05, // 每對合適配對 5% 機率 / 5% chance per eligible pair
  // 不滿與友誼一樣是**互相的**：一次擲骰，寫入兩個方向的資料列。
  //
  // Discontent is mutual, exactly like friendship: one roll, both directions written.
  DISCONTENT_FORM_CHANCE: 0.05, // 每對合適配對 5% 機率 / 5% chance per eligible pair

  // ── 同地點的關係影響戰鬥力 / Co-located relations affect combat ────────────
  // 朋友在**同一個地點**時，提高該將領的武力（攻擊）與體魄（防禦）；不滿的人同地點時，
  // 則降低。兩者都只影響**計算**——不改寫 `Character` 的任何欄位，所以「離開就回復」
  // 是自動的：penalty 每次都從目前的位置重新推導。
  //
  // A friend at the **same place** raises that leader's martial (attack) and physique
  // (defence); someone they are unhappy with at the same place lowers them. Both are
  // calculation-only — no `Character` column is rewritten — so "reverts when they separate"
  // is automatic: the penalty is re-derived from current positions every time.
  //
  // 數值是**帶符號**的，所以「方向」本身也在設定裡。
  //
  // The values are **signed**, so the direction lives in the config too.
  FRIEND_SAME_PLACE_DELTA: 1, // 朋友同地 → 武力/體魄 +1 / a friend alongside -> +1 martial & physique
  DISCONTENT_SAME_PLACE_DELTA: -1, // 不滿同地 → 武力/體魄 -1 / someone resented alongside -> -1

  // 每種關係**各自**最多計幾位。沒有上限的話，十位同地點的朋友就是 +10 武力，而整個
  // 能力區間只有 5–30，那一下就淹沒了整條刻度。
  //
  // How many relations of each kind count. Without a cap, ten friends standing together would
  // be +10 martial while the whole ability band is 5–30 — one swing swamping the scale.
  RELATION_SAME_PLACE_MAX: 3, // 每種關係的計數上限 / cap per relation kind

  // ── 經濟 / Economy ───────────────────────────────────────────────────────
  // 收入分配：君王 30%、行政官 40%、其他 30%（平分）
  // 沒有行政官時誰都不拿；沒有其他人或沒有君王時，缺席者的份額由在場者接手
  // 詳見 server/income.ts
  //
  // Income distribution: king 30%, administrator 40%, everyone else 30% (shared equally).
  // With no administrator nobody is paid; a vacant king or an empty "others" bucket has its
  // share absorbed by whoever is present. See server/income.ts.
  PLACE_BASE_INCOME: 10, // 每回合每個地點基礎金錢 / Base gold per round per place
  PLACE_MARKET_INCOME_PER_LV: 5, // 每級市場額外金錢 / Extra gold per market level
  // ── 收入分配比例（Oct 2026：君王 30→10，行政官 40→60——把君王的 20% 挪給實際管事的人）──
  // 三份是**結構性**的：君王在場 10 + 60 + 30 = 100；君王缺席時行政官吸走他的 10%
  // （70%）；沒有其他人時行政官再吸走 30%（90%）——加總永遠 ≤ 100%，floor 的餘數
  // 由「其他人」或行政官接手。
  // ── The income shares (Oct 2026: king 30→10, admin 40→60 — 20% moved from the
  // king to the one actually running the place) ──
  // The three shares are **structural**: king present 10 + 60 + 30 = 100; with the
  // king absent the administrator absorbs his 10% (70%); with nobody else present
  // he absorbs the others' 30% too (90%) — the sum is always ≤ 100%, and the floor
  // remainder is folded into "everyone else" or the administrator.
  INCOME_KING_SHARE: 0.1, // 君王的收入份額（可被 jing 放大）/ King's cut of place income (scaled by jing)
  INCOME_ADMIN_SHARE: 0.6, // 行政官的收入份額（金額最大，因為實際管事）/ Administrator's cut (the largest, since they actually run the place)
  INCOME_OTHER_SHARE: 0.3, // 其他角色共享 / Shared among other characters
  // jing（經濟）以「平均」為基準放大或縮小領導者的份額：一般將領的倍率是 1.0，
  // 高 jing 多拿、低 jing 少拿。17.5 是 jing 均勻分佈 (5–30) 的平均值。
  // jing (economy) scales a leader's cut around the average: an average leader's multiplier
  // is 1.0, a high-jing one pockets more, a low-jing one less.
  // 17.5 is the mean of jing's uniform 5–30 distribution.
  INCOME_JING_MIDPOINT: 17.5,

  // ── 購兵數量 / Troop purchase size ──────────────────────────────────────────
  // tong（統領）以「平均」為基準放大或縮小**購兵量**，公式與 jing 對收入的完全相同：
  //   購買上限 = 基礎上限 × (1 + (tong − INCOME_TONG_MIDPOINT) / CHAR_ABILITY_MAX)
  // 也就是說 tong 決定一個將領「一次買得到幾個兵」，而不是他防禦多強或部下多忠誠。
  //
  // tong (leadership) scales the **size of one troop purchase** around the average, with
  // exactly the formula jing uses for income:
  //   purchase cap = base cap × (1 + (tong − INCOME_TONG_MIDPOINT) / CHAR_ABILITY_MAX)
  // So tong decides how many troops a leader can buy at once — not how well they defend
  // (that is 體魄 / ti) and not how loyal their subordinates are.
  //
  // 17.5 是 tong 均勻分佈 (5–30) 的平均值 / 17.5 is the mean of tong's uniform 5–30 range
  INCOME_TONG_MIDPOINT: 17.5,

  // 建築成本（指數成長：base × 2^level）
  // Building costs (exponential: base × 2^level)
  // ── 地點列表 / Place list ─────────────────────────────────────────────────
  // 「地點」分頁一次顯示多少列，之後捲到底再載入更多。世界可以到 2000 個地點，一次全部
  // 渲染等於每次開分頁都重建整個列表 / Rows shown at once in the 地點 tab, then more on
  // scroll. The world can hold 2000 places, so rendering them all means rebuilding the
  // whole list every time the tab opens.
  PLACE_LIST_PAGE_SIZE: 100,

  BUILDING_UPGRADE_COST_BASE: 100,
  BUILDING_UPGRADE_COST_MULT: 2, // 成本 = base × mult^level / Cost = base × mult^level

  // ── 軍事 / Military ──────────────────────────────────────────────────────
  // 徵兵：基礎 + 兵營加成
  // Recruitment: base + barracks bonus
  PLACE_BASE_RECRUIT: 2, // 每回合基礎徵兵數 / Base troops recruited per round
  PLACE_BARRACKS_RECRUIT_PER_LV: 3, // 每級兵營額外徵兵數 / Extra recruits per barracks level

  // ── 戰鬥 / Battle ────────────────────────────────────────────────────────
  // atk = attacker.troops × (1 + wu/30) × rand(0.85, 1.15)
  // def = defender.troops × (1 + ti/30) × (1 + fortress×0.2) × rand(0.85, 1.15)
  //
  // 防守端用**體魄 (ti)**，不是統領 (tong)。兩者公式相同（都走 `× (1 + x/30)`），但講的是
  // 不同的事：wu 是「打得多痛」，ti 是「守得多穩」。tong 現在只影響購兵數量。
  //
  // Defence uses **體魄 (ti)**, not leadership (tong). The two share a formula — both are
  // `× (1 + x/30)` — but they answer different questions: wu is "how hard they hit", ti is
  // "how well they hold". tong now only affects how many troops a leader can buy.
  // ── 多回合戰爭 / Multi-round war ──
  // 戰鬥不再一回合決勝負：被擊中扣**兵力**（HP 制），戰爭持續到一方潰敗。
  // BATTLES NO LONGER END IN ONE ROUND: a hit costs **troops** (HP-style) and the war
  // lasts until one side breaks.
  BATTLE_HITS_PER_KILL: 8, // 每點攻擊力換算的士兵傷害分母 / attack power divided by this (x defence) = troops lost per strike
  BATTLE_WAR_FATIGUE: 0.95, // 每輪全員疲勞乘數 / per-round fatigue multiplier for every combatant
  BATTLE_ROUT_RATIO: 0.5, // 攻方剩餘 < 守方剩餘 × 此值 → 潰逃 / attackers rout when below this fraction of the defence
  BATTLE_MAX_ROUNDS: 8, // 戰爭最大輪數，超過攻方退兵 / max war rounds before the attackers retreat
  // 戰報回放節奏（彈窗內的動畫）/ the report's replay pacing (in-modal animation)
  BATTLE_REPLAY_STRIKE_MS: 600,
  BATTLE_REPLAY_PAUSE_MS: 900,
  // 出手紀錄的保留輪數：超過就刪（舊戰爭不能回放是刻意取捨）/
  // Strike-log retention in rounds: older strikes are deleted (old wars losing
  // their replay is a deliberate trade-off)
  BATTLE_STRIKE_RETENTION_ROUNDS: 20,
  BATTLE_RANDOM_MIN: 0.85, // 隨機變異下限 / Random variance lower bound
  BATTLE_RANDOM_MAX: 1.15, // 隨機變異上限 / Random variance upper bound
  BATTLE_ATK_WU_MULT: 1 / 30, // wu 對攻擊力的貢獻 / Wu contribution to attack power
  BATTLE_DEF_TI_MULT: 1 / 30, // 體魄對防禦力的貢獻 / 體魄 contribution to defense power
  BATTLE_FORTRESS_DEF_MULT: 0.2, // 堡壘等級防禦加成（每級 20%）/ Fortress level defense bonus (20% per level)

  // AI 開打前估量的勝算門檻：估計攻方戰力（兵力 × (1 + 武力/30)，骰取期望值 1.0）
  // 必須 ≥ 估計守方防禦（駐軍 + 守軍將領兵力 × (1 + 體魄/30)，再乘堡壘倍率）的此倍數，
  // aiMove 才會開打。係數與 battle.ts 的攻防式**同一組**——估量不得引用模擬沒用的數字。
  // 打不過就原地等待（經濟階段購兵，下回合再評估），不再隨機衝進必輸的仗。
  // 1.2 = 要求兩成優勢當安全邊際：骰值範圍 0.85–1.15，兩成的餘裕讓單次壞骰
  // 不至於翻盤。調低 → 將領更敢打（送頭變多）；調高 → 更多等待與囤兵。
  //
  // The AI's pre-battle odds threshold: the estimated attack (troops × (1 + wu/30),
  // rolls at their expected 1.0) must be at least this multiple of the estimated
  // defence (garrison + defending leaders' troops × (1 + ti/30), times the fortress
  // multiplier) before aiMove engages. The coefficients are the **same** as
  // battle.ts's formulas — an estimate may not quote numbers the fight does not use.
  // When nothing is winnable the leader waits in place (the economy phase re-arms
  // him) instead of charging into a losing battle.
  // 1.2 = demanding a 20% edge as a safety margin: the rolls span 0.85–1.15, so a
  // 20% cushion survives one bad roll. Lower → bolder AI (more suicides); higher →
  // more waiting and stockpiling.
  AI_ATTACK_ADVANTAGE: 0.8, // 敢不敢啃：估計戰力 ≥ 守方估計防禦 × 此值就開打（勢均力敵也能開戰，多回合磨到分出勝負）/ dare-to-bite: engage when the estimated attack reaches this fraction of the estimated defence

  // ── 消費性格的儲備率 ──
  // 行政官買兵前留在口袋裡的比例（只有行政官有建築要蓋；非行政官不留儲備）。
  // 武人 0：錢全部換成兵；守將／商人 0.5：一半留給堡壘／市場；均衡 0.25。
  // 儲備不是帳戶，是**每回合**的比例——下回合收入進來，比例重算。
  // ── Spending-posture reserve rates ──
  // The share of gold an administrator keeps aside before buying troops (only
  // administrators have a building to raise; anyone else keeps no reserve).
  // Aggressive 0: every coin becomes soldiers; guardian/merchant 0.5: half saved
  // for the fortress/market; balanced 0.25. The reserve is not an account — it is
  // a **per-round** fraction, recomputed as income arrives.
  SPEND_RESERVE_AGGRESSIVE: 0,
  SPEND_RESERVE_BALANCED: 0.25,
  SPEND_RESERVE_GUARDIAN: 0.5,
  SPEND_RESERVE_MERCHANT: 0.5,

  // ── 信號 / Signals ───────────────────────────────────────────────────────
  // 君王號令：危急馳援、武人進攻（見 server/phases/signals.ts 與 kingSignal.ts）。
  // 目標按**邊界**選（自家地方相鄰的敵地／最危急的自家地方），沒有跳數概念——
  // 舊的 SIGNAL_RANGE（發送者最大道路跳數）從未被任何程式讀取，已刪除。
  // The king's call: relieve the urgent, attack the weakest border (see
  // server/phases/signals.ts and kingSignal.ts). Targets are chosen by the **border**
  // (own places' hostile neighbours / the most urgent own place) with no hop-count
  // notion — the old SIGNAL_RANGE (max road-hops from the sender) was read by no
  // code and has been removed.
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

  // ── 回合執行看門狗 / Round-Running Watchdog ────────────────────────────────
  // 「下一回合正在跑」旗標（World.roundRunning）超過這個毫秒數仍未清除，輪詢入口
  // 就自癒解鎖——正常回合只要幾秒到幾十秒，5 分鐘是餘裕；後端重啟丟掉 globalThis
  // 上的工作時，這是唯一能把按鈕解鎖回來的機制。
  // When World.roundRunning stays set past this many milliseconds, the poll routes
  // heal it back to false — a normal round takes seconds to tens of seconds, so 5
  // minutes is headroom; when a restart drops the in-memory job, this watchdog is
  // the only thing that re-enables the button.
  ROUND_RUNNING_WATCHDOG_MS: 300_000,

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

  // ── 星系（放大地圖時的星系效果）/ Star systems ───────────────
  // 放大進一個地點時，那個地點長得像一個星系（星中心優雨 + 輪道圓环）而不只是一個點。
  // Zoomed in on a place, that place reads as a star system — a bright core with orbital
  // rings — rather than a bare dot. The threshold is a zoom RATIO, and sigma's ratio is
  // SMALLER when closer, so "zoomed in" is `camera.ratio <= MAP_STAR_ZOOM_RATIO`.
  MAP_STAR_ZOOM_RATIO: 0.2,        // 放大到这個 ratio 以入就顯示星系效果 / Star systems appear at or below this ratio

  // 星系大小**不隨兵力變化**：放大到星系層時，每個地點都是一個同樣大小的星系，
  // 而不是「兵多就大一點的圓點」。
  //
  // A star system's size does not follow the garrison: once zoomed in, every place is a
  // system of the same size rather than a dot that happens to be bigger when it holds
  // more troops.
  //
  // 但它**跟著鏡頭走**。下面所有 `*_PX` 都是「剛進入星系層時」的螢幕像素，實際畫出來
  // 的尺寸一律乘上 `starScale`：
  //
  //     starScale = clamp( (MAP_STAR_ZOOM_RATIO / ratio) ^ MAP_STAR_ZOOM_SCALE_EXPONENT )
  //
  // 以 `MAP_STAR_ZOOM_RATIO` 當基準，所以**剛跨過門檻那一幀是 1×，與改動前完全一致**，
  // 沒有跨門檻時的跳變。指數 0.5 就是 sigma 自己縮放節點的 `size / sqrt(ratio)`，
  // 所以星系和一般地點對縮放的的反應一模一樣。
  //
  // Every `*_PX` below is the size at the moment star view is entered, and whatever is
  // actually drawn is multiplied by `starScale`. Anchoring on `MAP_STAR_ZOOM_RATIO` means
  // the crossing frame is exactly 1× — identical to before, so there is no jump — and an
  // exponent of 0.5 reproduces sigma's own `size / sqrt(ratio)`, so a system reacts to zoom
  // exactly the way a place node does. Over the whole star band (ratio 0.2 → 0.05) that is
  // 1× → 2×.
  //
  // 兵力大小在星系層就**不再**看得到（要看得更遠，或看右側面板）。代價是真的 ——
  // 這一檔要讀的是星系的數量與分佈。
  // The garrison is genuinely no longer readable at this zoom, and the number and spread
  // of systems is what this level of zoom is for instead.
  MAP_STAR_ZOOM_SCALE_EXPONENT: 0.5, // starScale 指數 / exponent (0.5 = sigma's own scaling)
  MAP_STAR_ZOOM_SCALE_MIN: 1,// starScale 下限，永遠不小於剛進入時的樣子 / floor
  MAP_STAR_ZOOM_SCALE_MAX: 2,// starScale 上限，防止最靠近時星系大到互相重疊 / ceiling
  MAP_STAR_SYSTEM_RADIUS_PX: 46,  // 星系外緣半徑（螢幕像素）/ System outer radius (screen px)

  // 太陽由 sigma 的節點圓盤畫，**不是**畫在覆蓋層上。理由是繪圖順序：覆蓋層的
  // DOM 在 sigma 的 WebGL canvas **之前**，所以覆蓋層畫的東西會被道路壓在下面。
  // 道路若穿過太陽中心會是一道黑線穿過亮點。讓 sigma 自己畫這個圓盤，
  // 順序就自動變成「道路 → 太陽」，和一般節點的層級完全一致。
  //
  // The sun is drawn by Sigma's own node disc, NOT on the overlay. The overlay canvas
  // sits BEFORE sigma's WebGL canvas in the DOM, so anything drawn there gets painted
  // over by the roads — a dark line straight through a bright sun. Letting sigma draw
  // the disc keeps the ordering "roads then sun", identical to a normal node.
  MAP_STAR_SUN_SCREEN_PX: 11,     // 太陽半徑（螢幕像素）/ Sun radius (screen px)
  //
  // The sun is **no longer one colour**. Each star draws one of these spectral classes from
  // its place id, so no two systems look alike.
  //
  // 太陽的顏色**不再是同一個**。每一顆太陽從這組「光譜級」裡挑一個，由地點 id 決定，
  // 所以每個星系看起來都不一樣。
  //
  // `core` is the disc itself (Sigma draws it) and `edge` is the outer glow. They travel as
  // a pair, or a sun ends up looking like one core wearing another star's halo.
  //
  // `core` 是圓盤本身（由 sigma 畫），`edge` 是柔光的外圈。兩者必須成套共用，否則太陽會
  // 看起來像「一個核心配著別顆恆星的光暈」。
  //
  // ── `core` 必須自己帶得住這個類別，這是這一組值的重點 ────────────────────────────────
  // 之前六個 `core` **全部都是白的**（離純白 0–37，兩個最接近的只差 7.2）。於是**圓盤本身
  // 完全不帶類別資訊**：每一顆太陽都是一個白點，唯一的差別落在背後 16px、0.5 不透明度
  // 的柔光上。而讀者認一顆星靠的正是**它的本體**，不是背後的光暈——所以實際看起來是
  // 「一樣的白太陽，只是外套略有不同」。
  //
  // **The load-bearing rule: `core` must carry the class itself.** The six `core` values used
  // to be *all white* (0–37 from pure white; the closest pair just 7.2 apart). The disc
  // therefore carried no class information at all — every sun was a white dot and the only
  // difference sat in a 16px, 0.5-alpha glow *behind* it. But a star is identified by its
  // **body**, not by the halo behind it, so what you actually saw was "identical white suns
  // wearing slightly different jackets". `mapShared.test.ts` now asserts the cores are
  // separable, so they cannot quietly wash out again.
  //
  // ── 為什麼現在可以有顏色了 ───────────────────────────────────────────────────────────
  // 舊的禁令是「不要深紅、不要深藍」，因為軌道是勢力的通道，怕太陽的顏色蓋掉它。真正的
  // 衝突是**低明度的深色**，不是「有色」本身。所以現在的規則是**亮，而不是淡**：每個
  // `core` 的亮度都在 149–255 之間（真實的亮星就是這樣），而太陽是 11px 的小圓盤、軌道是
  // 細環——本體亮著、勢力色留在環上，兩者不會搶。
  //
  // The old rule banned **deep** red and blue because the orbits are the faction channel. The
  // real conflict is **darkness**, not hue. So the rule is now "bright, not pale": every
  // `core` sits at luminance 149–255 (which is how real bright stars look), while the sun is
  // an 11px disc and the orbits are thin rings. The body glows; the faction colour stays on
  // the rings. Neither has to yield.
  MAP_STAR_SUN_CLASSES: [
    { core: '#ff7d72', edge: '#ff3b4d' }, // 紅巨星 / red giant
    { core: '#ffa348', edge: '#ff8c1a' }, // 橙星 / orange
    { core: '#ffe27a', edge: '#ffc233' }, // 黃星 / yellow
    { core: '#ffffff', edge: '#ffe9b0' }, // 白星 / white
    { core: '#bcd8ff', edge: '#7fb0ff' }, // 藍白星 / blue-white
    { core: '#7fc4ff', edge: '#3fa9e8' }, // 冰藍星 / ice
  ],
  MAP_STAR_SUN_GLOW: 16,          // 太陽外柔光半徑（px）/ Sun outer glow radius (px)
  MAP_STAR_SUN_GLOW_ALPHA: 0.5,   // 柔光不透明度 / Glow opacity
  MAP_STAR_SUN_PULSE_MS: 2400,    // 太陽明暗半週期（毫秒）/ Sun brightness half-period (ms)
  MAP_STAR_SUN_PULSE_AMP: 0.12,   // 呼吸時大小變化比例 / Size swing while breathing

  // 行星對組：純粹從地點的 id 確定性抽出，不存任何東西。完全是裝飾，
  // 不參與收入、防禦，因為那需要一套對應的模擬邏輯，而假的只會看起來像那樣。
  //
  // Planet sets are derived from the place id alone, deterministically and with nothing
  // stored: purely decorative, because giving them gameplay meaning would need a
  // simulation for it, and a mock would only look like one.
  MAP_STAR_PLANET_MIN: 1,         // 至少一顆行星（使用者要求）/ At least one planet (required)
  MAP_STAR_PLANET_MAX: 4,         // 最多幾顆行星 / Most planets a system may have
  MAP_STAR_PLANET_INNER_RATIO: 0.34, // 內圈半徑（星系的幾倍）/ Inner orbit, as a fraction of the system radius
  MAP_STAR_PLANET_ORBIT_STEP: 0.17, // 每多一顆行星，軌道外推多少 / Orbit growth per extra planet
  MAP_STAR_PLANET_TILT_DEG: 26,  // 軌道最大傾斜（度）/ Maximum orbit tilt (degrees)
  MAP_STAR_PLANET_SQUASH: 0.42,   // 軌道橢圓壓扁比例（1 = 正圓）/ Ellipse squash (1 = circle)
  MAP_STAR_PLANET_MIN_PX: 3.2,    // 行星最小半徑（px）/ Smallest planet radius (px)
  MAP_STAR_PLANET_MAX_PX: 6.5,    // 行星最大半徑（px）/ Largest planet radius (px)
  MAP_STAR_PLANET_ORBIT_MS: 14000, // 內圈一圈的時間；外圈依開普勒第三式更慢 /
                                   // One inner orbit; outer ones slow by Kepler's third law
  MAP_STAR_ORBIT_COLOR_ALPHA: 0.75, // 軌道線不透明度 / Orbit line opacity
  MAP_STAR_ORBIT_WIDTH: 1.2,      // 軌道線寬（px）/ Orbit line width (px)
  // 無主之地的軌道顏色。**不能**沿用節點本身的無主色：那是刻意壓暗的灰，在近黑的
  // 背景上畫 50% 透明度等於沒畫，整個星系會只剩一個太陽。給它一個站得住的冷色 /
  // Orbit colour for unowned land. It must NOT reuse the node's own unowned colour: that is
  // a deliberately dimmed grey, and at 50% alpha on a near-black background it is
  // indistinguishable from nothing — the whole system would collapse to just a sun.
  MAP_STAR_ORBIT_COLOR_UNOWNED: '#7fd4e8',
  MAP_STAR_PLANET_COLORS: ['#9fd8ff', '#ffd9a0', '#c8b6ff', '#a8e6c4', '#ffb3c1', '#e8d7a0'],
  // 行星色偏冷、飽和度低：底層已經是暖色太陽與彩色的道路，行星再搶眼會打架。
  // Planet colours lean cool and desaturated: the sun is already warm and the roads are
  // already coloured, so planets that shout would fight both.

  // 月球繞的是**行星**，半徑必須在行星之外。舊版用節點半徑的 0.34 倍，
  // 整圈月球都在圓盤裡面——那正是「月球和行星都跑到地點裡面去了」的原因。
  //
  // Moons orbit the **planet**, and their orbit radius has to be outside it. The old
  // version used 0.34 × the node radius, so every moon sat *inside* the disc — which is
  // exactly why the moons and planets looked like they were inside the place.
  MAP_STAR_MOON_MAX: 3,           // 每顆行星最多幾個月球 / Most moons a planet may have
  MAP_STAR_MOON_GAP_PX: 3.2,      // 月球軌道半徑 = 行星半徑 + 這個值 / Moon orbit radius = planet radius + this
  MAP_STAR_MOON_STEP_PX: 2.6,     // 第二顆起每顆再外推 / Each extra moon steps out by this
  MAP_STAR_MOON_SIZE: 1.9,        // 月球半徑（px）/ Moon radius (px)
  // 月球的顏色，每顆各抽一個（原本是**單一**顏色）/ moon colours, one drawn per moon (was a single colour)
  //
  // 一個掛四顆月球的行星，會不會看起來像四顆一樣的點？會 —— 原本所有月球都是同一塊近白。
  // 維持低飽和、接近月球本體的色系：月球本身很小（`MAP_STAR_MOON_SIZE`），太鮮豔只會變成
  // 雜訊，還會搶走它所繞的那顆行星的注意力。
  //
  // A planet with four moons read as four identical dots, because they were all the same
  // near-white. Kept desaturated and lunar: a moon is tiny (`MAP_STAR_MOON_SIZE`), so anything
  // vivid reads as noise and steals attention from the planet it orbits.
  MAP_STAR_MOON_COLORS: ['#e8e2d4', '#d8dce6', '#e6d8c8', '#d0d8d4', '#efe0d4', '#ccd4e0'],
  MAP_STAR_MOON_ORBIT_MS: 5200,   // 月球繞行星一圈的時間 / One moon orbit around its planet (ms)
  MAP_STAR_MOON_SPEED_STEP: 0.4, // 第二顆起逐顆加快，否則兩顆月球永遠對成一線 /
                                  // Each extra moon speeds up, or two moons stay in line

  MAP_STAR_LABEL_GAP_PX: 12,      // 星系名稱與外緣的間距（px）/ Gap from system edge to its name (px)

  // ── 節點白邊與黑影 / Node white border and shadow ───────────────────────────
  // 星雲與深空底會吃掉節點邊界：顏色再亮，一個沒有邊的圓盤也會糊進背景裡。
  // 白邊把圓盤和背景分開，黑影則讓它**浮**起來。
  //
  // A star cloud and a near-black backdrop eat node edges: however bright the fill, a
  // disc with no border smears into the background. The white border separates disc
  // from background and the shadow makes it sit above it.
  //
  // 這兩層畫在既有的覆蓋層上（不是新開一張 canvas——那會蓋住地名標籤），
  // 而且必須在**節點圓盤之外**：覆蓋層的 DOM 在 sigma 之前，只有圓盤外面的
  // 那一圈才會露出來。
  //
  // Both layers go on the existing overlay (a new canvas would cover the place labels),
  // and both must sit **outside** the node disc: the overlay is behind sigma, so only
  // the ring beyond the disc's edge is ever visible.
  MAP_NODE_BORDER_COLOR: 'rgba(255, 255, 255, 0.7)', // 白邊 / White border
  MAP_NODE_BORDER_WIDTH: 1.3,     // 白邊線寬（px）/ Border stroke width (px)
  MAP_NODE_SHADOW_COLOR: 'rgba(0, 0, 0, 0.7)', // 黑影 / Black shadow
  MAP_NODE_SHADOW_SPREAD: 3.4,    // 黑影外擴（px）/ Shadow spread (px)
  // 黑影用幾圈同心描邊做出柔和外緣，而不是每個節點一個 radial gradient ——
  // 後者是每幀上千個漸層物件。逐圈乘上的衰減 /
  // The shadow fakes a soft edge with concentric strokes rather than one radial
  // gradient per node, which would be a thousand gradient objects every frame. Each
  // layer multiplies the previous one's alpha.
  MAP_NODE_SHADOW_LAYERS: 3,      // 描邊圈數 / Concentric strokes
  MAP_NODE_SHADOW_ALPHA: 0.3,     // 最內圈的不透明度 / Innermost stroke alpha
  MAP_NODE_SHADOW_LAYER_FALLOFF: 0.75, // 逐圈衰減 / Alpha falloff per layer
  MAP_NODE_SHADOW_LAYER_WIDTH: 0.62,   // 圈線寬（占外擴的比例）/ Stroke width (fraction of spread)
  MAP_NODE_SHADOW_LAYER_OFFSET: 0.34,  // 圈與圈的間距（占外擴的比例）/ Spacing (fraction of spread)

  // 道路的白邊：和節點的白邊**同一個理由、同一個手法**。`MAP_ROAD_COLOR` 是一條深藍
  // (#1e3a5f)，壓在近黑的星雲上幾乎看不見 —— 節點加了白邊之後看得見了，道路卻還是
  // 一條幽靈線，整張圖會變成「看得見的地方、看不見的路」。
  //
  // Road casing: the same reason and the same trick as the node border. `MAP_ROAD_COLOR`
  // is a deep blue (#1e3a5f) and on a near-black star cloud it is very hard to see — once
  // the nodes gained a border the roads became the only thing left invisible, so the map
  // read as "places you can see, roads you cannot".
  //
  // 手法完全一樣，也是必須的：覆蓋層在 sigma 的 canvas **之前**，所以在覆蓋層上描一條
  // **比較粗的**白線，sigma 的道路正好壓在白線中間，兩側各露出一條白邊。這不需要第二張
  // canvas（會蓋住地名），也不需要 `EdgeClampedProgram`（會改掉整個邊的渲染）。
  //
  // The trick is identical, and for the same reason: the overlay sits BEFORE sigma's canvas,
  // so a **wider** white stroke on the overlay shows on both sides while sigma's road paints
  // over the middle. That needs no second canvas (which would cover the place labels) and no
  // `EdgeClampedProgram` (which would change edge rendering wholesale).
  MAP_ROAD_BORDER_COLOR: 'rgba(255, 255, 255, 0.15)', // 道路白邊（比節點淡，避免搶走節點）/ road casing, fainter than the node's so it does not compete
  MAP_ROAD_BORDER_WIDTH: 1,     // 白邊寬度（每側，螢幕 px）/ casing width per side (screen px)

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
  // 這個區塊原本是**線性漂移塵埃**（`SPACE_PARTICLE_*` 與 `SPACE_PARTICLE_RGB`），
  // 早已被下面的流場與銀河取代，卻一直沒被移除——而 `SPACE_DPR_CAP` 仍然被這兩層
  // 共用，所以留在這裡。
  //
  // This block used to hold the **linear-drift dust** (`SPACE_PARTICLE_*` and
  // `SPACE_PARTICLE_RGB`), long since replaced by the flow field and the galaxy
  // below — and never removed. `SPACE_DPR_CAP` is still shared by both remaining
  // canvas layers, so it stays.
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
  SPACE_FLOW_HUE_MIN: 195,
  SPACE_FLOW_HUE_MAX: 280,
  SPACE_FLOW_SATURATION: 45,        // 飽和度（%）/ saturation %
  SPACE_FLOW_LIGHTNESS: 66,         // 亮度（%）/ lightness %
  SPACE_FLOW_MAX_ALPHA: 0.55,       // 不透明度上限 / alpha ceiling
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

  // ── 背景銀河 / Background galaxy ───────────────────────────────────────────
  // 參考 Stellaris 的**銀河圖**：中央一團柔軟的暖核，幾條褐色塵帶沿對數螺旋旋出，
  // 邊緣漸隱成深空。那不是粒子堆得出來的形狀——塵帶是連續、帶紋理的帶狀物。
  //
  // References Stellaris' **galaxy map**: a soft warm core, a few brown dust lanes
  // spiralling out on a log spiral, fading to deep space at the edges. That shape
  // cannot be assembled from particles — the lanes are continuous textured bands.
  //
  // 整顆銀河在 resize 時**一次烤進一張離屏 canvas**，之後每幀只做一次帶旋轉的
  // `drawImage`。好處不只是省：Simplex 噪聲也跟著搬到烘焙時，所以執行時每幀的取樣
  // 是 **0** 次（原本的流場每顆粒子每幀要 6 次）。
  //
  // The whole galaxy is baked into one offscreen canvas on resize, and every frame
  // is a single rotated `drawImage`. The win is not only cost: the Simplex noise
  // moves to bake time too, so a frame makes **zero** samples (the flow-field layer
  // it replaces made six per particle per frame).
  //
  // **亮度刻意低於參考圖。** 參考圖的核是亮的，但它靠的是「細而亮」的連線；我們底下
  // 的道路是半透明的深藍 `#1e3a5f`，而節點最多兩千個。取它的構圖與色相，不取曝光——
  // 所以這裡每個 alpha 都保守，`SPACE_GALAXY_CORE_ALPHA` 是第一個該往下調的旋鈕。
  //
  // **Deliberately dimmer than the reference.** The reference core is bright, but it
  // gets away with that because its hyperlanes are thin *bright* lines. Ours are dark
  // and semi-transparent, with up to 2000 nodes above them. So this takes the
  // reference's composition and hues, not its exposure — every alpha here is
  // conservative, and `SPACE_GALAXY_CORE_ALPHA` is the first knob to lower.
  //
  // 幾何一律在「正規化圓盤」裡描述（圓心 (0,0)、半徑 1），像素大小由元件決定。
  //
  // All geometry is described in a *normalised disc* (centre (0,0), radius 1); the
  // component decides the pixel size.
/**
   * 圓盤半徑（世界坐標，1 = 整個世界寬度的一半）。刻意大到佔掉世界的大部分，
   * 所以它是真正的背景而不是小光點。由 0.72 提到 0.85：使用者要求「更大」。
   *
   * The disc radius in world units. Deliberately large, so the galaxy is a real backdrop
   * rather than a small glow. Raised 0.72 → 0.85 because the request was "larger".
   */
  SPACE_GALAXY_RADIUS_FRACTION: 0.85,
  /** 核的半徑（圓盤半徑的比例）/ core radius, fraction of the disc */
  SPACE_GALAXY_CORE_RADIUS: 0.44,
  /** 核亮度上限 / core alpha ceiling */
  SPACE_GALAXY_CORE_ALPHA: 0.44,
  /** 盤面中段的亮度 / mid-disc alpha */
  SPACE_GALAXY_MID_ALPHA: 0.18,
  /** 核的顏色：暖奶油 / core colour: warm cream */
  SPACE_GALAXY_COLOR_CORE: '#c9b79c',
  /** 盤面中段：灰紫 / mid-disc: dusty mauve */
  SPACE_GALAXY_COLOR_MID: '#8b8191',
  /** 星雲色塊數量 / number of nebula blobs */
  SPACE_GALAXY_NEBULA_BLOBS: 12,
  /** 星雲色塊半徑（圓盤半徑的比例）/ blob radius, fraction of the disc */
  SPACE_GALAXY_NEBULA_RADIUS: 0.6,
  /** 星雲不透明度上限 / nebula alpha ceiling */
  SPACE_GALAXY_NEBULA_ALPHA: 0.22,
  /**
   * 星雲顏色：偏灰的紫、褐、冷石板。刻意壓低飽和度去配合暖核，否則冷色角落會和核心
   * 打架。
   *
   * Nebula colours: muted plum, umber and cool slate. Saturation is held down to
   * sit with the warm core, or the cool corners fight it.
   */
  SPACE_GALAXY_NEBULA_COLORS: ['#5a4a63', '#4a4358', '#6b5348', '#3f4459'] as string[],
  /** 星點數量 / number of stars */
  SPACE_GALAXY_STAR_COUNT: 900,
  /** 最小半徑 / min radius */
  SPACE_GALAXY_STAR_MIN_SIZE: 0.4,
  /** 最大半徑 / max radius */
  SPACE_GALAXY_STAR_MAX_SIZE: 1.5,
  /** 星點不透明度上限 / star alpha ceiling */
  SPACE_GALAXY_STAR_ALPHA: 0.8,
  /** 星點顏色：冷白、藍灰、暖奶油 / star colours: cool white, blue-grey, warm cream */
  SPACE_GALAXY_STAR_COLORS: ['#e8e4dc', '#cfd6e0', '#b9c4d6', '#e6d8c4', '#d8cfc0'] as string[],
  /**
   * 自轉一整圈的秒數，**<= 0 表示不轉**（`rotateAt` 直接回傳 0）。
   * 15 分鐘一圈：一場遊戲裡看起來像「活的深度」，而不是會轉的道具。
   *
   * Seconds per full turn; **<= 0 disables rotation** (`rotateAt` returns 0).
   * 15 minutes a turn reads as living depth within a session, not a spinning prop.
   */
  SPACE_GALAXY_ROTATE_PERIOD_SEC: 900,
/**
   * ratio 低於此值銀河開始變淡。銀河放在**世界座標**裡，所以它的大小真的是 `1 / ratio`；
   * sigma 的 ratio 跨 0.05..3，拉到最近時圓盤比視窗大很多，整片畫面會變成一層暖色薄膜。
   * 所以在拉近時降低它的存在感——但**不是**降到零，見下一個值。
   *
   * Below this ratio the galaxy starts to dim. It lives in **world** coordinates, so its
   * size really is `1 / ratio`; sigma's ratio spans 0.05..3, and at maximum zoom-in the
   * disc is many times the viewport — a flat warm film. So it dims as you zoom in, but
   * **not** to nothing: see the floor below.
   */
  SPACE_GALAXY_FADE_RATIO: 0.9,
  /**
   * 銀河淡出的**下限**：拉到底也還剩這麼多，所以銀河永遠不會消失，只是變暗。
   *
   * 0 會讓銀河在拉到最近時整個不見，畫面變成一片純黑深空——那看起來像 bug 而不是意圖。
   * 這裡保留可見的最低量，銀河就一直是「背景的一部分」。
   *
   * 刻意比先前高（0.42 → 0.55）：拉近時要的是「更清楚」，而不是一層看不見的薄膜。
   * 道路對比由沒有了節點發光層來撐住，所以這裡可以亮一點。
   *
   * The **floor** of the galaxy's fade: this much survives even at maximum zoom-in, so the
   * galaxy never disappears. A floor of 0 would leave a pure-black frame at deep zoom,
   * which reads as broken rather than an intention; keeping a visible minimum makes it
   * always part of the background.
   *
   * Deliberately higher than before (0.42 → 0.55): the point of zooming in is to be *more
   * clear*, not to sit under an invisible film. Road contrast is now carried by the map
   * having lost its node glow layer, so this can be brighter.
   */
  SPACE_GALAXY_FADE_MIN: 0.55,
  /** 種子，讓整顆銀河可重現 / seed, so the galaxy is reproducible */
  SPACE_GALAXY_SEED: 'space-galaxy',

  // ── 霧氣 / Fog ──────────────────────────────────────────────────────────────
  // 畫在銀河之上、地圖**之下**的暖色星雲。它會**緩慢**漂移（自轉，20 分鐘一圈），所以
  // 讀起來是活的深度而不是黏在畫面上的貼圖。**沒有縮放淡入淡出**：它現在是背景的一部分，
  // 不是蓋在地圖上的霧，所以拉近時不必消失。
  //
  // A warm nebula between the galaxy and the map. It drifts **slowly** (a rotation, 20
  // minutes a turn), so it reads as living depth rather than a decal. It has **no zoom
  // fade**: it is now part of the backdrop rather than a haze over the map, so there is
  // no reason for it to vanish as you zoom in.
  //
/**
   * 色塊的**密度**範圍。每個色塊各自抽一個 0..1 的值，映射到這個區間，所以有些地方很濃、
   * 有些地方幾乎沒有——這就是「看起來像隨機雲層」而不是「一層均勻灰霧」的來源。
   * 半徑也用同一個值，所以濃的地方**同時**也比較大。
   *
   * The per-patch **density** range. Each patch draws its own 0..1 value and maps it into
   * this range, so some areas are dense and others nearly empty — that is what makes it
   * read as a random cloud layer rather than a uniform grey haze. The radius keys off the
   * same value, so a dense patch is also a large one.
   */
  SPACE_FOG_DENSITY_MIN: 0.1,
  SPACE_FOG_DENSITY_MAX: 1,
  SPACE_FOG_SEED: 'space-fog',
  SPACE_FOG_COUNT: 16,               // 色塊數量 / number of patches
  SPACE_FOG_RADIUS: 0.3,            // 色塊基準半徑（世界座標）/ base patch radius, world units
  /**
   * 不透明度上限。**必須夠高才看得見**——這一層畫在地圖**之下**的近黑深空中，0.5 是暖色
   * 星塵要浮出來所需的門檻。但每個色塊還會乘上自己的密度，所以平均濃度遠低於 0.5，
   * 不會變成一整片均勻的白。
   *
   * Alpha ceiling. It **has to be high enough to be seen** — this layer sits *under* the
   * map in the near-black void, so 0.5 is the floor at which warm star dust surfaces. But
   * every patch still multiplies it by its own density, so the *average* is far below 0.5
   * and it never becomes a uniform white sheet.
   */
  SPACE_FOG_ALPHA: 0.5,
  /**
   * 顏色從近乎白的暖色到很暗的褐：**有些地方偏白、有些地方幾乎不見**。暖色調是刻意的——
   * 這一層是「星雲 / 星塵」，不是冷灰的霧，所以它要讀起來像被照亮的塵埃。
   *
   * Colours run from near-white warm to dark umber: some patches read white, others barely
   * register. The warmth is deliberate — this layer is a *nebula / star dust*, not a cold
   * grey haze, so it has to read as lit dust.
   */
  SPACE_FOG_COLORS: ['#f2e6c8', '#e0cba0', '#c2a878', '#8f7a58', '#5c4c38'] as string[],
  /**
   * 自轉一整圈的秒數，**<= 0 表示不轉**。20 分鐘一圈：雲層會**緩慢**漂移，但一場遊戲裡
   * 看起來是「活的深度」，而不是會轉的道具。
   *
   * Seconds per full turn; **<= 0 disables rotation**. 20 minutes a turn: the cloud drifts
   * *slowly*, and within a session it reads as living depth rather than a spinning prop.
   */
  SPACE_FOG_ROTATE_PERIOD_SEC: 1200,
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
  // **已移除。** 地圖上的節點不再有發光與陰影層。
  //
  // **Removed.** The node glow and shadow layer is gone: places no longer carry a
  // light effect at any zoom.
  //
  // 這一層原本是「靜態裝飾層」（第二張覆蓋畫布）：節點後方先畫陰影再畫發光。拿掉之後
  // 地圖會比較平，但道路與節點本身的對比更乾淨，而且銀河與霧氣不需要再跟發光搶注意力。
  //
  // It used to be a static decoration layer (a second overlay canvas): a shadow pass
  // then a glow pass behind every node. Removing it flattens the map a little, but the
  // roads and nodes read cleaner, and the galaxy and fog no longer compete with a glow.
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
TERRITORY_FADE_RATIO: 0.74,     // 拉近到此比例以下完全消失 / Fully gone below this
  /**
   * **領地面積層可以互動的最低 ratio。** 低於此值（拉近）時，滑鼠停在某塊地面上**不再**
   * 回報「這是誰的地」，也不再把那一片勢力色**亮起來**——那時畫面看的是節點與道路，
   * 面積層只是一層底色，卻還搶走游標的解讀權，看起來像 bug。
   *
   * 地點**節點**的 hover 與點擊不受影響：那屬於地圖本身，不是領地層。
   *
   * The lowest ratio at which the territory **area** layer stays interactive. Below it
   * (zoomed in), pointing at a patch of ground no longer answers "whose land is this" and
   * no longer lights that faction's fill: the frame is showing nodes and roads at that
   * point, so the area layer is only a backdrop — yet it would still take over the
   * cursor's reading, which reads as a bug.
   *
   * Place **node** hover and click are unaffected: that is the map itself, not territory.
   */
  TERRITORY_INTERACTIVE_RATIO: 0.6,
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
  TERRITORY_BLOB_RADIUS: 3.0,
  // 核心保證項：每個地方在自己的核心半徑內對自己勢力多推最高此值的力，`argmax`
  // 讓家門口那幾格自然歸自己——弱勢力（如只有兩個地方的神鷹海國）不被鄰近強勢力
  // 完全壓到消失。鄰近敵對地方每個最多貢獻 1（falloff 峰值），10 是壓倒性的。
  // 0 = 關閉。
  // Core-guarantee term: within its core radius each place adds up to this much
  // extra force to its own faction, so `argmax` hands its doorstep to it — a weak
  // faction (e.g. 神鷹海國 with two places) is not fully swamped out of sight by a
  // stronger neighbour. A rival place contributes at most 1 (the falloff peak), so
  // 10 is decisively dominant. 0 = off.
  TERRITORY_CORE_FORCE: 10,
  // 核心半徑 = 此比例 × 宣稱半徑。相對比例讓核心與宣稱用同一把尺：密世界核心小、
  // 疏世界核心大，且不隨格網解析度漂移。
  // Core radius = this fraction × the claim radius, so the core stays on the
  // claim's own scale (smaller when dense, larger when sparse) and never drifts
  // with grid resolution.
  TERRITORY_CORE_RADIUS: 0.35,
  // 無主之地的**比值遮罩**：留白條件是「離無主之地 < 0.8 × 離最近有主地方」。
  // 邊界是以無主地方為焦點的**圓弧**（阿波羅尼烏斯圓，圓心在背側），留白圈沿軸
  // 推進約 0.8/1.8 ≈ 間距 44%——無主之地保住幾乎一半間距的圓形留白（它的「力」），
  // 有主節點那一側保有 56%，比舊平分線的 50% 更寬。1 = 舊的垂直平分線（直線邊、
  // 貼著節點切過去，實測低近崖被無主冰鯊湖切掉缺口）；0 = 遮罩全關（無主之地整個
  // 被有主領色吞掉——實測冰鯊湖整圈被橙色包住）。**不要**改用兩個絕對半徑做例外
  // （曾試過「核心盤內遮罩讓路」）：核心盤是全域相對尺度，反而會把無主之地自己的
  // 周圍吞進有主領色。也不要壓太低（試過 0.45）：無主之地只剩一圈細環，讀起來像
  // 沒有力。配合「駐地格釘住」使用：釘住保證節點自己那格讀對，比值只管其餘格子。
  // The unowned land's **ratio mask**: blank iff the cell is nearer an unowned
  // place than 0.8 × the nearest owned one. The border is a circular arc focused
  // on the void site (an Apollonius circle, centred on the far side); the blank
  // halo advances ~0.8/1.8 ≈ 44% of the gap along the axis — the void keeps
  // almost half the gap as its own round blank claim (its "force") and the owned
  // node keeps 56%, wider than the old bisector's 50%. 1 = the old perpendicular
  // bisector (straight border cut against the node — measured: 低近崖 notched by
  // unowned 冰鯊湖); 0 = mask off (void land swallowed by owned colour — measured:
  // 冰鯊湖 ringed by orange). **Do not** replace this with exceptions built from
  // two absolute radii (the tried "mask yields inside the core disc" variant):
  // the core is globally scaled and swallowed the void's own surroundings into
  // owned colour instead. Do not push it too low either (0.45 was tried): the
  // void shrank to a thin ring and read as having no force at all. Pairs with
  // the site-cell pin: the pin guarantees each node's own cell reads correctly,
  // and the ratio governs every other cell.
  TERRITORY_VOID_MASK_RATIO: 0.8,
  // 每個宣稱半徑的格數——密度場的解析度，也就是邊界有多「圓」。10 是省成本的下限
  // （拉遠仍讀得出階梯），14 幾乎看不出格子；總格數仍受 TERRITORY_MAX_RESOLUTION
  // 上限約束。
  // Cells per claim radius — the field's resolution, hence how *round* the borders
  // look. 10 is the cost-saving floor (steps readable zoomed out); 14 makes the
  // grid essentially invisible. TERRITORY_MAX_RESOLUTION still caps the total.
  TERRITORY_CELLS_PER_RADIUS: 14,
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
  /**
   * 邊界曲線的切角次數（Chaikin passes）。2 是原設定——放大後在核心盤的圓弧上仍讀得出
   * 折角；3 之後弧線在視覺上成一個真正的圓。點數隨次數翻倍（2→4n，3→8n），成本可忽略。
   *
   * Chaikin corner-cutting passes for the border curve. 2 was the old setting — dig
   * into the core disc's arc and a kink is still readable; 3 renders the arc as a
   * true circle to the eye. Point count doubles per pass (2→4n, 3→8n); the cost
   * is negligible.
   */
  TERRITORY_BORDER_SMOOTH_ITERATIONS: 3,
  // ── 領地名稱 / Territory label ────────────────────────────────────────────
  // 字級由領地的大小決定：`labelRadius`（最大內切圓的半徑）越大字越大，塞滿整塊領地。
  // 上下限是必要的——沒有下限小領地的字會消失，沒有上限大領地的字會蓋掉整張圖。
  //
  // The font size is derived from the claim's size: the larger `labelRadius` (the
  // inscribed circle), the larger the text, so it fills the area. The clamp matters:
  // without a floor a small claim's name vanishes, without a ceiling a big claim's name
  // swamps the map.
  /**
   * 文字最多可以佔到可用矩形的幾成（扣掉光暈之後）。用「實測 100px 的字寬」反推最大字級，
   * 所以名稱會**撐滿**領地而不是固定大小；留一點餘裕（<1）免得貼著邊界。
   *
   * **光暈不要靠這個比例處理，要用 `TERRITORY_LABEL_GLOW_PX` 扣掉。** 只調低比例是按比例
   * 懲罰每一個標籤，而光暈是固定成本；扣掉之後餘裕變成 `avail·(1−fit) + glow·fit`，
   * 矩形厚度只要 ≥ glow 就**必然**離邊界 ≥ glow。實測 1709 個區塊：扣光暈後最小餘裕
   * 13.0px、平均字級 31.5px；只降比例到 0.72 則是 7.1px 與 30.8px —— 名字更小、餘裕更少。
   *
   * How much of the usable rectangle the text may fill, after the glow is taken off. The
   * largest font size is derived from the measured width at 100px, so the name **fills** the
   * claim rather than sitting at a fixed size; a little slack (<1) keeps it off the boundary.
   *
   * **The glow is handled by subtracting `TERRITORY_LABEL_GLOW_PX`, not by this ratio.**
   * Lowering the ratio penalises every label proportionally, while the glow is a fixed cost.
   * Subtracting it makes the margin `avail·(1−fit) + glow·fit`, which is **at least the glow
   * radius** for any rectangle at least `glow` thick. Measured over 1709 regions: subtracting
   * gives a 13.0px smallest margin at a 31.5px mean font, where dropping the ratio to 0.72
   * gives 7.1px at 30.8px — smaller names *and* less margin.
   */
  TERRITORY_LABEL_FIT: 0.82,
  /**
   * 勢力名外發光的半徑（**em**，所以跟著字級縮放）。**這是「名字有多大」的一部分**，
   * 所以求解字級時必須把它算進預算裡，而不是讓光暈自己溢出領地。
   *
   * **用 em 不用 px**：寫死 6px 的話，一塊薄領地扣掉兩側各 6px 就沒剩什麼，字級會被壓到
   * 8px、甚至整個名字消失（實測 4 個回合有 3 個不畫）。跟著字級縮放，小名字配小光暈，
   * 餘裕 `avail·(1−fit)` 也會等比放大。
   *
   * The outward glow radius on a faction name, **in em**, so it scales with the font size. It
   * is **part of how big the name actually is**, so the font solve has to count it — otherwise
   * the glow spills off the claim on its own.
   *
   * **Em, not px**: a fixed 6px subtracted from both sides of a thin claim leaves almost
   * nothing, collapsing the solve to 8px or dropping the name altogether (measured: 3 of 4
   * rounds lost their label). Scaling with the font gives a small name a small halo, and the
   * `avail·(1−fit)` clearance grows in proportion to the claim.
   */
  TERRITORY_LABEL_GLOW_EM: 0.15,
  /**
   * 可讀下限。**低於這個字級就不畫**，而不是把它放大到看得見 ——
   * 放大會讓文字溢出領地，正是要避免的事。
   *
   * The legibility floor. A name **solved below this is not drawn**, rather than being
   * scaled up until it reads — scaling up is exactly what would push it off its claim.
   */
  TERRITORY_LABEL_FONT_MIN: 6,
  /**
   * 名字朝白色調亮的混合比例（0–1）。底下的領地填色是同一個勢力色疊在深色背景上的
   * 半透明色塊，原色壓在上面會整個暗掉；往白色混可以保持色相又把亮度拉起來。
   *
   * How far the name is mixed toward white. The territory fill is that same faction colour
   * composited translucently over a dark backdrop, so the raw colour goes muddy on top of
   * it; mixing keeps the hue and restores the lightness.
   */
  TERRITORY_LABEL_LIGHTEN: 0.45,
  /**
   * 兩端的字級上限刻意拉得很開：字級 = 領地在螢幕上的大小，所以拉近時它可以長到很大。
   * 上限只是防止極端縮放讓字撐爆整個畫面。
   *
   * The ceiling is deliberately wide: the size tracks the claim's on-screen extent, so
   * zooming in should let it grow large. The cap only stops an extreme zoom from
   * blowing the text across the whole viewport.
   */
  TERRITORY_LABEL_FONT_MAX: 200,
  /**
   * 只在這個鏡頭比例**以上**顯示勢力名稱（sigma 的比例**越大＝越遠**）。
   *
   * 刻意等於 `LABEL_ZOOM_RATIO`（地方名的門檻）：兩個門檻如果不同，中間就會出現一段
   * 「兩種名字都不顯示」的空白帶——地方名先消失、勢力名還沒出現，那一段地圖上完全沒有
   * 文字可讀。讓兩者相等，勢力名就在地方名消失的**同一個比例**接手。
   *
   * Deliberately equal to `LABEL_ZOOM_RATIO` (the place-name threshold). When the two
   * differ, the band between them shows *no* names at all: the place names are already gone
   * and the faction names have not arrived yet. Equal values make the faction name take over
   * at the exact ratio the place names disappear.
   *
   * 拉近到低於它時名字就收起來，讓「這裡是某個地方」的節點與地名自己說話 —— 這正是
   * Stellaris / CK3 的做法：帝國名屬於星系層級，拉近到行星層級就不該再擋著。
   *
   * Zooming in past it hides them so the node and its place name speak for themselves —
   * exactly what Stellaris and CK3 do: the empire name belongs to the galaxy level and must
   * not block the planet level.
   */
  TERRITORY_LABEL_SHOW_ABOVE_RATIO: 0.6,
  TERRITORY_BORDER_HOVER_ALPHA: 0.85,
  // 少於這麼多格子的勢力不標名字，否則小領地上會疊成一團 /
  // Factions below this cell count get no label, or tiny holdings stack up
  TERRITORY_MIN_LABEL_CELLS: 10,
  // 最多標幾個勢力，畫面才不會變成地名牆 /
  // Cap the labelled factions so the map does not become a wall of names
  TERRITORY_MAX_LABELS: 12,
  // 領地要細長到什麼程度，勢力名才跟著主軸轉。**這個門檻同時決定矩形沿哪個座標系量**，
  // 所以它必須和繪製共用同一個值 —— 兩邊各自判斷就會讓名字被塞進一個它並不朝向的
  // 矩形裡，四個角於是跑到自己地盤外。
  // How elongated a claim must be before its name follows the principal axis. **The same
  // value decides which frame the label rectangle is measured in**, so the geometry and the
  // renderer must share it: judged separately, a horizontal name gets fitted into a tilted
  // rectangle and its corners leave the faction's own land.
  TERRITORY_LABEL_ROTATE_ELONGATION: 1.5,
  // 傾斜的座標系要**明顯**比較好才採用。沒有遲滯的話，兩者接近時名字會每回合在水平與
  // 傾斜之間翻轉 —— 那是視覺噪音。1.08 = 必須大約多 8% 才值得轉。
  // How much bigger the tilted frame has to be before it is taken. Without hysteresis a name
  // flips between horizontal and tilted every round when the two are close, which is visual
  // noise. 1.08 means it has to be roughly 8% larger to be worth rotating.
  TERRITORY_LABEL_ROTATE_MARGIN: 1.08,
  // 選址的取樣上限與入圍名單。名字放在「能把字撐到最大」的那一格，不是「最深」的那一格 ——
  // 最大內切圓是**圓形**問題的答案，而這裡要的是**矩形**：實測平均能多撐到 1.48 倍
  // （最壞 3.21 倍）。窮舉所有格子每格都要沿兩軸走到底，太貴，所以先抽樣、再評分排名、
  // 最後只對前幾名跑真正的矩形搜尋。數字越大越接近窮舉，計算也越貴。
  // Anchor search: how many cells to sample, and how many of the best to measure in full. The
  // name goes on the cell that makes it *largest*, not the deepest one — the largest inscribed
  // circle answers a **circular** question and this one is **rectangular**: measured 1.48x on
  // average, 3.21x at worst. Scoring every cell walks both axes to the boundary, so sample,
  // rank cheaply, then measure only the finalists in full. Bigger means closer to exhaustive,
  // and more expensive.
  TERRITORY_LABEL_ANCHOR_SAMPLES: 320,
  TERRITORY_LABEL_ANCHOR_CANDIDATES: 10,
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
  TERRITORY_MIN_FORCE: 0.05,
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
  /**
   * 地方提示最多列出幾位將領的名字，超出的收成「另有 N 位」。
   *
   * 提示是一個跟著游標走的小面板，而一個地方可以站著很多位將領。全部列出會讓提示高到
   * 蓋住地圖本身——那正好抵消了提示存在的理由，所以一定要有上限。
   *
   * How many leader names a place tooltip lists before collapsing the rest into "+N more".
   *
   * The tooltip is a small panel that follows the cursor, and a place can hold a lot of
   * leaders. Listing them all makes it tall enough to cover the map, which defeats the point
   * of having a tooltip at all, so this needs a ceiling.
   */
  MAP_TOOLTIP_MAX_LEADERS: 4,
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
   * 地名／勢力名文字陰影的備援色。名稱要在深色與淺色領地上都讀得到，所以鏤一圈深色陰影。
   *
   * Fallback for the place / faction label text shadow: the name has to stay legible on
   * both dark and light territory, so it carries a dark halo.
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
