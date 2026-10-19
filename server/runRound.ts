// ============================================================================
// 執行回合 — 主要遊戲迴圈 / Run Round — Main Game Loop
// ============================================================================
// 協調單個遊戲回合的執行。
// Orchestrates the execution of a single game round.
// 按規格定義的順序呼叫每個階段。
// Calls each phase in sequence, as defined in the spec.
//
// 回合順序 / Round order:
//  1. spawnPlaces()        新地點 + 道路 / New places + roads
//  2. spawnCharacters()    角色在地點生成 / Characters spawn at places
//  3. ageAndDeath()        年齡 +1，老年死亡檢查 / Age +1, old age death check
//  4. economy()            收入分配，招募 / Income distribution, recruitment
//  5. signals()            信號進展，過期 / Signal progression, expiry
//  6. relationships()      友誼 / 不滿形成 / Friendship / discontent formation
//  7. defectionEvents()     野心變化 / Defection-value changes
//  8. loyaltyCheck()       叛變檢查 / Defection check
//  9. aiMove()             每個角色移動 1 格 / Each character moves 1 tile
// 10. battle()             目的地戰鬥解析 / Battle resolution at destinations
// 11. build()              建築升級 / Building upgrades
// 12. assignAdmins()       AI 自動指派管理員 / AI auto-assign administrators
// 13. factionCollapse()    國王死亡 → 崩潰模式 / King death → collapse mode
// 14. factionDeath()       0 領地 0 角色 → 勢力死亡 / 0 places 0 chars → faction dead
// 15. layout()             ForceAtlas2 佈局重算（每 100 回合）/ ForceAtlas2 recalc (every 100 rounds)
// 16. snapshot()           壓縮並儲存 RoundSnapshot / Compress and store RoundSnapshot
// 17. World.currentRound += 1, 更新 rngState / update rngState
//
// 使用方式 / Usage:
//   import { runRound } from '@/server/runRound';
//   const result = await runRound(worldId);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { createRng } from '@/lib/rng';
import { createSnapshot } from '@/lib/snapshot';
import { recalculateLayout, shouldRecalculate } from './graph/layout';

// ─── 匯入階段函數 / Import Phase Functions ─────────────────────────────────────
import { spawnPlaces } from './phases/spawnPlaces';
import { spawnCharacters } from './phases/spawnCharacters';
import { ageAndDeath } from './phases/ageAndDeath';
import { childbirth } from './phases/childbirth';
import { economy } from './phases/economy';
import { signals } from './phases/signals';
import { relationships } from './phases/relationships';
import { defectionEvents } from './phases/defectionEvents';
import { loyaltyCheck } from './phases/loyaltyCheck';
import { aiMove } from './phases/aiMove';
import { battle } from './phases/battle';
import { build } from './phases/build';
import { assignAdmins } from './phases/assignAdmins';
import { factionCollapse } from './phases/factionCollapse';
import { factionDeath } from './phases/factionDeath';

// ─── 型別 / Types ─────────────────────────────────────────────────────────────────

/**
 * 執行單回合的結果。 / Result of executing a single round.
 */
export interface RoundResult {
  worldId: string;
  round: number;
  duration: number;           // 執行時間（毫秒）/ Execution time in ms
  events: number;             // 產生的事件數 / Number of events generated
  charactersSpawned: number;
  charactersDied: number;
  charactersBorn: number;
  battlesFought: number;
  defections: number;
}

// ─── 主要函數 / Main Function ─────────────────────────────────────────────────

/**
 * 執行單個遊戲回合。 / Execute a single game round.
 *
 * 這是遊戲模擬的主要入口點。 / This is the main entry point for the game simulation.
 * 它按正確順序協調所有階段。 / It orchestrates all phases in the correct order.
 *
 * @param worldId - 要模擬的世界 ID / The ID of the world to simulate
 * @returns 包含統計資料的結果摘要 / Result summary with statistics
 *
 * @example
 * const result = await runRound('world-123');
 * console.log(`Round ${result.round} completed in ${result.duration}ms`);
 */
