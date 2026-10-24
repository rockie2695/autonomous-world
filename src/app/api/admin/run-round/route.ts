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
// POST /api/admin/run-round      body: { expectedRound?: number }
// 回應 / Response: 202 { success: true, job }
// GET  /api/admin/run-round      → { job: RoundJobState | null, currentRound }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';
import { getRoundJob, startRoundJob } from '../../../../../server/roundJob';

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

  // 尋找活躍的世界 / Find the active world
  const world = await prisma.world.findFirst({
    where: { active: true },
  });

  if (!world) {
    return NextResponse.json(
      { error: 'No active world found' },
      { status: 404 }
    );
  }

  // 冪等鍵：客戶端認為的「下一回合」。對不上就拒絕（409），不重跑已完成的回合 /
  // The idempotency key: the round the client believes is next. A mismatch is
  // refused (409) rather than replaying a finished round.
  let expectedRound: number | null = null;
  try {
    const body = (await request.json()) as { expectedRound?: unknown };
    if (typeof body?.expectedRound === 'number' && Number.isInteger(body.expectedRound)) {
      expectedRound = body.expectedRound;
    }
  } catch {
    // 沒有 body 也沒關係：只是不做過期檢查 / No body is fine: it just skips the
    // staleness check
  }

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

export async function GET() {
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
  const world = await prisma.world.findFirst({
    where: { active: true },
  });
  if (!world) {
    return NextResponse.json(
      { error: 'No active world found' },
      { status: 404 }
    );
  }
  return NextResponse.json({
    job: getRoundJob(world.id),
    currentRound: world.currentRound,
  });
}