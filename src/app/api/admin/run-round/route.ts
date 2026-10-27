// ============================================================================
// API 路由 — 執行下一回合（僅管理員）/ API Route — Run Next Round (Admin Only)
// ============================================================================
// 觸發下一個遊戲回合的執行。**回合在背景跑**：POST 立刻回 202，前端輪詢
// GET 拿進度。回合本身要 30 秒左右，放在請求裡會被任何代理或平台逾時掐斷，
// 而 `currentRound` 只在全部階段跑完才 +1——被掐斷的回合會在下一次嘗試時從
// 階段 1 重跑，前面的寫入被重複套用。
//
// Triggers execution of the next game round. **The round runs in the background**:
// the POST answers 202 immediately and the client polls GET for progress. A round
// takes ~30 seconds, and running it inside the request means any proxy or
// platform timeout cuts it in half - and since currentRound only increments after
// every phase, a cut round replays from phase 1 and re-applies the earlier writes.
//
// POST /api/admin/run-round      body: { expectedRound?: number, worldId?: string }
// 回應 / Response: 202 { success: true, job }
// GET  /api/admin/run-round[?worldId=...] → { job, currentRound, roundRunning, roundStalled }
// 目標世界 = `worldId`（admin 明確指定，可對**任何**世界跑回合）；
// 未帶 worldId 時 = 目前選中的世界（cookie，見 src/lib/worldSelect.ts）。
// The target world = `worldId` (an admin's explicit pick — rounds can be run on
// ANY world); without it = the currently selected world (the cookie, see
// src/lib/worldSelect.ts).
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';
import { getSelectedWorldId } from '@/lib/worldSelect';
import {
  getRoundJob,
  startRoundJob,
  reconcileRoundRunFlag,
} from '../../../../../server/roundJob';

/**
 * 解析本次請求的目標世界：`worldId`（admin 明確指定，可對任何世界跑回合）優先，
 * 否則用選中的世界（cookie，fallback active）。指定的 id 必須真的存在。
 * Resolves the request's target world: an explicit `worldId` (an admin's pick —
 * rounds can be run on ANY world) wins; otherwise the selected world (the cookie,
 * falling back to active). A given id must actually exist.
 *
 * @returns `{ ok: true, world }` 或 `{ ok: false, status, error }` /
 *   `{ ok: true, world }` or `{ ok: false, status, error }`
 */
async function resolveTargetWorld(
  explicitWorldId: string | null
): Promise<
  | { ok: true; world: { id: string; currentRound: number } }
  | { ok: false; status: number; error: string }
> {
  if (explicitWorldId !== null) {
    const found = await prisma.world.findUnique({
      where: { id: explicitWorldId },
      select: { id: true, currentRound: true },
    });
    if (!found) {
      return { ok: false, status: 404, error: 'World not found' };
    }
    return { ok: true, world: found };
  }
  const selected = await getSelectedWorldId();
  if (!selected) {
    return { ok: false, status: 404, error: 'No world found' };
  }
  const found = await prisma.world.findUniqueOrThrow({
    where: { id: selected },
    select: { id: true, currentRound: true },
  });
  return { ok: true, world: found };
}

export async function POST(request: Request) {
  // 檢查認證 / Check authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 檢查管理員狀態 / Check admin status
  if (!(await isAdmin(session))) {
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    );
  }

  // 冪等鍵：客戶端認為的「下一回合」。對不上就拒絕（409），不重跑已完成的回合 /
  // The idempotency key: the round the client believes is next. A mismatch is
  // refused (409) rather than replaying a finished round.
  // 目標世界：body 帶 `worldId` 就對**那個**世界跑回合（admin 明確指定）；沒帶就用
  // 選中的世界（cookie）。
  // Target world: a `worldId` in the body runs the round on **that** world (an
  // admin's explicit pick); without one, the selected world (the cookie).
  let expectedRound: number | null = null;
  let explicitWorldId: string | null = null;
  try {
    const body = (await request.json()) as {
      expectedRound?: unknown;
      worldId?: unknown;
    };
    if (typeof body?.expectedRound === 'number' && Number.isInteger(body.expectedRound)) {
      expectedRound = body.expectedRound;
    }
    if (typeof body?.worldId === 'string' && body.worldId.length > 0) {
      explicitWorldId = body.worldId;
    }
  } catch {
    // 沒有 body 也沒關係：只是不做過期檢查 / No body is fine: it just skips the
    // staleness check
  }

  const resolved = await resolveTargetWorld(explicitWorldId);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status }
    );
  }
  const world = resolved.world;

  // 先自癒一次：一個卡死的 roundRunning 旗標若放著，這次 POST 會被視為「已有
  // 工作在跑」的錯誤場景。自癒後旗標為 false，正常入隊。
  // Heal first: a stalled roundRunning flag left set would make this POST read as
  // the "a job is already running" case. Once healed the flag is false and the
  // enqueue proceeds normally.
  await reconcileRoundRunFlag(world.id);

  const started = await startRoundJob(world.id, expectedRound);
  if (!started.ok) {
    if (started.reason === 'running') {
      // 已經有回合在跑：回報現況，而不是排第二個回合 / A round is already
      // running: report the state instead of queueing a second one
      return NextResponse.json(
        { error: 'A round is already running', job: started.job },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Round already advanced', currentRound: started.currentRound },
      { status: 409 }
    );
  }

  // 202：工作已經開始，但還沒跑完 / 202: the job has started, but has not finished
  return NextResponse.json({ success: true, job: started.job }, { status: 202 });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  if (!(await isAdmin(session))) {
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    );
  }
  // `?worldId=` 可查**任何**世界的執行狀態；不帶就查選中的世界 /
  // `?worldId=` queries ANY world's running state; without it, the selected world
  let explicitWorldId: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('worldId');
    if (q !== null && q.length > 0) explicitWorldId = q;
  } catch {
    // URL 解析失敗就走選中世界 / A URL parse failure falls back to the selected world
  }
  const resolved = await resolveTargetWorld(explicitWorldId);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status }
    );
  }
  const world = resolved.world;
  // 輪詢是看門狗的常態入口：每次都被叫一次。旗標 + 記憶體工作一起回，客端
  // 「重整後按鈕立刻鎖上」靠這裡的 roundRunning。
  // The poll is the watchdog's routine entry point: called on every poll. The flag
  // and the in-memory job travel together — the client's "the button re-locks the
  // moment the page refreshes" rides on this roundRunning field.
  const flag = await reconcileRoundRunFlag(world.id);
  return NextResponse.json({
    job: getRoundJob(world.id),
    currentRound: world.currentRound,
    roundRunning: flag.running,
    roundStalled: flag.healed,
  });
}