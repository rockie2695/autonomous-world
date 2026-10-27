// ============================================================================
// 回合工作（背景執行 + 冪等）/ Round jobs (background execution + idempotency)
// ============================================================================
// 跑一回合要 30 秒左右，而它原本**同步跑在 HTTP 請求裡**：任何代理或平台逾時都會把
// 回合掐斷在一半（`currentRound` 只在全部階段跑完才 +1，於是下一次嘗試會從階段 1
// 重跑，前面的寫入被**重複套用**）。這裡把回合改成**背景工作**：POST 立刻回 202，
// 進度用輪詢拿，真正的執行在請求之外。
//
// Running a round takes ~30 seconds and used to happen **inside the HTTP request**:
// any proxy or platform timeout cuts it in half (currentRound only increments after
// every phase, so the next attempt replays the round and re-applies the earlier
// writes). The round is now a **background job**: the POST returns 202 immediately,
// progress is polled, and the work happens outside the request.
//
// **冪等**：請求帶上 `expectedRound`（客戶端認為的下一回合），伺服器比對
// `world.currentRound`——對不上就 409，不會重跑已經跑過的回合。同一時間只有一個工作
// 在跑（第二次點擊拿到 409，而不是排第二個回合）。
//
// **Idempotency**: the request carries `expectedRound` (the round the client believes
// is next) and the server compares it with world.currentRound - a mismatch is a 409,
// so an already-run round is never replayed. Only one job runs at a time (a second
// click gets a 409 instead of queueing a second round).
//
// **狀態放在 globalThis**：Next.js 每個 route 是自己的 bundle，模組層的 Map 在不同
// route 之間**不共享**；globalThis 是同一個行程，兩邊看到的是同一份狀態。
//
// **The state lives on globalThis**: every Next.js route is its own bundle, so a
// module-level Map is *not* shared between routes; globalThis is the same process,
// so both sides see the same state.
//
// **行程重啟會遺失工作**：工作只活在記憶體裡（伺服器被重啟就沒了，世界停在半路）。
// 這是刻意的取捨——那需要一張工作表與一次資料庫遷移，而這個世界只有一個寫入者。
// 遺失時用戶按一次「下一回合」即可（冪等檢查保證不會重複套用已完成的回合）。
//
// **A restart loses the job**: it lives in memory only (a server restart drops it and
// the world is left half-way). That is a deliberate trade-off - a job table plus a
// migration for a world with a single writer - and after a loss the user presses
// "next round" again (the idempotency check keeps the finished round from being
// re-applied).
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { runRound, type RoundResult } from './runRound';
import type { RoundPhaseId, RoundPhaseTiming } from '@/lib/roundPhases';

export type RoundJobStatus = 'running' | 'done' | 'failed';

/** 一個回合工作的狀態 / The state of one round job */
export interface RoundJobState {
  /** 工作識別碼 / The job's id */
  id: string;
  /** 世界 ID / The world's id */
  worldId: string;
  /** 正在執行的回合 / The round being executed */
  round: number;
  status: RoundJobStatus;
  /** 開始時間（ISO）/ When it started */
  startedAt: string;
  /** 完成時間（ISO）/ When it finished */
  finishedAt?: string;
  /** 目前跑到哪個階段 / The phase currently running */
  currentPhase: RoundPhaseId | null;
  /** 已完成階段的耗時 / Timings of the finished phases */
  phases: RoundPhaseTiming[];
  /** 回合摘要 / The round's summary */
  result?: RoundResult;
  /** 失敗原因 / Why it failed */
  error?: string;
}

/**
 * 工作登錄簿（掛在 globalThis 上）。
 * The job registry (hung off globalThis).
 */
const REGISTRY_KEY = '__autonomousWorldRoundJobs';
type Registry = Map<string, RoundJobState>;

function registry(): Registry {
  const globalScope = globalThis as unknown as Record<string, Registry | undefined>;
  if (!globalScope[REGISTRY_KEY]) globalScope[REGISTRY_KEY] = new Map<string, RoundJobState>();
  return globalScope[REGISTRY_KEY]!;
}

/** 某個世界目前的工作（沒有就 null）/ The world's current job, or null */
export function getRoundJob(worldId: string): RoundJobState | null {
  return registry().get(worldId) ?? null;
}

/**
 * 「下一回合正在跑」的持久化狀態 + 看門狗自癒。
 * The persisted "a round is running" state + the watchdog's self-healing.
 *
 * `World.roundRunning` 是**重整後的頁面**也要能立刻看到的真相（工作狀態本身住在
 * globalThis，行程重啟就沒了）。看門狗只在自己的行程裡沒有 running 的工作、而旗標
 * 又超過 `ROUND_RUNNING_WATCHDOG_MS` 未清時動手——旗標掛著而工作還活著（遠端
 * 資料庫上的一回合真的超過 5 分鐘）不自癒，否則會把還在跑的回合「解鎖」成可再點。
 *
 * `World.roundRunning` is the truth a **refreshed** page must see immediately (the
 * job state itself lives on globalThis and dies with the process). The watchdog only
 * fires when this process holds no running job AND the flag has stayed set past
 * `ROUND_RUNNING_WATCHDOG_MS` — a flag up while the job is still alive (a round
 * genuinely exceeding 5 minutes on a remote database) is left alone, or the watchdog
 * would "unlock" a round that is still running.
 *
 * 每個會讓讀者重新看到按鈕的入口（輪詢 GET、入隊 POST、世界狀態 GET）都呼叫一次，
 * 所以即使沒有人輪詢 admin 端點，一次頁面重整也足以解鎖。
 * Every entry point that re-surfaces the button to a reader (the polling GET, the
 * enqueue POST, the world-state GET) calls this once, so a single page refresh is
 * enough to clear a stall even when nobody polls the admin endpoint.
 */