export async function runRound(worldId: string): Promise<RoundResult> {
  const startTime = Date.now();

  // 取得世界 / Fetch the world
  const world = await prisma.world.findUniqueOrThrow({
    where: { id: worldId },
  });

  if (!world.active) {
    throw new Error(`World ${worldId} is not active`);
  }

  // 從儲存狀態初始化 RNG / Initialize RNG from saved state
  const rng = createRng(world.seed, world.rngState);
  const currentRound = world.currentRound;

  // 追蹤結果 / Track results
  let charactersSpawned = 0;
  let charactersDied = 0;
  let charactersBorn = 0;
  let battlesFought = 0;
  let defections = 0;

  // ── 階段 1：生成地點 / Phase 1: Spawn Places ──────────────────────────────
  await spawnPlaces(worldId, currentRound, rng);

  // ── 階段 2：生成角色 / Phase 2: Spawn Characters ──────────────────────────
  // 回傳本回合新生成的角色 ID；這些角色在本回合不得移動（出生回合原地待命）
  // Returns IDs spawned this round; they must not move in their spawn round
  const spawnedIds = await spawnCharacters(worldId, currentRound, rng);
  charactersSpawned = spawnedIds.length;

  // ── 階段 3：年齡和死亡 / Phase 3: Age and Death ─────────────────────────
  charactersDied = await ageAndDeath(worldId, currentRound, rng);

  // ── 階段 3.5：生育 / Phase 3.5: Childbirth ───────────────────────────────
  // 必須在階段 3（老化與死亡）**之後**：若在本回合才生下的孩子立刻繼承剛死的王位，
  // 那個孩子出生的瞬間就會成為君王，等於「生育」變成復活術。先老化死亡、判斷繼承，
  // 再生子，繼承判斷才只看得到**上一回合就存在**的孩子。
  // Must run AFTER phase 3 (age and death): a child conceived in the same round must not
  // inherit from a parent who just died, or the child would become king the instant it was
  // born and childbirth would be a resurrection spell. Age and death decide inheritance
  // first, so the heir search only ever sees children that already existed.
  const bornIds = await childbirth(worldId, currentRound, rng);
  charactersBorn = bornIds.length;

  // ── 階段 4：經濟 / Phase 4: Economy ───────────────────────────────────
  await economy(worldId, currentRound, rng);

  // ── 階段 5：信號 / Phase 5: Signals ───────────────────────────────────
  await signals(worldId, currentRound, rng);

  // ── 階段 6：關係 / Phase 6: Relationships ─────────────────────────────
  await relationships(worldId, currentRound, rng);

  // ── 階段 7：野心事件 / Phase 7: Defection Events ───────────────────────────
  await defectionEvents(worldId, currentRound, rng);

  // ── 階段 8：忠誠度檢查 / Phase 8: Loyalty Check ─────────────────────────
  defections = await loyaltyCheck(worldId, currentRound, rng);

  // ── 階段 9：AI 移動 / Phase 9: AI Move ───────────────────────────────────
  // skipIds：本回合出生的角色不移動 / Spawned this round stay put
  await aiMove(worldId, currentRound, rng, new Set(spawnedIds));

  // ── 階段 10：戰鬥 / Phase 10: Battle ───────────────────────────────────
  battlesFought = await battle(worldId, currentRound, rng);

  // ── 階段 11：建築 / Phase 11: Build ────────────────────────────────────
  await build(worldId, currentRound, rng);

  // ── 階段 12：指派管理員 / Phase 12: Assign Admins ────────────────────────
  await assignAdmins(worldId, currentRound, rng);

  // ── 階段 13：勢力崩潰 / Phase 13: Faction Collapse ─────────────────────────
  await factionCollapse(worldId, currentRound, rng);

  // ── 階段 14：勢力死亡 / Phase 14: Faction Death ────────────────────────────
  await factionDeath(worldId, currentRound, rng);

  // ── 階段 15：ForceAtlas2 佈局重算 / Phase 15: ForceAtlas2 Layout Recalc ────
  // 每 LAYOUT_RECALC_INTERVAL 回合全域重算一次
  // Full recalculation every LAYOUT_RECALC_INTERVAL rounds
  if (shouldRecalculate(currentRound)) {
    await recalculateLayout(worldId);
  }

  // ── 階段 16：快照 / Phase 16: Snapshot ─────────────────────────────────
  const snapshotBuffer = await createSnapshot(worldId);
  await prisma.roundSnapshot.create({
    data: {
      worldId,
      round: currentRound,
      data: Buffer.from(snapshotBuffer),
    },
  });

  // ── 階段 16：推進回合 / Phase 16: Advance Round ────────────────────────────
  await prisma.world.update({
    where: { id: worldId },
    data: {
      currentRound: currentRound + 1,
      rngState: rng.getState(),
    },
  });

  // ── 回傳結果 / Return Results ─────────────────────────────────────────────
  const duration = Date.now() - startTime;
  // 本回合實際寫入的事件數：占位 0 會讓呼叫端以為這一回合什麼都沒發生 /
  // The real number of events written this round: a placeholder 0 reads as
  // "nothing happened at all"
  const eventCount = await prisma.event.count({
    where: { worldId, round: currentRound },
  });

  return {
    worldId,
    round: currentRound,
    duration,
    events: eventCount,
    charactersSpawned,
    charactersDied,
    charactersBorn,
    battlesFought,
    defections,
  };
}
