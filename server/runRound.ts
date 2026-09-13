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
//  7. ambitionEvents()     野心變化 / Ambition changes
//  8. loyaltyCheck()       叛變檢查 / Defection check
//  9. aiMove()             每個角色移動 1 格 / Each character moves 1 tile
// 10. battle()             目的地戰鬥解析 / Battle resolution at destinations
// 11. build()              建築升級 / Building upgrades
// 12. assignAdmins()       AI 自動指派管理員 / AI auto-assign administrators
// 13. factionCollapse()    國王死亡 → 崩潰模式 / King death → collapse mode
// 14. factionDeath()       0 領地 0 角色 → 勢力死亡 / 0 places 0 chars → faction dead
// 15. snapshot()           壓縮並儲存 RoundSnapshot / Compress and store RoundSnapshot
// 16. World.currentRound += 1, 更新 rngState / update rngState
//
// 使用方式 / Usage:
//   import { runRound } from '@/server/runRound';
//   const result = await runRound(worldId);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { createRng } from '@/lib/rng';
import { compressSnapshot } from '@/lib/snapshot';

// ─── 型別 / Types ─────────────────────────────────────────────────────────────────

/**
 * 執行單回合的結果。 / Result of executing a single round.
 */
export interface RoundResult {
  worldId: string;
  round: number;
  duration: number;           // Execution time in ms
  events: number;             // Number of events generated
  charactersSpawned: number;
  charactersDied: number;
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
  let battlesFought = 0;
  let defections = 0;

  // ── 階段 1：生成地點 / Phase 1: Spawn Places ──────────────────────────────
  // const newPlaces = await spawnPlaces(worldId, currentRound, rng);

  // ── 階段 2：生成角色 / Phase 2: Spawn Characters ──────────────────────────
  // const spawned = await spawnCharacters(worldId, currentRound, rng);
  // charactersSpawned = spawned;

  // ── 階段 3：年齡和死亡 / Phase 3: Age and Death ─────────────────────────
  // const deaths = await ageAndDeath(worldId, currentRound, rng);
  // charactersDied = deaths;

  // ── 階段 4：經濟 / Phase 4: Economy ───────────────────────────────────
  // await economy(worldId, currentRound, rng);

  // ── 階段 5：信號 / Phase 5: Signals ───────────────────────────────────
  // await signals(worldId, currentRound, rng);

  // ── 階段 6：關係 / Phase 6: Relationships ─────────────────────────────
  // await relationships(worldId, currentRound, rng);

  // ── 階段 7：野心事件 / Phase 7: Ambition Events ───────────────────────────
  // await ambitionEvents(worldId, currentRound, rng);

  // ── 階段 8：忠誠度檢查 / Phase 8: Loyalty Check ─────────────────────────
  // const defectionCount = await loyaltyCheck(worldId, currentRound, rng);
  // defections = defectionCount;

  // ── 階段 9：AI 移動 / Phase 9: AI Move ───────────────────────────────────
  // await aiMove(worldId, currentRound, rng);

  // ── 階段 10：戰鬥 / Phase 10: Battle ───────────────────────────────────
  // const battleCount = await battle(worldId, currentRound, rng);
  // battlesFought = battleCount;

  // ── 階段 11：建築 / Phase 11: Build ────────────────────────────────────
  // await build(worldId, currentRound, rng);

  // ── 階段 12：指派管理員 / Phase 12: Assign Admins ────────────────────────
  // await assignAdmins(worldId, currentRound, rng);

  // ── 階段 13：勢力崩潰 / Phase 13: Faction Collapse ─────────────────────────
  // await factionCollapse(worldId, currentRound, rng);

  // ── 階段 14：勢力死亡 / Phase 14: Faction Death ────────────────────────────
  // await factionDeath(worldId, currentRound, rng);

  // ── 階段 15：快照 / Phase 15: Snapshot ─────────────────────────────────
  // TODO: Create snapshot
  // const snapshot = await createSnapshot(worldId);
  // await prisma.roundSnapshot.create({
  //   data: {
  //     worldId,
  //     round: currentRound,
  //     data: snapshot,
  //   },
  // });

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

  return {
    worldId,
    round: currentRound,
    duration,
    events: 0, // TODO: Count actual events
    charactersSpawned,
    charactersDied,
    battlesFought,
    defections,
  };
}

// ─── 佔位階段函數 / Placeholder Phase Functions ───────────────────────────────────
// 這些將在開發的第二階段實作。
// These will be implemented in Phase 2 of development.
// 每個函數將位於 server/phases/ 下的獨立檔案中。
// Each function will be in its own file under server/phases/.

