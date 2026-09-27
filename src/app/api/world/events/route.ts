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

  // 讀取時 enrich：CHARACTER_MOVED 只存 placeId，補上地名（讀取時 join 讓
  // 舊事件也能顯示地名，不需回填資料庫）/
  // Read-time enrichment: CHARACTER_MOVED stores only placeIds — join place
  // names here so LEGACY events also render names without a DB backfill.
  const movedPlaceIds = new Set<string>();
  for (const event of events) {
    if (event.type === 'CHARACTER_MOVED') {
      const data = event.data as { fromPlaceId?: string; toPlaceId?: string };
      if (data.fromPlaceId) movedPlaceIds.add(data.fromPlaceId);
      if (data.toPlaceId) movedPlaceIds.add(data.toPlaceId);
    }
  }

  let placeNameById: Map<string, string> | null = null;
  if (movedPlaceIds.size > 0) {
    const places = await prisma.place.findMany({
      where: { id: { in: [...movedPlaceIds] } },
      select: { id: true, name: true },
    });
    placeNameById = new Map(places.map((p) => [p.id, p.name]));
  }

  const enriched = placeNameById
    ? events.map((event) => {
        if (event.type !== 'CHARACTER_MOVED') return event;
        const data = event.data as { fromPlaceId?: string; toPlaceId?: string };
        return {
          ...event,
          data: {
            ...data,
            fromPlaceName: data.fromPlaceId
              ? placeNameById.get(data.fromPlaceId) ?? null
              : null,
            toPlaceName: data.toPlaceId
              ? placeNameById.get(data.toPlaceId) ?? null
              : null,
          },
        };
      })
    : events;

  return NextResponse.json({ events: enriched });
}
