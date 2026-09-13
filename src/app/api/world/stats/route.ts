// ============================================================================
// API 路由 — 取得統計資料（圖表資料）/ API Route — Get Statistics (Chart Data)
// ============================================================================
// 回傳統計圖表的時間序列資料。
// Returns time-series data for statistics charts.
//
// GET /api/world/stats?from=A&to=B
// 查詢參數 / Query params:
//   from（必填）— 起始回合數 / from (required) — Start round number
//   to（必填）— 結束回合數 / to (required) — End round number
// 回應 / Response: {
//   rounds: number[],
//   territories: number[],  // 每回合的勢力領地數 / Faction territory counts per round
//   troops: number[],       // 每回合的總兵力 / Total troops per round
//   gold: number[],         // 每回合的總金幣 / Total gold per round
//   characters: number[],   // 每回合的角色數 / Character counts per round
// }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { StatsQuerySchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 使用 Zod 驗證查詢參數 / Validate query parameters with Zod
  const { searchParams } = new URL(request.url);
  const queryResult = StatsQuerySchema.safeParse({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: queryResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { from, to } = queryResult.data;

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

  // 取得範圍內的快照 / Fetch snapshots for the range
  const snapshots = await prisma.roundSnapshot.findMany({
    where: {
      worldId: world.id,
      round: { gte: from, lte: to },
    },
    orderBy: { round: 'asc' },
  });

  // 解壓縮並提取統計資料 / Decompress and extract stats
  const rounds: number[] = [];
  const territories: number[] = [];
  const troops: number[] = [];
  const gold: number[] = [];
  const characters: number[] = [];

  for (const snapshot of snapshots) {
    // 待辦：解壓縮快照並提取統計資料 / TODO: Decompress snapshot and extract stats
    // 目前回傳佔位資料 / For now, return placeholder data
    rounds.push(snapshot.round);
    territories.push(0);
    troops.push(0);
    gold.push(0);
    characters.push(0);
  }

  return NextResponse.json({
    rounds,
    territories,
    troops,
    gold,
    characters,
  });
}