export interface RoundRunFlag {
  /** 旗標現在是否為 true / Whether the flag is currently set */
  running: boolean;
  /** 這次呼叫是否自癒解鎖了卡死的旗標 / Whether THIS call healed a stalled flag */
  healed: boolean;
  /** 旗標的開始時間（ISO，僅 running 時）/ When the flag was set (ISO, only while running) */
  startedAt: string | null;
}

export async function reconcileRoundRunFlag(worldId: string): Promise<RoundRunFlag> {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: { roundRunning: true, roundStartedAt: true },
  });
  if (!world?.roundRunning || !world.roundStartedAt) {
    return { running: false, healed: false, startedAt: null };
  }
  const startedAt = world.roundStartedAt.toISOString();
  const jobStillRunning = registry().get(worldId)?.status === 'running';
  const elapsed = Date.now() - world.roundStartedAt.getTime();
  if (jobStillRunning || elapsed <= CONFIG.ROUND_RUNNING_WATCHDOG_MS) {
    return { running: true, healed: false, startedAt };
  }
  // 卡死：行程重啟丟掉了工作，或工作結束的 finally 沒跑成 /
  // Stalled: a restart dropped the job, or the finishing finally never ran
  await prisma.world.update({
    where: { id: worldId },
    data: { roundRunning: false, roundStartedAt: null },
  });
  return { running: false, healed: true, startedAt: null };
}

/** 啟動結果 / The outcome of a start attempt */
export type StartRoundJobResult =
  | { ok: true; job: RoundJobState }
  | { ok: false; reason: 'running'; job: RoundJobState }
  | { ok: false; reason: 'stale'; currentRound: number };

/**
 * 啟動一個回合工作。**不會**等待它跑完——POST 端點要立刻回應。
 * Start a round job. It does **not** wait for it to finish - the POST endpoint has to
 * answer immediately.
 */
export async function startRoundJob(
  worldId: string,
  expectedRound: number | null
): Promise<StartRoundJobResult> {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: { currentRound: true },
  });
  if (!world) throw new Error('World not found');

  // 已經有工作在跑：不要再排一個 / A job is already running: do not queue another
  const running = registry().get(worldId);
  if (running && running.status === 'running') {
    return { ok: false, reason: 'running', job: running };
  }

  // 冪等：客戶端認為的下一回合與實際不符 → 409，不重跑 / Idempotency: the client's
  // idea of the next round disagrees with reality -> 409, never replay
  if (expectedRound !== null && expectedRound !== world.currentRound) {
    return { ok: false, reason: 'stale', currentRound: world.currentRound };
  }

  const job: RoundJobState = {
    id: `job-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    worldId,
    round: world.currentRound,
    status: 'running',
    startedAt: new Date().toISOString(),
    currentPhase: null,
    phases: [],
  };
  registry().set(worldId, job);

  // 持久化旗標：重整後的頁面靠 World.roundRunning 立刻知道「正在跑」/
  // The persisted flag: a refreshed page reads World.roundRunning to know
  // "a round is running" at once
  //
  // **旗標寫入失敗不能攔下回合本身**：registry 已在上一行放了 running 的工作，
  // 若這次 update 拋錯（DB 瞬時抖動），startRoundJob 會 reject → POST 500，但
  // 工作卡在 registry 裡永遠 'running'、回合卻沒開跑——之後每一次啟動都被 409。
  // 寧可回合照跑、旗標缺席（DB 真壞了回合自己也會失敗，finally 的清除是空操作），
  // 也不要讓 enqueue 的輔助寫入毀掉唯一重要的事：回合繼續。
  //
  // **A failed flag write must not stop the round itself**: the registry already
  // holds the running job from the line above. If this update throws (a DB
  // blip), startRoundJob rejects → POST 500 — and the job is stuck 'running' in
  // the registry while the round never started, so every future start 409s until
  // a process restart. Prefer the round running with the flag missing (if the DB
  // is truly down the round fails on its own, and finally's clear is a no-op)
  // over letting an enqueue side-write kill the one thing that matters: the
  // round goes on.
  await prisma.world
    .update({
      where: { id: worldId },
      data: { roundRunning: true, roundStartedAt: new Date() },
    })
    .catch(() => {});

  // 背景執行：請求已經回應了，工作還在跑 / Background execution: the request has
  // answered, the work is still going
  void (async () => {
    try {
      const result = await runRound(worldId, {
        onPhase: (id) => {
          job.currentPhase = id;
        },
        onPhaseDone: (timing) => {
          job.phases.push(timing);
        },
      });
      job.result = result;
      job.phases = result.phases;
      job.status = 'done';
      job.currentPhase = null;
    } catch (error) {
      job.status = 'failed';
      job.currentPhase = null;
      job.error = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      job.finishedAt = new Date().toISOString();
      // 成功與失敗都清旗標：按鈕必須解鎖，而 finally 是「回合不再執行中」的
      // 唯一匯合點。清不掉不該炸掉工作收尾——看門狗會兜底。
      // Clear the flag on success AND failure: the button must unlock, and
      // finally is the only convergence point of "the round is no longer
      // executing". A failed clear must not blow up the job's own cleanup —
      // the watchdog catches it.
      await prisma.world
        .update({
          where: { id: worldId },
          data: { roundRunning: false, roundStartedAt: null },
        })
        .catch(() => {});
    }
  })();

  return { ok: true, job };
}