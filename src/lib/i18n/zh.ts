// ============================================================================
// Chinese (Traditional) Translations
// ============================================================================
// All UI strings for zh-TW locale.
// Keys follow the pattern: section.item
// ============================================================================

export const zh = {
  // ── General ─────────────────────────────────────────────────────────────
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
  },

  // ── Homepage ────────────────────────────────────────────────────────────
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
  },

  // ── Game ────────────────────────────────────────────────────────────────
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

  // ── Map ─────────────────────────────────────────────────────────────────
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

  // ── Faction ─────────────────────────────────────────────────────────────
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

  // ── Character ───────────────────────────────────────────────────────────
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

  // ── Place ───────────────────────────────────────────────────────────────
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

  // ── Events ──────────────────────────────────────────────────────────────
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
    adminAssignedDesc: '{character} 被指派為 {place} 的行政官',
    battleOrder: '戰鬥順序',
    battleOrderDesc: '{place} 的攻擊順序: {order}',
    newPlace: '新地點',
    newPlaceDesc: '建立了新地點 {place}',
    spawn: '角色生成',
    spawnDesc: '{character} 在世界中誕生',
    buildingUpgrade: '建築升級',
    buildingUpgradeDesc: '{place} 的 {building} 升級至 {level}',
  },

  // ── Stats ───────────────────────────────────────────────────────────────
  stats: {
    title: '統計圖表',
    tab: '統計',
    territoriesOverTime: '領地數變化',
    troopsOverTime: '兵力變化',
    goldOverTime: '金錢變化',
    charactersOverTime: '將領數變化',
  },

  // ── Ranking ─────────────────────────────────────────────────────────────
  ranking: {
    title: '勢力排行',
    rank: '排名',
    territories: '領地',
    troops: '兵力',
    gold: '金錢',
    characters: '將領',
  },

  // ── Admin ───────────────────────────────────────────────────────────────
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

/** Type for zh locale keys */
export type ZhLocale = typeof zh;
