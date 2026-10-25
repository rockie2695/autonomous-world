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
    // Two panels (the event log, the round overview) each carry a round dropdown and
    // share this one label
    roundSelect: 'Select round',
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
      pipelineTitle: 'What a round actually runs',
      pipelineNote:
        'Not a diagram of the idea: every capture, every defection and every coin on the map is computed by this sequence, in this order.',
      outOfScope:
        'What it does not do: no script, no hints, no scripted outcomes. Factions die, thrones empty, wars are lost - none of it is arranged.',
    },
    engineLab: {
      fig: 'Fig 1',
      title: 'Starship Assembly Line',
      hint: 'Hover a hand · ← → changes station · Replay',
      readoutIdle: 'Waiting for world data…',
      rnd: 'RND',
      replay: 'Replay the assembly animation',
      replayButton: 'Replay',
      keySelected: 'The hand you point at (the readout names its phase)',
      keyFlame: 'The test-fire: lit when the engine is in and a round advances',
      caption:
        'An 18-station starship assembly line laid out on a gentle S curve: the eighteen electronic hands sit in two rows (odd stations in the far row, even in the near row, and stations 3/6/9/12/15/18 each on a raised plinth), reaching in from their own flank toward the product riding its cradle — one station per phase of the list on the left, with each tool head decided by that phase\u2019s group. When a round advances, the ship the last round finished rolls out along the curve, a bare keel enters, the 18 stations work through it, the engine goes in at station 17 and is test-fired at 18; meanwhile the back wall\u2019s 18-cell status strip fills cell by cell and the odometer rolls to the new round number (public endpoint, polled every 15 s). The ship\u2019s completeness *is* this pass\u2019s progress: when the work point reaches station n, batches 1..n are fitted.',
      aria: 'A starship assembly line with 18 stations: hover, or use the arrow keys, to pick a station',
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
      orrery: 'Orrery',
      saga: 'Saga',
      live: 'Live',
      // The three sections that only the right-hand dot rail names: the header
      // row does not carry them, but every screen of the deck needs a name or
      // the dots are decoration with no meaning
      hero: 'Home',
      features: 'Features',
      cta: 'Start',
      // The dot rail's accessible name
      slidesLabel: 'Section navigation',
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

    // ── 發條星儀 / The Roundworks Orrery ─────────────────────────────────
    // 文案對齊模型頁的字幕：三勢力行星 4/6/8 回合一圈、衛星是據點、
    // 錶盤記回合。不要在這裡介紹模型頁沒有的東西。
    // The copy mirrors the model page's own captions: three faction planets
    // orbiting in 4/6/8 rounds, moons as settlements, the dial logging rounds.
    // Nothing may be advertised here that the model page does not have.
    orrery: {
      eyebrow: 'Roundworks Orrery',
      title: 'One wind of the key, one round of the world',
      body: 'Three sovereign planets ride the rings — Yanzhou orbits in 4 rounds, Shuangji in 6, Chenxing in 8. Moons circle them as settlements, and the dial logs every round completed. Drag the model or press an arrow key to wind it.',
      // 星儀 iframe 的無障礙名稱 / accessible name of the orrery iframe
      frameTitle: 'Roundworks Orrery — one wind of the key, one round of the world (interactive model)',
      linkLabel: 'Open the full model page',
      // 另開視窗的提示：只給輔助科技讀，畫面上不必再多一行字
      // The new-tab hint is for assistive tech only; the visible line stays clean
      linkHint: '(opens in a new tab)',
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
    roundStale: 'The round already advanced — the view was stale and has been resynced; please try again',
    roundDuration: 'Round time',
    roundOverview: 'Round overview',
    roundEvents: 'Events',
    roundBattles: 'Battles',
    roundDefections: 'Defections',
    roundPhases: 'Phase timings',
    roundPhaseTotal: 'Total',
    roundEventMix: 'Event mix',
    roundWorldScale: 'World scale (places / leaders / factions / roads)',
    roundServedSnapshot: 'snapshot',
    roundServedLive: 'live',
    roundNoData: 'No round measurements yet',
    // The panel's System tab: the round overview (phase timings and summary)
    systemTab: 'System',
  },

  // ── The round's phases ──
  phases: {
    spawnPlaces: 'Spawn places',
    spawnCharacters: 'Spawn characters',
    ageAndDeath: 'Age and death',
    childbirth: 'Childbirth',
    economy: 'Economy',
    signals: 'Signals',
    relationships: 'Relationships',
    defectionEvents: 'Defection events',
    loyaltyCheck: 'Loyalty check',
    aiMove: 'AI movement',
    battle: 'Battle',
    build: 'Build',
    assignAdmins: 'Assign administrators',
    factionCollapse: 'Faction collapse',
    factionDeath: 'Faction death',
    layout: 'Layout recalc',
    snapshot: 'Snapshot',
    advance: 'Advance round',
    // 階段分組的名稱（檢查器、首頁流程圖都讀它）。這四個一度只存在 zh，
    // 英文頁的分組標題因此印出原始鍵名 / The phase group names (the inspector and
    // the home page's pipeline both read them). These four existed in zh only, so
    // English pages printed the raw keys for the group headings.
    groupWorld: 'World generation',
    groupSimulation: 'Simulation',
    groupAftermath: 'Aftermath',
    groupPersistence: 'Persistence',
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
    fortress: 'Fortress',
    market: 'Market',
    barracks: 'Barracks',
    buildings: 'Building effects',
    garrison: 'Garrison',
    administrator: 'Administrator',
    linkedPlaces: 'Linked Places',
    factionRuler: 'Faction ruler',
    leaders: 'Leaders',
    moreLeaders: '+{n} more',
    leaderTroops: 'Leader troops',
    troopTotal: 'Total',
    controlledPlaces: 'Places controlled',
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
    ti: { high: 'Bracer', mid: 'Plain vambrace', low: 'Bare forearm wrap' },
    jing: { high: 'Abacus', mid: 'Cash coin', low: 'Empty pouch' },
      speed: { high: 'Three streaks', mid: 'Two streaks', low: 'One streak' },
    },
  },

  // ── Character ───────────────────────────────────────────────────────────
  character: {
    name: 'Character Name',
    wu: 'Martial',
    tong: 'Leadership',
    ti: 'Physique',
    // The touch-device ability-tip sheet's title, moved here from `events`: the
    // caller is `t('character.abilityTipTitle')` in tooltip.tsx, and in the wrong
    // namespace NEITHER locale resolved, so the sheet printed the raw key.
    abilityTipTitle: 'Ability details',
    jing: 'Economy',
    speed: 'Speed',
    defectionBase: 'Ambition',
    defectionValue: 'Defection value',
    defectionChance: 'Defection chance',
    defectionEvents: 'Affecting this round',
    noDefectionEvents: 'No events affect them this round',
    loyalty: 'Loyalty',
    age: 'Age',
    troops: 'Troops',
    gold: 'Gold',
    place: 'Location',
    administeredPlace: 'Administered Place',
    none: 'None',
    faction: 'Faction',
    alive: 'Alive',
    dead: 'Dead',
    isKing: 'King',
    isAdmin: 'Administrator',
    loyaltySelf: 'Self',
    loyaltyPath: 'Path',
    loyaltyAltruism: 'Altruism',
    // 將領彈窗的關係分頁 / the relations tab on the leader popup
    tabStats: 'Stats',
    tabRelations: 'Relations',
    // 將領彈窗「資料」分頁的三個分組 / the three groups on the leader popup's data tab
    groupBasic: 'Basics',
    groupPower: 'Power',
    groupLoyalty: 'Loyalty',
    abilityModified:
      'Co-located relations moved this by {delta} (base {base}). A friend alongside raises it; someone resented alongside lowers it.',
    friends: 'Friends',
    discontents: 'Unhappy with',
    noFriends: 'No friends yet',
    noDiscontents: 'Unhappy with no one',
    sinceRound: 'since R{round}',
    // ── Ability tooltips (shared by the leader detail popup and the stats tab's radar)
    tipRuleWu: 'Martial scales attack power (troops × multiplier)',
    tipRuleTi: 'Physique scales defence (troops × multiplier)',
    tipRuleTong: 'Leadership decides the size of one purchase (base {base} troops)',
    tipRuleJing: 'Economy scales income: the administrator makes the place produce more',
    tipRuleSpeed: 'Speed sets the escape chance when a fight is lost',
    tipRuleDefection: 'Ambition is the base of the defection value',
    tipRuleAge: 'Age governs lifespan and the childbirth window',
    tipAttack: 'Attack multiplier {value}',
    tipDefence: 'Defence multiplier {value}',
    tipBuyTroops: 'Purchase multiplier {value}',
    tipIncome: 'Income multiplier {value}',
    tipEscape: 'Equal speed {base}; +{per} per point of difference',
    tipDefectionRate: 'Defection chance from this alone {value}',
    tipDefectionRule: 'Defection value = ambition + loyalty penalty + this round\'s ledger deltas',
    tipDefectionLoyaltyTerm: 'loyalty tag differs from the king',
    tipDefectionLedgerTerm: 'this round\'s ledger',
    tipDefectionRateRule: 'Chance = (value − {mid}) ÷ {mid} × {rate}%; below {mid} it is 0',
  },

  // ── 地點 / Place ────────────────────────────────────────────────────────
  place: {
  allPlaces: 'All places',
  searchPlaces: 'Search places…',
  filterOwnership: 'Ownership filter',
  filterAll: 'All',
  filterOwned: 'Owned',
  filterUnowned: 'Unowned',
  // The faction filter is a dropdown rather than a chip row like ownership: there can be
  // hundreds of factions, which no row of buttons can hold.
  filterFaction: 'Faction',
  allFactions: 'All factions',
  tab: 'Places',
    name: 'Place Name',
    owner: 'Owner',
    unowned: 'Unowned',
    administeredBy: 'Administered by {name}',
    administeredByShort: 'Admin',
    garrison: 'Garrison',
    fortress: 'Fortress',
    market: 'Market',
    barracks: 'Barracks',
    buildings: 'Building effects',
    level: 'Level',
    nextLevel: 'Next level',
    upgradeCost: 'Upgrade cost',
    adminHas: 'Administrator has',
    maxLevel: 'Already at max level',
    perLevel: 'Per level',
    perRound: 'Yield per round',
    nextLevelEffect: 'What the next level gives',
    nextLevelStructure: 'Dashed: what the next level adds',
    recruitsToGarrison: 'Recruits (into the garrison)',
    incomeTotal: 'Total income',
    toAdmin: 'Administrator actually gets',
    roundSplit: 'Round split',
    elsewhere: 'elsewhere',
    nobodyPaid: 'Nobody is paid',
    administrator: 'Administrator',
    noAdmin: 'No Administrator',
    characters: 'Characters',
    connections: 'Connected Roads',
    upgrade: 'Upgrade',
  },

  // ── 事件 / Events ───────────────────────────────────────────────────────
  chart: {
    round: 'Round',
  },
  events: {
      incomeDesc: '{place} earned {gold} gold, recruited {recruits} troops (garrison {total})',
      incomeLeader: '{leader} received {gold} gold (now {total})',
      troopsBought: '{leader} bought {bought} troops at {place} for {cost} gold ({gold} gold and {troops} troops left)',
      childBornDesc: '{father} had a child: {character}',
      loadOlder: 'Load {count} older events',
      newEvents: 'New events ▼',
      kingInheritedDesc: '{character} succeeded {father} as king',
      reportTitle: 'Battle report',
      reportAttack: 'Attack',
      // Each war-replay strike prints the damage it dealt; this key was missing
      // from both locales, so the report printed the raw key instead
      reportDamage: 'Damage',
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
    filterByLeader: 'Leader',
    filterByPlace: 'Place',
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
    // The no-way-out "escape": survived but stayed put (troops zeroed), not a real escape
    escapeSurvivedDesc:
      '{character} survived at {place} — no friendly place to flee to, holding in place',
    // The call: the king musters the host by posture — an assault or a relief
    signalAttackDesc: '{character} of {faction} commands the host to attack {place}',
    signalDefendDesc:
      '{character} of {faction} commands the host to relieve {place}',
    escapeFail: 'Escape Failed',
    escapeFailDesc: '{character} failed to escape (speed diff: {speedDiff})',
    defection: 'Defection',
    defectionDesc: '{character} defected from their faction',
    defectionLeft: 'left {faction}',
    defectionAt: 'at {place}',
    defectionJoined: 'joined {faction}',
    defectionFounded: 'founded {faction}',
    newFaction: 'New Faction',
    newFactionDesc: '{character} founded new faction {faction}',
    signal: 'Signal Sent',
    signalDesc: '{character} sends signal to {place}',
    death: 'Death',
    deathDesc: '{character} has died',
    battleDeath: 'Battle Death',
    battleDeathDesc: '{character} died in battle at {place}',
    // the war replay modal
    warReplay: 'War replay',
    warRoundLabel: 'Round {n} / {total}',
    warStrike: 'Strike {n}',
    warOutcome: 'Outcome',
    strikeHit: 'Hit',
    strikeKilled: 'Wiped out',
    strikeFled: 'Fled',
    warSummary: 'The war lasted {rounds} rounds across {strikes} strikes.',
    warCaptured: '{name} took the place.',
    warDeath: '{name} fell in this war.',
    prevStrike: 'Previous strike',
    nextStrike: 'Next strike',
    play: 'Play',
    pause: 'Pause',
    loading: 'Loading…',
    noWarData: 'No recorded strikes for this battle.',
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
    adminAssignedDesc: '{character} assigned as administrator of {place}',
    adminRemoved: 'Admin Removed',
    adminRemovedDesc: '{character} was removed as administrator of {place} (replaced by {newAdmin})',
    battleOrder: 'Battle Order',
    battleOrderDesc: '{place} attack order: {order}',
    newPlace: 'New Place',
    newPlaceDesc: 'New place {place} was created',
    spawn: 'Character Spawned',
    spawnDesc: '{character} was born in {place}',
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
    // The panel's Factions tab
    tab: 'Factions',
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
