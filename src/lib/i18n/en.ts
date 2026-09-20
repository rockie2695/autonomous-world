// ============================================================================
// English Translations
// ============================================================================
// All UI strings for en locale.
// Keys follow the pattern: section.item
// ============================================================================

export const en = {
  // ── General ─────────────────────────────────────────────────────────────
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
  },

  // ── Homepage ────────────────────────────────────────────────────────────
  home: {
    intro: 'An infinitely running autonomous simulation. No victory conditions, only eternal evolution.',
    description: 'Watch hundreds of AI characters build factions, conquer, ally, and betray on a dynamic map.',
    features: {
      autonomous: 'Fully Autonomous',
      realtime: 'Real-time Simulation',
      infinite: 'Infinite World',
    },
    startButton: 'Enter World',
  },

  // ── Game ────────────────────────────────────────────────────────────────
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

  // ── Map ─────────────────────────────────────────────────────────────────
  map: {
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    resetView: 'Reset View',
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

  // ── Faction ─────────────────────────────────────────────────────────────
  faction: {
    name: 'Faction Name',
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

  // ── Place ───────────────────────────────────────────────────────────────
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

  // ── Events ──────────────────────────────────────────────────────────────
  events: {
    title: 'Event Log',
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
    adminAssignedDesc: '{character} assigned as administrator of {place}',
    battleOrder: 'Battle Order',
    battleOrderDesc: '{place} attack order: {order}',
    newPlace: 'New Place',
    newPlaceDesc: 'New place {place} was created',
    spawn: 'Character Spawned',
    spawnDesc: '{character} was born into the world',
    buildingUpgrade: 'Building Upgrade',
    buildingUpgradeDesc: '{place} {building} upgraded to level {level}',
  },

  // ── Stats ───────────────────────────────────────────────────────────────
  stats: {
    title: 'Statistics',
    territoriesOverTime: 'Territories Over Time',
    troopsOverTime: 'Troops Over Time',
    goldOverTime: 'Gold Over Time',
    charactersOverTime: 'Characters Over Time',
  },

  // ── Ranking ─────────────────────────────────────────────────────────────
  ranking: {
    title: 'Faction Ranking',
    rank: 'Rank',
    territories: 'Territories',
    troops: 'Troops',
    gold: 'Gold',
    characters: 'Characters',
  },

  // ── Admin ───────────────────────────────────────────────────────────────
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

/** Type for en locale keys */
export type EnLocale = typeof en;
