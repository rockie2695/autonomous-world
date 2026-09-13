// ============================================================================
// API 路由 — 取得可用回合 / API Route — Get Available Rounds
// ============================================================================
// 回傳所有有快照的回合列表。
// Returns a list of all rounds with snapshots.
//
// GET /api/world/rounds
// 回應 / Response: { rounds: number[], total: number }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
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

  // 從快照取得所有可用回合號碼 / Get all available round numbers from snapshots
  const snapshots = await prisma.roundSnapshot.findMany({
    where: { worldId: world.id },
    select: { round: true },
    orderBy: { round: 'desc' },
  });

  const rounds = snapshots.map((s) => s.round);

  return NextResponse.json({
    rounds,
    total: rounds.length,
    currentRound: world.currentRound,
  });
}