/**
 * 階段 1：生成新地點和道路。 / Phase 1: Spawn new places and roads.
 * 每回合建立 1 個新地點（可在 gameConfig.ts 設定）。 / Creates 1 new place per round (configurable in gameConfig.ts).
 */
async function spawnPlaces(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<number> {
  // TODO: Implement in server/phases/spawnPlaces.ts
  return 0;
}

/**
 * 階段 2：在地點生成新角色。 / Phase 2: Spawn new characters at places.
 * 每個地點根據世界進度有機會生成角色。 / Each place has a chance to spawn a character based on world progress.
 */
async function spawnCharacters(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<number> {
  // TODO: Implement in server/phases/spawnCharacters.ts
  return 0;
}

/**
 * 階段 3：角色年齡增長並檢查老年死亡。 / Phase 3: Age characters and check for old age deaths.
 * 角色每回合年齡 +1，年齡 >= maxAge 時死亡。 / Characters age +1 per round, die when age >= maxAge.
 */
async function ageAndDeath(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<number> {
  // TODO: Implement in server/phases/ageAndDeath.ts
  return 0;
}

/**
 * 階段 4：分配收入並處理招募。 / Phase 4: Distribute income and handle recruitment.
 * 收入分配：40% 國王，30% 管理員，30% 與其他人共享。 / Income split: 40% king, 30% admin, 30% shared among others.
 */
async function economy(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/economy.ts
}

/**
 * 階段 5：處理信號（集結兵力）。 / Phase 5: Process signals (rally troops).
 * 信號在 SIGNAL_DURATION 回合後過期。 / Signals expire after SIGNAL_DURATION rounds.
 */
async function signals(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/signals.ts
}

/**
 * 階段 6：建立友誼和不滿。 / Phase 6: Form friendships and discontent.
 * 附近角色有隨機機會建立關係。 / Random chance for nearby characters to form relationships.
 */
async function relationships(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/relationships.ts
}

/**
 * 階段 7：處理野心事件。 / Phase 7: Process ambition events.
 * 野心根據晉升、友誼、國王力量而變化。 / Ambition changes based on promotions, friendships, king strength.
 */
async function ambitionEvents(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/ambitionEvents.ts
}

/**
 * 階段 8：檢查叛變。 / Phase 8: Check for defections.
 * 高野心的角色可能叛變到其他勢力。 / Characters with high ambition may defect to other factions.
 */
async function loyaltyCheck(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<number> {
  // TODO: Implement in server/phases/loyaltyCheck.ts
  return 0;
}

/**
 * 階段 9：AI 移動。 / Phase 9: AI movement.
 * 每個角色向目標移動 1 格。 / Each character moves 1 tile toward their target.
 * 移動順序：速度降序（v1.1）。 / Movement order: speed descending (v1.1).
 */
async function aiMove(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/aiMove.ts
}

/**
 * 階段 10：戰鬥解析。 / Phase 10: Battle resolution.
 * 到達敵方領地的角色與防禦者戰鬥。 / Characters arriving at enemy territories fight defenders.
 * 速度決定逃脫機率（v1.1）。 / Speed determines escape probability (v1.1).
 */
async function battle(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<number> {
  // TODO: Implement in server/phases/battle.ts
  return 0;
}

/**
 * 階段 11：建築升級。 / Phase 11: Building upgrades.
 * 管理員如果有足夠金幣可以升級建築。 / Administrators can upgrade buildings if they have enough gold.
 */
async function build(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/build.ts
}

/**
 * 階段 12：自動指派管理員。 / Phase 12: Auto-assign administrators.
 * AI 將統御最高的角色指派為地點管理員。 / AI assigns the character with highest tong to administer places.
 */
async function assignAdmins(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/assignAdmins.ts
}

/**
 * 階段 13：處理勢力崩潰。 / Phase 13: Process faction collapse.
 * 當國王死亡時，勢力進入崩潰狀態。 / When king dies, faction enters collapsing state.
 * 每回合有 1-3 個角色隨機叛變。 / Each round, 1-3 characters defect randomly.
 */
async function factionCollapse(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/factionCollapse.ts
}

/**
 * 階段 14：檢查勢力死亡。 / Phase 14: Check for faction death.
 * 如果勢力有 0 領地和 0 角色，它就死亡。 / If a faction has 0 places and 0 characters, it dies.
 */
async function factionDeath(
  worldId: string,
  round: number,
  rng: ReturnType<typeof createRng>
): Promise<void> {
  // TODO: Implement in server/phases/factionDeath.ts
}
