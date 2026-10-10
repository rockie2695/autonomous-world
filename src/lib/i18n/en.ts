// ============================================================================
// 英文翻譯 / English Translations
// ============================================================================
// en 語言的所有 UI 字串。/ All UI strings for en locale.
// 鍵遵循 section.item 格式。/ Keys follow the pattern: section.item
// ============================================================================

export const en = {
  // ── 通用 / General ───────────────────────────────────────────────────────
  general: {
    title: 'Autonomous World',
    subtitle: 'An infinitely running autonomous simulation',
    loading: 'Loading...',
    error: 'An error occurred',
    login: 'Sign in with Google',
    logout: 'Sign out',
    welcome: 'Welcome back',
    language: 'Language',
    english: 'English',
    chinese: '中文',
    details: 'Details',
    status: 'Status',
    back: 'Back',
    close: 'Close',
  },

  // ── 認證 / Authentication ─────────────────────────────────────────────────
  auth: {
    signInTitle: 'Sign in',
    registerTitle: 'Create an account',
    signInTab: 'Sign in',
    registerTab: 'Register',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    name: 'Display name',
    namePlaceholder: 'Optional',
    passwordHint: 'At least 8 characters',
    signIn: 'Sign in',
    register: 'Create account',
    submitting: 'Working...',
    orDivider: 'or',
    continueWithGoogle: 'Continue with Google',
    noAccount: 'No account yet?',
    haveAccount: 'Already have an account?',
    successRegister: 'Account created. Signing you in...',
    successSetPassword: 'Password set. You can now sign in with your email.',
    setPassword: 'Add a password',
    setPasswordHint:
      'Your account signs in with Google. Add a password to allow email sign-in too.',
    passwordAlreadySet: 'This account already has a password.',
    skipForNow: 'Skip for now',
    skipHint: 'You can add one later from this page.',
    alreadySignedIn: 'Already signed in',
    alreadyHasPassword:
      'This account already has a password, so you can sign in with your email.',
    continueToGame: 'Continue to the world',
  },

  // ── 首頁 / Homepage ─────────────────────────────────────────────────────
  home: {
    intro: 'An infinitely running autonomous simulation. No victory conditions, only eternal evolution.',
    description: 'Watch hundreds of AI characters build factions, conquer, ally, and betray on a dynamic map.',
    features: {
      autonomous: 'Fully Autonomous',
      autonomousDesc: 'The world evolves without human intervention. AI characters make decisions, conquer, and form alliances on their own.',
      realtime: 'Real-time Simulation',
      realtimeDesc: 'Every round calculates all events automatically, including battles, economy, diplomacy, and defections.',
      infinite: 'Infinite World',
      infiniteDesc: 'No endpoint, only continuous change. Factions rise and fall, history is constantly rewritten.',
      noVictory: 'No Victory Conditions',
      noVictoryDesc: 'Purely observational experience. Watch AIs write their own legends.',
    },
    howItWorks: {
      eyebrow: 'The Loop',
      title: 'How It Works',
      step1: 'Observe the World',
      step1Desc: 'Watch hundreds of AI characters build factions, conquer territories, form alliances, and betray each other.',
      step2: 'Analyze the Situation',
      step2Desc: 'Track faction dynamics, character strengths, and economic development to understand the flow of history.',
      step3: 'Witness Evolution',
      step3Desc: 'Observe hundreds of rounds of evolution, witnessing the rise and fall of civilizations and the birth of legends.',
      orbitLabel: 'A 3D orbit diagram: the core carries the real round number, and the three satellites match the observe, analyze, and witness stages.',
    },
    stats: {
      title: 'World Overview',
      characters: 'Active Characters',
      factions: 'Active Factions',
      places: 'Territories',
      rounds: 'Rounds Executed',
    },
    startButton: 'Enter World',
    learnMore: 'Learn More',

    // ── 首頁導覽 / Homepage navigation ───────────────────────────────────
    nav: {
      world: 'World',
      how: 'How It Works',
      saga: 'Saga',
      live: 'Live',
      enter: 'Enter World',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      menuLabel: 'Homepage navigation',
    },

    // ── 首屏 / Hero ───────────────────────────────────────────────────────
    hero: {
      eyebrow: 'Autonomous simulation, running in your browser',
      secondaryCta: 'Watch the world run',
      scroll: 'Scroll down',
      roundTag: 'Round {round}',
    },

    // ── 訊號流 / Signal feed ─────────────────────────────────────────────
    feed: {
      label: 'Signal Feed',
      live: 'LIVE',
    },

    // ── 真實世界圖譜 / Real world graph ──────────────────────────────────
    world: {
      eyebrow: 'Real World Graph',
      title: 'The world has no script',
      body: 'Every point is a real settlement, every line a real road. This is the world that is running right now — not an illustration of one.',
      cta: 'See how it works',
      legendTitle: 'Factions still alive',
      graphLabel: 'A three-dimensional faction graph rendered from live world data: each point is a settlement, colored by the faction that holds it',
      graphEmpty: 'This world has no settlements yet.',
    },

    // ── 特色區段 / Features section ──────────────────────────────────────
    featuresSection: {
      eyebrow: 'Core Features',
      title: 'Four things that never change',
    },

    // ── 傳奇時間軸 / Faction saga ────────────────────────────────────────
    saga: {
      eyebrow: 'Faction Saga',
      title: 'A legend with no ending',
      s1Title: 'Origin',
      s1Text: 'One king, one city. The world starts turning.',
      s2Title: 'Rift',
      s2Text: 'The first rebel faction appears, and a border is drawn for the first time.',
      s3Title: 'Alliance',
      s3Text: 'Old enemies shake hands, and a coalition redraws the map overnight.',
      s4Title: 'Betrayal',
      s4Text: 'The pact collapses faster than the war, and a new king rises in the gap.',
      s5Title: 'Eternity',
      s5Text: 'No finale. Only the next round.',
    },

    // ── 即時統計 / Live world readout ────────────────────────────────────
    live: {
      eyebrow: 'Live Data',
      title: 'The real numbers, right now',
      hint: 'Read straight from the world that is running. No sign-in required.',
      roads: 'Roads',
      unowned: 'Unclaimed',
      unownedFaction: 'Unclaimed',
      truncated: 'Showing the {shown} largest garrisons of {total} settlements',
      updated: 'Read at {time}',
      unavailable: 'World data is unavailable',
      unavailableHint: 'The world may not have started yet, or the data source is temporarily unreachable.',
      eventFallback: 'Something happened in round {round}',
    },

    // ── 行動呼籲 / Call to action ────────────────────────────────────────
    cta: {
      eyebrow: 'Enter The World',
      title: 'Ready to observe?',
      body: 'Step into Autonomous World and watch AIs write a legend with no ending.',
    },

    // ── 頁尾 / Footer ────────────────────────────────────────────────────
    footer: {
      tagline: 'Autonomous World — Eternal Evolution Simulation',
      credits: 'Space imagery: NASA / ESA / CSA / STScI (public domain)',
      runTitle: 'Run it locally',
      runHint: 'Needs Node.js 20 or newer and a PostgreSQL database.',
      licenseTitle: 'License',
      license: 'Source code released under the MIT license.',
    },
  },

  // ── 遊戲 / Game ─────────────────────────────────────────────────────────
  game: {
    round: 'Round',
    currentRound: 'Current Round',
    selectRound: 'Select Round',
    autoPlay: 'Auto Play',
    autoPlaySpeed: 'Playback Speed',
    pause: 'Pause',
    play: 'Play',
    nextRound: 'Next Round',
    adminOnly: 'Admin Only',
    noData: 'No data for this round',
  },

  // ── 地圖 / Map ──────────────────────────────────────────────────────────
  map: {
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    resetView: 'Reset View',
    zoomLevel: 'Zoom level',
    territory: 'Territory',
    place: 'Place',
    faction: 'Faction',
    troops: 'Troops',
    buildings: 'Buildings',
    fortress: 'Fortress',
    market: 'Market',
    barracks: 'Barracks',
    garrison: 'Garrison',
    administrator: 'Administrator',
    linkedPlaces: 'Linked Places',
  },

  // ── 勢力 / Faction ──────────────────────────────────────────────────────
  faction: {
    name: 'Faction Name',
    tab: 'Characters',
    color: 'Color',
    alive: 'Alive',
    collapsed: 'Collapsed',
    collapsing: 'Collapsing',
    territories: 'Territories',
    characters: 'Characters',
    totalTroops: 'Total Troops',
    totalGold: 'Total Gold',
    king: 'King',
    noKing: 'No King',
  },

  // ── Leader Avatar ───────────────────────────────────────────────────────
  // The avatar's hover tooltip explains which ability band each accessory is
  avatar: {
    label: 'Leader avatar: {detail}',
    tier: {
      high: 'High',
      mid: 'Mid',
      low: 'Low',
    },
    cue: {
      wu: { high: 'Helmet', mid: 'Headband', low: 'Old scar' },
      tong: { high: 'Gold board', mid: 'Plain steel board', low: 'Patched hemp strap' },
      jing: { high: 'Abacus', mid: 'Cash coin', low: 'Empty pouch' },
    },
  },

  // ── Character ───────────────────────────────────────────────────────────
  character: {
    name: 'Character Name',
    wu: 'Martial',
    tong: 'Leadership',
    jing: 'Economy',
    speed: 'Speed',
    ambition: 'Ambition',
    loyalty: 'Loyalty',
    age: 'Age',
    troops: 'Troops',
    gold: 'Gold',
    place: 'Location',
    faction: 'Faction',
    alive: 'Alive',
    dead: 'Dead',
    isKing: 'King',
    isAdmin: 'Administrator',
    loyaltySelf: 'Self',
    loyaltyPath: 'Path',
    loyaltyAltruism: 'Altruism',
  },

  // ── 地點 / Place ────────────────────────────────────────────────────────
  place: {
    name: 'Place Name',
    owner: 'Owner',
    unowned: 'Unowned',
    garrison: 'Garrison',
    fortress: 'Fortress',
    market: 'Market',
    barracks: 'Barracks',
    administrator: 'Administrator',
    noAdmin: 'No Administrator',
    characters: 'Characters',
    connections: 'Connected Roads',
    upgrade: 'Upgrade',
    upgradeCost: 'Upgrade Cost',
  },

  // ── 事件 / Events ───────────────────────────────────────────────────────
  chart: {
    round: 'Round',
  },
  events: {
      incomeDesc: '{place} earned {gold} gold, recruited {recruits} troops (garrison {total})',
      incomeLeader: '{leader} received {gold} gold (now {total})',
      reportTitle: 'Battle report',
      reportAttack: 'Attack',
      reportDefence: 'Defence',
      reportRoll: 'Roll',
      reportPower: 'Power',
      reportWon: 'Higher attack power — the garrison broke and the place was taken.',
      reportLost: 'Higher defence power — the assault failed.',
      reportNoDefenders: 'No defenders here; the place was taken without a fight.',
      reportOpen: 'Report',
    title: 'Event Log',
    tab: 'Events',
    filterFaction: 'Faction',
    filterAll: 'All',
    filterCategory: 'Category',
    filterShow: 'Show',
    filterPeople: 'People',
    filterPlace: 'Places',
    filterOther: 'Other',
    filterReset: 'Clear filters',
    filteredOut: 'No events match these filters',
    catBattle: 'Battle',
    catCharacter: 'Character',
    catEconomy: 'Economy',
    catFaction: 'Faction',
    catAdmin: 'Administration',
    catPlace: 'Expansion',
    battle: 'Battle',
    battleDesc: '{attacker} attacks {place}',
    defeat: 'Defeat',
    defeatDesc: '{character} defeated at {place}',
    escapeSuccess: 'Escape Success',
    escapeSuccessDesc: '{character} escaped from {place}',
    escapeFail: 'Escape Failed',
    escapeFailDesc: '{character} failed to escape (speed diff: {speedDiff})',
    defection: 'Defection',
    defectionDesc: '{character} defected from their faction',
    newFaction: 'New Faction',
    newFactionDesc: '{character} founded new faction {faction}',
    signal: 'Signal Sent',
    signalDesc: '{character} sends signal to {place}',
    death: 'Death',
    deathDesc: '{character} has died',
    battleDeath: 'Battle Death',
    battleDeathDesc: '{character} died in battle at {place}',
    recruitment: 'Recruitment',
    recruitmentDesc: '{place} recruited {count} soldiers',
    building: 'Building Upgrade',
    buildingDesc: '{place} {building} upgraded to level {level}',
    friendship: 'Friendship Formed',
    friendshipDesc: '{character1} and {character2} became friends',
    discontent: 'Discontent Formed',
    discontentDesc: '{character1} feels discontent toward {character2}',
    collapse: 'Faction Collapse',
    collapseDesc: '{faction} begins to collapse',
    elimination: 'Faction Eliminated',
    eliminationDesc: '{faction} has been completely eliminated',
    adminAssigned: 'Admin Assigned',
    adminAssignedDesc: '{character} assigned as administrator of {place}; ambition temporarily reduced',
    adminRemoved: 'Admin Removed',
    adminRemovedDesc: '{character} was removed as administrator of {place} (replaced by {newAdmin}); ambition increased',
    ambitionDelta: ' (ambition {delta})',
    ambitionRecovered: 'Ambition Recovered',
    ambitionRecoveredDesc: '{character}\'s temporary administrator ambition reduction at {place} expired; ambition restored',
    battleOrder: 'Battle Order',
    battleOrderDesc: '{place} attack order: {order}',
    newPlace: 'New Place',
    newPlaceDesc: 'New place {place} was created',
    spawn: 'Character Spawned',
    spawnDesc: '{character} was born into the world',
    move: 'Moved',
    moveDesc: '{character} moved from {from} to {to}',
    buildingUpgrade: 'Building Upgrade',
    buildingUpgradeDesc: '{place} {building} upgraded to level {level}',
    placeCapture: 'Place Captured',
    placeCaptureDesc: '{character} captured {place}',
  },

  // ── 統計 / Stats ────────────────────────────────────────────────────────
  stats: {
    title: 'Statistics',
    tab: 'Stats',
    territoriesOverTime: 'Territories Over Time',
    troopsOverTime: 'Troops Over Time',
    goldOverTime: 'Gold Over Time',
    charactersOverTime: 'Characters Over Time',
    // ── 圖表類型 / Chart types ──
    chartType: 'Chart Type',
    line: 'Line',
    pie: 'Pie',
    square: 'Bar',
    treemap: 'Treemap',
    peak: 'Peak',
    current: 'Current',
    // ── 雷達圖 / Radar ──
    attributes: 'Character Attributes',
    worldAverage: 'World average',
    factionAverage: 'Faction average',
    factionAverageSelf: 'Only leader in faction — no reference',
    expand: 'Enlarge',
    factionPower: 'Faction Power',
    // ── 世界整體 / World-wide ──
    aliveFactionsOverTime: 'Alive Factions',
    totalCharactersOverTime: 'Total Characters',
    unownedPlacesOverTime: 'Unowned Places',
    garrisonOverTime: 'Total Garrison',
    roadsOverTime: 'Roads',
  },

  // ── 排行 / Ranking ──────────────────────────────────────────────────────
  ranking: {
    title: 'Faction Ranking',
    rank: 'Rank',
    territories: 'Territories',
    troops: 'Troops',
    gold: 'Gold',
    characters: 'Characters',
  },

  // ── 管理員 / Admin ──────────────────────────────────────────────────────
  admin: {
    runRound: 'Run Next Round',
    resetWorld: 'Reset World',
    resetConfirm: 'Are you sure you want to reset the world? This cannot be undone.',
    worldName: 'World Name',
    createWorld: 'Create New World',
    assignAdmin: 'Assign Administrator',
    selectPlace: 'Select Place',
    selectCharacter: 'Select Character',
  },
} as const;

/** en 語言鍵的型別 / Type for en locale keys */
export type EnLocale = typeof en;
