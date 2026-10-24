// ============================================================================
// 回合的階段（單一來源）/ The phases of a round (one source)
// ============================================================================
// 回合跑的每一個階段在這裡列一次：伺服器用它計時、回合檢查器用它顯示、首頁
// 「世界如何運轉」那張圖也用它畫。三處共用一份——階段清單一旦各寫各的，就會漂移，
// 然後圖上會畫著一個伺服器根本沒跑的階段。
//
// Every phase of a round is listed once here: the server times them, the round
// inspector shows them, and the home page's "how the world runs" diagram draws
// them. One list, three consumers - a phase list written twice drifts, and then
// the diagram shows a phase the server never runs.

/** 階段識別碼（與執行它的函式同名）/ A phase's id (matches the function that runs it) */
export type RoundPhaseId =
  | 'spawnPlaces'
  | 'spawnCharacters'
  | 'ageAndDeath'
  | 'childbirth'
  | 'economy'
  | 'signals'
  | 'relationships'
  | 'defectionEvents'
  | 'loyaltyCheck'
  | 'aiMove'
  | 'battle'
  | 'build'
  | 'assignAdmins'
  | 'factionCollapse'
  | 'factionDeath'
  | 'layout'
  | 'snapshot'
  | 'advance';

/** 階段分組：回合的四個大段落 / The round's four big movements */
export type RoundPhaseGroup = 'world' | 'simulation' | 'aftermath' | 'persistence';

export interface RoundPhaseDef {
  id: RoundPhaseId;
  group: RoundPhaseGroup;
}

/** 回合的完整階段順序 / The round's phases, in order */
export const ROUND_PHASES: readonly RoundPhaseDef[] = [
  { id: 'spawnPlaces', group: 'world' },
  { id: 'spawnCharacters', group: 'world' },
  { id: 'ageAndDeath', group: 'simulation' },
  { id: 'childbirth', group: 'simulation' },
  { id: 'economy', group: 'simulation' },
  { id: 'signals', group: 'simulation' },
  { id: 'relationships', group: 'simulation' },
  { id: 'defectionEvents', group: 'simulation' },
  { id: 'loyaltyCheck', group: 'simulation' },
  { id: 'aiMove', group: 'simulation' },
  { id: 'battle', group: 'simulation' },
  { id: 'build', group: 'aftermath' },
  { id: 'assignAdmins', group: 'aftermath' },
  { id: 'factionCollapse', group: 'aftermath' },
  { id: 'factionDeath', group: 'aftermath' },
  { id: 'layout', group: 'persistence' },
  { id: 'snapshot', group: 'persistence' },
  { id: 'advance', group: 'persistence' },
];

/** 分組的顯示順序 / The order the groups are shown in */
export const ROUND_PHASE_GROUPS: readonly RoundPhaseGroup[] = [
  'world',
  'simulation',
  'aftermath',
  'persistence',
];

/** 某個階段的分組 / The group a phase belongs to */
export function phaseGroupOf(id: RoundPhaseId): RoundPhaseGroup {
  return ROUND_PHASES.find((p) => p.id === id)?.group ?? 'simulation';
}

/** 一個階段的耗時 / How long one phase took */
export interface RoundPhaseTiming {
  /** 階段識別碼 / The phase's id */
  id: RoundPhaseId;
  /** 耗時（毫秒）/ How long it took (ms) */
  ms: number;
}