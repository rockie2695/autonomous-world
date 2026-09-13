// ============================================================================
// API 路由 — 取得回合事件 / API Route — Get Events for a Round
// ============================================================================
// 回傳特定回合中發生的所有事件。
// Returns all events that occurred in a specific round.
//
// GET /api/world/events?round=N
// 查詢參數 / Query params:
//   round（必填）— 要取得事件的回合數 / round (required) — Round number to fetch events for
// 回應 / Response: { events: Event[] }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { EventsQuerySchema } from '@/lib/validations';

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
  const queryResult = EventsQuerySchema.safeParse({
    round: searchParams.get('round'),
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: queryResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { round } = queryResult.data;

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

  // 取得此回合的事件 / Fetch events for this round
  const events = await prisma.event.findMany({
    where: {
      worldId: world.id,
      round,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ events });
}
