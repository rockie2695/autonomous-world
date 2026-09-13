// ============================================================================
// API 路由 — 執行下一回合（僅管理員）/ API Route — Run Next Round (Admin Only)
// ============================================================================
// 觸發下一個遊戲回合的執行。
// Triggers execution of the next game round.
// 僅管理員使用者可存取。
// Only accessible by admin users.
//
// POST /api/admin/run-round
// 標頭 / Headers: Authorization: Bearer <token> 或基於 session 的認證 / or session-based auth
// 回應 / Response: { success: true, round: number, duration: number }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';

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

  // 待辦：匯入並呼叫 runRound 函數
  // TODO: Import and call runRound function
  // import { runRound } from '@/server/runRound';
  // const startTime = Date.now();
  // await runRound(world.id);
  // const duration = Date.now() - startTime;

  // 目前回傳佔位回應 / For now, return a placeholder response
  return NextResponse.json({
    success: true,
    message: 'Round execution not yet implemented',
    round: world.currentRound,
  });
}
