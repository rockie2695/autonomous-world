// ============================================================================
// 繁體中文翻譯 / Chinese (Traditional) Translations
// ============================================================================
// zh-TW 語言的所有 UI 字串。/ All UI strings for zh-TW locale.
// 鍵遵循 section.item 格式。/ Keys follow the pattern: section.item
// ============================================================================

export const zh = {
  // ── 通用 / General ───────────────────────────────────────────────────────
  general: {
    title: '自治世界',
    subtitle: '一個無限運行的自主模擬世界',
    loading: '載入中...',
    error: '發生錯誤',
    login: '使用 Google 登入',
    logout: '登出',
    welcome: '歡迎回來',
    language: '語言',
    english: 'English',
    chinese: '中文',
    details: '詳細資料',
    status: '狀態',
    back: '返回',
    close: '關閉',
    // 兩個面板（事件日誌、回合概覽）各有一個回合下拉，標籤是同一個字串 /
    // Two panels (the event log, the round overview) each carry a round dropdown and
    // share this one label
    roundSelect: '選擇回合',
  },

  // ── 認證 / Authentication ─────────────────────────────────────────────────
  auth: {
    signInTitle: '登入',
    registerTitle: '建立帳號',
    signInTab: '登入',
    registerTab: '註冊',
    email: '電子信箱',
    emailPlaceholder: 'you@example.com',
    password: '密碼',
    name: '顯示名稱',
    namePlaceholder: '選填',
    passwordHint: '至少 8 個字元',
    signIn: '登入',
    register: '建立帳號',
    submitting: '處理中...',
    orDivider: '或',
    continueWithGoogle: '使用 Google 繼續',
    noAccount: '還沒有帳號？',
    haveAccount: '已經有帳號了？',
    successRegister: '帳號已建立，正在登入...',
    successSetPassword: '密碼已設定，之後可以用信箱登入。',
    setPassword: '設定密碼',
    setPasswordHint: '你的帳號目前使用 Google 登入。加上密碼之後也可以用信箱登入。',
    passwordAlreadySet: '此帳號已經設定過密碼。',
    skipForNow: '先略過',
    skipHint: '之後隨時可以回到這一頁設定。',
    alreadySignedIn: '已經登入',
    alreadyHasPassword: '此帳號已經有密碼了，可以用電子信箱登入。',
    continueToGame: '進入世界',
  },

  // ── 首頁 / Homepage ─────────────────────────────────────────────────────
  home: {
    intro: '這是一個無限運行的自主模擬世界。沒有勝利條件，只有永恆的演化。',
    description: '觀看數百個 AI 角色在動態地圖上建立勢力、征戰、結盟、背叛。',
    features: {
      autonomous: '完全自主運行',
      autonomousDesc: '世界自行演化，無需人工干預。AI 角色自主決策、征戰、結盟。',
      realtime: '即時模擬',
      realtimeDesc: '每回合自動計算所有事件，包括戰鬥、經濟、外交、叛變。',
      infinite: '無限世界',
      infiniteDesc: '沒有終點，只有持續的變化。勢力興衰，歷史不斷重寫。',
      noVictory: '無勝利條件',
      noVictoryDesc: '純觀察式體驗，觀看 AI 們書寫自己的傳奇。',
    },
    howItWorks: {
      eyebrow: '運作流程',
      title: '運作方式',
      step1: '觀察世界',
      step1Desc: '觀看數百個 AI 角色在動態地圖上建立勢力、征戰、結盟、背叛。',
      step2: '分析局勢',
      step2Desc: '追蹤勢力消長、將領實力、經濟發展，洞察歷史走向。',
      step3: '見證演化',
      step3Desc: '觀察數百回合的演化，見證文明的興衰與傳奇的誕生。',
      orbitLabel: '三維軌道圖：核心是真實的回合數，外圍三顆衛星對應觀察、分析、見證三個階段',
      pipelineTitle: '一回合真正跑的東西',
      pipelineNote:
        '不是示意圖：地圖上每一次佔領、每一次叛變、每一筆金錢，都由這串階段依序算出來。',
      outOfScope:
        '不做的事：不寫劇本、不給 AI 提示、不預設勝負。勢力會滅亡、王位會空著、戰爭會輸——這些都不是被安排好的結果。',
    },
    engineLab: {
      fig: '圖 1',
      title: '星艦裝配線',
      hint: '滑過電子手 · ← → 換工位 · 重播',
      readoutIdle: '等待世界資料…',
      rnd: '回合',
      replay: '重播裝配動畫',
      replayButton: '重播',
      keySelected: '指到的那隻手（讀出槽正讀它的階段）',
      keyFlame: '試車焰：引擎裝上、回合推進時點燃',
      caption:
        '一條 18 工位的星艦裝配線，排在一條平緩的 S 曲線上：18 隻電子手分兩列（單數站在後列、雙數站列在前列，第 3/6/9/12/15/18 站各自立在凸起的地台上），從自己的舷側探向坐在托架上的產品——一個工位對應左表的一個階段，工具頭由那個階段的分組決定。回合推進時，上一艘完工的船沿曲線滑出廠房、新龍骨進站、18 站逐站施工、第 17 站裝上引擎、第 18 站試車；同一時間後牆的 18 格狀態燈條逐格亮起、里程計滾到新的回合數（公開端點，每 15 秒輪詢一次）。船的完成度就是這趟走線的進度：走到第 n 站，前 n 批零件才裝上。',
      aria: '18 工位星艦裝配線：滑鼠滑過或用左右方向鍵選擇工位',
    },
    stats: {
      title: '世界概況',
      characters: '活躍將領',
      factions: '活躍勢力',
      places: '領土數',
      rounds: '已執行回合',
    },
    startButton: '進入世界',
    learnMore: '了解更多',

    // ── 首頁導覽 / Homepage navigation ───────────────────────────────────
    nav: {
      world: '世界',
      how: '運作',
      orrery: '星儀',
      saga: '傳奇',
      live: '即時',
      // 只在右側圓點導覽上出現的三段：標頭列不放這幾項，但簡報的每一屏
      // 都必須有自己的名字，否則圓點只是沒有意義的裝飾
      // The three sections that only the right-hand dot rail names: the header
      // row does not carry them, but every screen of the deck needs a name or
      // the dots are decoration with no meaning
      hero: '首頁',
      features: '特色',
      cta: '開始',
      // 圓點導覽的無障礙名稱 / the dot rail's accessible name
      slidesLabel: '區段導覽',
      enter: '進入系統',
      openMenu: '開啟選單',
      closeMenu: '關閉選單',
      menuLabel: '首頁導覽',
    },

    // ── 首屏 / Hero ───────────────────────────────────────────────────────
    hero: {
      eyebrow: '瀏覽器內執行的自主模擬',
      secondaryCta: '觀看世界運作',
      scroll: '向下捲動',
      roundTag: '第 {round} 回合',
    },

    // ── 訊號流 / Signal feed ─────────────────────────────────────────────
    feed: {
      label: '訊號流',
      live: '即時',
    },

    // ── 真實世界圖譜 / Real world graph ──────────────────────────────────
    world: {
      eyebrow: '真實世界圖譜',
      title: '世界沒有劇本',
      body: '每一個光點都是一座真實據點，每一條線都是一條真實道路。這裡畫的就是此刻正在運作的這個世界，不是示意圖。',
      cta: '了解運作方式',
      legendTitle: '目前存活的勢力',
      graphLabel: '以真實世界資料渲染的三維勢力圖：每個光點是一座據點，顏色代表所屬勢力',
      graphEmpty: '這個世界還沒有據點。',
    },

    // ── 發條星儀 / The Roundworks Orrery ─────────────────────────────────
    // 文案對齊模型頁的字幕：三勢力行星 4/6/8 回合一圈、衛星是據點、
    // 錶盤記回合。不要在這裡介紹模型頁沒有的東西。
    // The copy mirrors the model page's own captions: three faction planets
    // orbiting in 4/6/8 rounds, moons as settlements, the dial logging rounds.
    // Nothing may be advertised here that the model page does not have.
    orrery: {
      eyebrow: '發條星儀',
      title: '上一次鍵，世界走一回合',
      body: '三顆行星是三支勢力——焰洲四回合繞一圈、霜脊六、沉星八；衛星是據點，各自兩到四回合繞行星一圈。轉動發條，錶盤記下走過的每一回合。拖曳模型或按方向鍵，親手上一次弦。',
      // 星儀 iframe 的無障礙名稱 / accessible name of the orrery iframe
      frameTitle: '發條星儀——上一圈發條，世界走一回合（互動模型）',
      linkLabel: '開啟完整模型頁',
      // 另開視窗的提示：只給輔助科技讀，畫面上不必再多一行字
      // The new-tab hint is for assistive tech only; the visible line stays clean
      linkHint: '（另開視窗）',
    },

    // ── 特色區段 / Features section ──────────────────────────────────────
    featuresSection: {
      eyebrow: '核心特色',
      title: '四個不變的核心',
    },

    // ── 傳奇時間軸 / Faction saga ────────────────────────────────────────
    saga: {
      eyebrow: '勢力傳奇',
      title: '沒有終局的傳奇',
      s1Title: '起源',
      s1Text: '一名國王、一座城，世界開始運轉。',
      s2Title: '分裂',
      s2Text: '第一個反叛勢力誕生，邊界首次被劃下。',
      s3Title: '結盟',
      s3Text: '宿敵握手，聯盟在一夜之間改寫地圖。',
      s4Title: '背叛',
      s4Text: '盟約比戰火更快崩塌，新王趁勢崛起。',
      s5Title: '永恆',
      s5Text: '沒有終局，只有下一回合。',
    },

    // ── 即時統計 / Live world readout ────────────────────────────────────
    live: {
      eyebrow: '即時資料',
      title: '世界此刻的真實數字',
      hint: '直接讀取正在運作的這個世界，未登入也能看見。',
      roads: '道路',
      unowned: '無主據點',
      unownedFaction: '無主之地',
      truncated: '顯示駐軍最多的 {shown} 座，共 {total} 座',
      updated: '資料擷取於 {time}',
      unavailable: '目前無法讀取世界資料',
      unavailableHint: '世界可能還沒啟動，或資料來源暫時無法連線。',
    },

    // ── 行動呼籲 / Call to action ────────────────────────────────────────
    cta: {
      eyebrow: '進入世界',
      title: '準備好觀察了嗎？',
      body: '進入自治世界，見證 AI 們書寫的永恆傳奇。',
    },

    // ── 頁尾 / Footer ────────────────────────────────────────────────────
    footer: {
      tagline: 'Autonomous World — Eternal Evolution Simulation',
      credits: '星空影像：NASA / ESA / CSA / STScI（公有領域）',
      runTitle: '本機執行',
      runHint: '需要 Node.js 20 以上，以及一個 PostgreSQL 資料庫。',
      licenseTitle: '授權',
      license: '原始碼以 MIT 授權釋出。',
    },
  },

  // ── 遊戲 / Game ─────────────────────────────────────────────────────────
  game: {
    round: '回合',
    currentRound: '當前回合',
    selectRound: '選擇回合',
    autoPlay: '自動播放',
    autoPlaySpeed: '播放速度',
    pause: '暫停',
    play: '播放',
    nextRound: '下一回合',
    adminOnly: '僅管理員可操作',
    noData: '此回合尚無資料',
    roundStale: '回合已前進：畫面資料過期，已重新同步，請再按一次',
    roundDuration: '回合耗時',
    roundOverview: '回合概覽',
    roundEvents: '事件',
    roundBattles: '戰鬥',
    roundDefections: '叛變',
    roundPhases: '階段耗時',
    roundPhaseTotal: '合計',
    roundEventMix: '事件種類',
    roundWorldScale: '世界規模（地點／將領／勢力／道路）',
    roundServedSnapshot: '快照',
    roundServedLive: '即時',
    roundNoData: '尚無回合量測資料',
    // 右側面板的「系統」分頁：回合概覽（階段耗時與摘要）住在這裡
    // The panel's 系統 tab: the round overview (phase timings and the summary)
    systemTab: '系統',
  },

  // ── 回合的階段 / The round's phases ──
  phases: {
    spawnPlaces: '生成地點',
    spawnCharacters: '生成將領',
    ageAndDeath: '老化與死亡',
    childbirth: '生育',
    economy: '經濟',
    signals: '號令',
    relationships: '關係',
    defectionEvents: '叛變事件',
    loyaltyCheck: '忠誠檢查',
    aiMove: 'AI 移動',
    battle: '戰鬥',
    build: '建築',
    assignAdmins: '指派行政官',
    factionCollapse: '勢力崩解',
    factionDeath: '勢力消滅',
    layout: '佈局重算',
    snapshot: '快照',
    advance: '推進回合',
    groupWorld: '世界生成',
    groupSimulation: '模擬',
    groupAftermath: '收尾',
    groupPersistence: '持久化',
  },

  // ── 地圖 / Map ──────────────────────────────────────────────────────────
  map: {
    zoomIn: '放大',
    zoomOut: '縮小',
    resetView: '重置視圖',
    zoomLevel: '縮放程度',
    territory: '顯示領地',
    place: '地方',
    faction: '勢力',
    troops: '兵力',
    buildings: '建築',
    fortress: '堡壘',
    market: '市場',
    barracks: '兵營',
    garrison: '駐軍',
    administrator: '行政官',
    linkedPlaces: '相連地點',
    factionRuler: '勢力君主',
    leaders: '將領',
    moreLeaders: '另有 {n} 位',
    leaderTroops: '將領兵力',
    troopTotal: '合計',
    controlledPlaces: '控制地方',
  },

  // ── 勢力 / Faction ──────────────────────────────────────────────────────
  faction: {
    name: '勢力名稱',
    tab: '將領',
    color: '顏色',
    alive: '存活',
    collapsed: '已瓦解',
    collapsing: '瓦解中',
    territories: '領地數',
    characters: '將領數',
    totalTroops: '總兵力',
    totalGold: '總金錢',
    king: '國王',
    noKing: '無國王',
  },

  // ── 將領頭像 / Leader Avatar ────────────────────────────────────────────
  // 頭像的 hover 提示會解說身上的配件是哪一段能力來的 /
  // The avatar's hover tooltip explains which ability band each accessory is
  avatar: {
    label: '將領頭像：{detail}',
    tier: {
      high: '高',
      mid: '中',
      low: '低',
    },
    cue: {
      wu: { high: '頭盔', mid: '額帶', low: '舊疤' },
      tong: { high: '金肩章', mid: '素鋼肩章', low: '麻補丁肩帶' },
      ti: { high: '護腕', mid: '素膀鑴', low: '布繌臂' },
      jing: { high: '算盤', mid: '方孔銅錢', low: '空錢袋' },
      speed: { high: '疾風三線', mid: '雙線', low: '單線' },
    },
  },

  // ── 角色 / Character ────────────────────────────────────────────────────
  character: {
    name: '將領名稱',
    wu: '武力',
    tong: '統領',
    ti: '體魄',
    // 觸摸設備上「屬性說明」底部卡片的標題。從 `events` 搬過來：呼叫端是
    // tooltip.tsx 的 `t('character.abilityTipTitle')`，放錯命名空間時兩個語系
    // 都讀不到，卡片標題直接印出原始鍵名。
    //
    // The touch-device ability-tip sheet's title, moved here from `events`: the
    // caller is `t('character.abilityTipTitle')` in tooltip.tsx, and in the wrong
    // namespace NEITHER locale resolved, so the sheet printed the raw key.
    abilityTipTitle: '屬性說明',
    jing: '經濟',
    speed: '速度',
    defectionBase: '野心',
    defectionValue: '叛變值',
    defectionChance: '叛變機率',
    defectionEvents: '本回合影響',
    noDefectionEvents: '本回合沒有影響此人的事件',
    loyalty: '忠誠',
    age: '年齡',
    troops: '兵力',
    gold: '金錢',
    place: '位置',
    administeredPlace: '管轄地點',
    none: '無',
    faction: '所屬勢力',
    alive: '存活',
    dead: '死亡',
    isKing: '國王',
    isAdmin: '行政官',
    loyaltySelf: '為己',
    loyaltyPath: '為道',
    loyaltyAltruism: '為人',
    // 將領彈窗的關係分頁 / the relations tab on the leader popup
    tabStats: '資料',
    tabRelations: '關係',
    // 將領彈窗「資料」分頁的三個分組 / the three groups on the leader popup's data tab
    groupBasic: '基礎',
    groupPower: '戰力',
    groupLoyalty: '忠誠',
    abilityModified:
      '同地點的關係讓這個數值 {delta}（基礎 {base}）。朋友同地提高，不滿的人同地降低。',
    friends: '朋友',
    discontents: '不滿的人',
    noFriends: '尚無朋友',
    noDiscontents: '沒有不滿的人',
    sinceRound: '第 {round} 回合起',
    // ── 屬性提示（將領詳情彈窗與統計 tab 的「將領屬性」雷達共用）／
    //    Ability tooltips (shared by the leader detail popup and the stats tab's radar)
    tipRuleWu: '武力決定攻擊力倍率（兵力 × 倍率）',
    tipRuleTi: '體魄決定防禦力倍率（兵力 × 倍率）',
    tipRuleTong: '統領決定單次購兵的批量（基準 {base} 名）',
    tipRuleJing: '經濟決定收入的多少：任行政官者讓地方產出更多',
    tipRuleSpeed: '速度決定戰敗時的逃脫機率',
    tipRuleDefection: '野心是叛變值的基礎',
    tipRuleAge: '年齡影響壽命與生育年齡',
    tipAttack: '攻擊倍率 {value}',
    tipDefence: '防禦倍率 {value}',
    tipBuyTroops: '購兵倍率 {value}',
    tipIncome: '收益倍率 {value}',
    tipEscape: '速度相同 {base}，每 1 點速度差 +{per}',
    tipDefectionRate: '僅此項時的叛變機率 {value}',
    tipDefectionRule: '叛變值 = 野心 + 忠誠標籤罰分 + 本回合帳本 delta',
    tipDefectionLoyaltyTerm: '忠誠與君王不同',
    tipDefectionLedgerTerm: '本回合帳本',
    tipDefectionRateRule: '機率 = (叛變值 − {mid}) ÷ {mid} × {rate}%；低於 {mid} 就是 0',
  },

  // ── 地點 / Place ────────────────────────────────────────────────────────
  place: {
  allPlaces: '所有地方',
  searchPlaces: '搜尋地點…',
  filterOwnership: '擁有權過濾',
  filterAll: '全部',
  filterOwned: '有主',
  filterUnowned: '無主',
  // 勢力過濾用下拉選單而不是同樣式的一排按鈕：勢力動輒上百個，按鈕排不下 /
  // The faction filter is a dropdown rather than a chip row like ownership: there can be
  // hundreds of factions, which no row of buttons can hold.
  filterFaction: '勢力',
  allFactions: '全部勢力',
  tab: '地點',
    name: '地方名稱',
    owner: '所屬勢力',
    unowned: '無主之地',
    administeredBy: '由 {name} 管理',
    administeredByShort: '管理',
    garrison: '駐軍',
    fortress: '堡壘',
    market: '市場',
    barracks: '兵營',
    buildings: '建築效果',
    level: '等級',
    nextLevel: '再升一級',
    upgradeCost: '升級費用',
    adminHas: '行政官現有',
    maxLevel: '已達最高等級',
    perLevel: '每級效果',
    perRound: '每回合產出',
    nextLevelEffect: '升一級後的效果',
    nextLevelStructure: '虛線＝下一級新增的結構',
    recruitsToGarrison: '徵兵（加入駐軍）',
    incomeTotal: '總收入',
    toAdmin: '行政官實拿',
    roundSplit: '本回合分成',
    elsewhere: '在別處',
    nobodyPaid: '無人領取',
    administrator: '行政官',
    noAdmin: '無行政官',
    characters: '將領',
connections: '連接道路',
    upgrade: '升級',
  },

  // ── 事件 / Events ───────────────────────────────────────────────────────
  chart: {
    round: '回合',
  },
  events: {
      incomeDesc: '{place} 收益 {gold} 金、徵兵 {recruits}（駐軍 {total}）',
      incomeLeader: '{leader} 得 {gold} 金（現有 {total} 金）',
      troopsBought: '{leader} 於 {place} 購兵 {bought} 名，花費 {cost} 金（餘 {gold} 金，兵 {troops}）',
      childBornDesc: '{father}的子嗣出生：{character}',
      loadOlder: '載入更早的 {count} 筆',
      newEvents: '新消息 ▼',
      kingInheritedDesc: '{character}接任了父親 {father} 的王位',
      reportTitle: '戰報',
      reportAttack: '進攻',
      // 戰爭回放的每一輪都要印「造成多少傷害」，這一個鍵曾經兩個語系都沒有，
      // 戰報裡因此直接印出原始鍵名 / each war-replay strike prints the damage it
      // dealt, and this key was missing from BOTH locales, so the report printed
      // the raw key instead
      reportDamage: '傷害',
      reportDefence: '防守',
      reportRoll: '隨機值',
      reportPower: '戰力',
      reportWon: '攻方戰力較高，守軍被擊潰，佔領成功。',
      reportLost: '守方戰力較高，進攻失敗。',
      reportNoDefenders: '此地無守軍，未經戰鬥即被佔領。',
      reportOpen: '戰報',
    title: '事件日誌',
    tab: '事件',
    filterFaction: '勢力',
    filterAll: '全部',
    filterByLeader: '將領',
    filterByPlace: '地點',
    filterCategory: '類別',
    filterShow: '顯示',
    filterPeople: '人物',
    filterPlace: '地點',
    filterOther: '其他',
    filterReset: '清除篩選',
    filteredOut: '沒有符合篩選的事件',
    catBattle: '戰鬥',
    catCharacter: '角色',
    catEconomy: '經濟',
    catFaction: '勢力',
    catAdmin: '行政',
    catPlace: '拓展',
    battle: '戰鬥',
    battleDesc: '{attacker} 攻打 {place}',
    defeat: '戰敗',
    defeatDesc: '{character} 在 {place} 戰敗',
    escapeSuccess: '逃脫成功',
    escapeSuccessDesc: '{character} 成功逃離 {place}',
    // 無路可退的「逃離」：撿回一命但留駐原地（troops 歸 0），不是真的離開 /
    // The no-way-out "escape": survived but stayed put (troops zeroed), not a real escape
    escapeSurvivedDesc: '{character} 在 {place} 撿回一命（無路可退，留駐原地）',
    // 號令：君王按性格動員全軍——進攻或馳援 /
    // The call: the king musters the host by posture — an assault or a relief
    signalAttackDesc: '{faction} 的 {character} 號令全軍進攻 {place}',
    signalDefendDesc: '{faction} 的 {character} 號令全軍馳援 {place}',
    // 底部卡片的標題（觸摸設備的屬性提示）/ The sheet's title (touch-device ability tips)
    //
    // **它住在 `character` 而不是 `events`**：呼叫端是 tooltip.tsx 的
    // `t('character.abilityTipTitle')`，而這個鍵一度放在 events 裡，兩個語系都放錯，
    // 於是卡片標題印出原始鍵名。/ It lives under `character`, not `events`: the
    // caller is `t('character.abilityTipTitle')` in tooltip.tsx, and the key sat in
    // `events` in BOTH locales, so the sheet printed the raw key.
    escapeFail: '逃脫失敗',
    escapeFailDesc: '{character} 未能逃離 (速度差: {speedDiff})',
    defection: '叛變',
    defectionDesc: '{character} 叛離了原勢力',
    defectionLeft: '離開了勢力 {faction}',
    defectionAt: '在 {place}',
    defectionJoined: '加入了勢力 {faction}',
    defectionFounded: '建立了新勢力 {faction}',
    newFaction: '新勢力建立',
    newFactionDesc: '{character} 建立了新勢力 {faction}',
    signal: '信號發送',
    signalDesc: '{character} 發送信號至 {place}',
    death: '死亡',
    deathDesc: '{character} 已死亡',
    battleDeath: '戰鬥死亡',
    battleDeathDesc: '{character} 在 {place} 戰死',
    // 戰爭回放彈窗 / the war replay modal
    warReplay: '戰爭回放',
    warRoundLabel: '第 {n} / {total} 輪',
    warStrike: '第 {n} 擊',
    warOutcome: '結果',
    strikeHit: '命中',
    strikeKilled: '擊潰',
    strikeFled: '逃脫',
    warSummary: '戰爭歷經 {rounds} 輪、共 {strikes} 次出手。',
    warCaptured: '{name} 佔領了此地。',
    warDeath: '{name} 在此役陣亡。',
    prevStrike: '上一擊',
    nextStrike: '下一擊',
    play: '播放',
    pause: '暫停',
    loading: '載入中…',
    noWarData: '這場戰鬥沒有出手紀錄。',
    recruitment: '徵兵',
    recruitmentDesc: '{place} 徵募了 {count} 名士兵',
    building: '建築升級',
    buildingDesc: '{place} 的 {building} 升級至 {level}',
    friendship: '友誼建立',
    friendshipDesc: '{character1} 與 {character2} 成為朋友',
    discontent: '不滿產生',
    discontentDesc: '{character1} 對 {character2} 感到不滿',
    collapse: '勢力瓦解',
    collapseDesc: '{faction} 開始瓦解',
    elimination: '勢力消滅',
    eliminationDesc: '{faction} 已完全消滅',
    adminAssigned: '行政官指派',
    adminAssignedDesc: '{character} 被任命為 {place} 的行政官',
    adminRemoved: '行政官免職',
    adminRemovedDesc: '{character} 被免去 {place} 行政官之職（由 {newAdmin} 接任）',
    battleOrder: '戰鬥順序',
    battleOrderDesc: '{place} 的攻擊順序: {order}',
    newPlace: '新地點',
    newPlaceDesc: '建立了新地點 {place}',
    spawn: '角色生成',
    spawnDesc: '{character} 在 {place} 誕生',
    move: '移動',
    moveDesc: '{character} 從 {from} 移動到 {to}',
    buildingUpgrade: '建築升級',
    buildingUpgradeDesc: '{place} 的 {building} 升級至 {level}',
    placeCapture: '佔領新地',
    placeCaptureDesc: '{character} 佔領了 {place}',
  },

  // ── 統計 / Stats ────────────────────────────────────────────────────────
  stats: {
    title: '統計圖表',
    tab: '統計',
    territoriesOverTime: '領地數變化',
    troopsOverTime: '兵力變化',
    goldOverTime: '金錢變化',
    charactersOverTime: '將領數變化',
    // ── 圖表類型 / Chart types ──
    chartType: '圖表類型',
    line: '折線',
    pie: '圓餅',
    square: '長條',
    treemap: '區塊圖',
    peak: '峰值',
    current: '目前',
    // ── 雷達圖 / Radar ──
    attributes: '將領屬性',
    worldAverage: '世界平均',
    factionAverage: '同勢力平均',
    factionAverageSelf: '同勢力僅一人，無參考值',
    expand: '放大檢視',
    factionPower: '勢力力量',
    // ── 世界整體 / World-wide ──
    aliveFactionsOverTime: '存活勢力數',
    totalCharactersOverTime: '總將領數',
    unownedPlacesOverTime: '無主之地',
    garrisonOverTime: '總駐軍',
    roadsOverTime: '道路數',
  },

  // ── 排行 / Ranking ──────────────────────────────────────────────────────
  ranking: {
    title: '勢力排行',
    // 右側面板的「勢力」分頁 / the panel's 勢力 tab
    tab: '勢力',
    rank: '排名',
    territories: '領地',
    troops: '兵力',
    gold: '金錢',
    characters: '將領',
  },

  // ── 管理員 / Admin ──────────────────────────────────────────────────────
  admin: {
    runRound: '執行下一回合',
    resetWorld: '重置世界',
    resetConfirm: '確定要重置世界嗎？此操作不可逆。',
    worldName: '世界名稱',
    createWorld: '建立新世界',
    assignAdmin: '指派行政官',
    selectPlace: '選擇地方',
    selectCharacter: '選擇將領',
  },
} as const;

/** zh 語言鍵的型別 / Type for zh locale keys */
export type ZhLocale = typeof zh;
