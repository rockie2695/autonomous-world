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
      saga: '傳奇',
      live: '即時',
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
      eventFallback: '第 {round} 回合發生了一件事',
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
      credits: '星空影像：NASA / ESA / CSA / STScI',
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
  },

  // ── 地圖 / Map ──────────────────────────────────────────────────────────
  map: {
    zoomIn: '放大',
    zoomOut: '縮小',
    resetView: '重置視圖',
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

  // ── 角色 / Character ────────────────────────────────────────────────────
  character: {
    name: '將領名稱',
    wu: '武力',
    tong: '統領',
    jing: '經濟',
    speed: '速度',
    ambition: '野心',
    loyalty: '忠誠',
    age: '年齡',
    troops: '兵力',
    gold: '金錢',
    place: '位置',
    faction: '所屬勢力',
    alive: '存活',
    dead: '死亡',
    isKing: '國王',
    isAdmin: '行政官',
    loyaltySelf: '為己',
    loyaltyPath: '為道',
    loyaltyAltruism: '為人',
  },

  // ── 地點 / Place ────────────────────────────────────────────────────────
  place: {
    name: '地方名稱',
    owner: '所屬勢力',
    unowned: '無主之地',
    garrison: '駐軍',
    fortress: '堡壘',
    market: '市場',
    barracks: '兵營',
    administrator: '行政官',
    noAdmin: '無行政官',
    characters: '將領',
    connections: '連接道路',
    upgrade: '升級',
    upgradeCost: '升級花費',
  },

  // ── 事件 / Events ───────────────────────────────────────────────────────
  events: {
    title: '事件日誌',
    tab: '事件',
    battle: '戰鬥',
    battleDesc: '{attacker} 攻打 {place}',
    defeat: '戰敗',
    defeatDesc: '{character} 在 {place} 戰敗',
    escapeSuccess: '逃脫成功',
    escapeSuccessDesc: '{character} 成功逃離 {place}',
    escapeFail: '逃脫失敗',
    escapeFailDesc: '{character} 未能逃離 (速度差: {speedDiff})',
    defection: '叛變',
    defectionDesc: '{character} 叛離了原勢力',
    newFaction: '新勢力建立',
    newFactionDesc: '{character} 建立了新勢力 {faction}',
    signal: '信號發送',
    signalDesc: '{character} 發送信號至 {place}',
    death: '死亡',
    deathDesc: '{character} 已死亡',
    battleDeath: '戰鬥死亡',
    battleDeathDesc: '{character} 在 {place} 戰死',
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
    adminAssignedDesc: '{character} 被指派為 {place} 的行政官，野心暫時下降',
    adminRemoved: '行政官免職',
    adminRemovedDesc: '{character} 被免去 {place} 行政官職務（由 {newAdmin} 接任），野心上升',
    ambitionDelta: '（野心 {delta}）',
    ambitionRecovered: '野心回復（行政官減免到期）',
    ambitionRecoveredDesc: '{character} 擔任 {place} 行政官的暫時野心減免到期，野心回復',
    battleOrder: '戰鬥順序',
    battleOrderDesc: '{place} 的攻擊順序: {order}',
    newPlace: '新地點',
    newPlaceDesc: '建立了新地點 {place}',
    spawn: '角色生成',
    spawnDesc: '{character} 在世界中誕生',
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
    peak: '峰值',
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
